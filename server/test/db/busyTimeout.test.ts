/**
 * Lock contention between the Drizzle connection (bun:sqlite) and a
 * connection opened the way the legacy stack opens it (the sqlite3 driver,
 * which Sequelize uses in the web and worker processes) on the same file.
 *
 * The other connection runs in a child process, as the worker does in
 * production: bun:sqlite waits for a lock synchronously, so a lock holder in
 * this same process could never release it while we wait.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BUSY_TIMEOUT_MS, createDb, migrateDb, type Db } from '../../src/db';
import { insertUser } from '../../src/db/repositories/users';

const SERVER_ROOT = path.join(__dirname, '..', '..');

/** Child: opens `file` with the sqlite3 driver, takes the write lock, holds it `holdMs`, commits. */
const HOLD_LOCK = `
const sqlite3 = require('sqlite3');
const [file, holdMs] = [process.argv[1], Number(process.argv[2])];
const db = new sqlite3.Database(file);
db.exec("BEGIN IMMEDIATE; INSERT INTO users (id, name, api_token, created_at, updated_at) VALUES ('child-user', 'child', 'child-token', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');", err => {
    if (err) { console.log('ERROR ' + err.code); process.exit(1); }
    console.log('LOCKED');
    setTimeout(() => db.exec('COMMIT', err2 => { console.log(err2 ? 'ERROR ' + err2.code : 'COMMITTED'); db.close(() => process.exit(0)); }), holdMs);
});
`;

/** Child: inserts one row with the sqlite3 driver's default busy timeout and reports how it went. */
const INSERT_ROW = `
const sqlite3 = require('sqlite3');
const file = process.argv[1];
const db = new sqlite3.Database(file, () => {
    console.log('READY');
    const started = Date.now();
    db.run("INSERT INTO users (id, name, api_token, created_at, updated_at) VALUES ('waiting-user', 'w', 'w-token', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')", err => {
        console.log(JSON.stringify({ code: err ? err.code : null, waitedMs: Date.now() - started }));
        db.close(() => process.exit(0));
    });
});
`;

function spawnChild(script: string, args: string[]) {
    return Bun.spawn(['bun', '-e', script, ...args], { cwd: SERVER_ROOT, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
}

/** Reads a child's stdout incrementally. */
function outputOf(child: ReturnType<typeof spawnChild>) {
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();
    let seen = '';
    return {
        /** Resolves once `line` has been printed. */
        async waitFor(line: string): Promise<void> {
            while (!seen.split('\n').includes(line)) {
                const { value, done } = await reader.read();
                if (done) throw new Error(`child exited before printing ${line}; output: ${seen}`);
                seen += decoder.decode(value);
            }
        },
        /** Everything printed, once the child has closed its stdout. */
        async all(): Promise<string> {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) return seen;
                seen += decoder.decode(value);
            }
        },
    };
}

async function waitForLine(child: ReturnType<typeof spawnChild>, line: string): Promise<void> {
    await outputOf(child).waitFor(line);
}

function busyCode(fn: () => unknown): { code: string | null; elapsedMs: number } {
    const started = performance.now();
    try {
        fn();
        return { code: null, elapsedMs: performance.now() - started };
    } catch (err) {
        let current: any = err;
        while (current && !current.code && current.cause) current = current.cause;
        return { code: current?.code ?? String(err), elapsedMs: performance.now() - started };
    }
}

describe('busy timeout shared with the legacy connections', () => {
    let file: string;
    let db: Db;

    beforeEach(() => {
        file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'accord-busy-')), 'database.sqlite');
        db = createDb({ path: file });
        migrateDb(db);
    });

    afterEach(() => db.$client.close());

    it('sets the same busy timeout the sqlite3 driver uses (1000 ms)', () => {
        expect(BUSY_TIMEOUT_MS).toBe(1000);
        expect(db.$client.query('PRAGMA busy_timeout').get()).toEqual({ timeout: 1000 });
    });

    it('a Drizzle write waits for a lock held by a legacy-style connection instead of failing', async () => {
        const child = spawnChild(HOLD_LOCK, [file, '300']);
        await waitForLine(child, 'LOCKED');

        // Synchronous: blocks until the child commits (about 300 ms).
        const started = performance.now();
        const user = await insertUser(db, { name: 'waited' });
        const elapsedMs = performance.now() - started;

        expect(user.name).toBe('waited');
        expect(elapsedMs).toBeGreaterThan(150);
        expect(elapsedMs).toBeLessThan(BUSY_TIMEOUT_MS);
        await child.exited;
        expect(db.$client.query("SELECT name FROM users WHERE id = 'child-user'").get()).toEqual({ name: 'child' });
    }, 10000);

    it('without the pragma the same write fails at once with SQLITE_BUSY (the test is not vacuous)', async () => {
        const raw = new Database(file);
        try {
            expect(raw.query('PRAGMA busy_timeout').get()).toEqual({ timeout: 0 });
            const child = spawnChild(HOLD_LOCK, [file, '300']);
            await waitForLine(child, 'LOCKED');

            const result = busyCode(() => raw.run("INSERT INTO users (id, name, api_token, created_at, updated_at) VALUES ('raw', 'r', 'r-token', 'x', 'x')"));
            expect(result.code).toBe('SQLITE_BUSY');
            expect(result.elapsedMs).toBeLessThan(100);
            await child.exited;
        } finally {
            raw.close();
        }
    }, 10000);

    it('gives up with SQLITE_BUSY once the lock is held longer than the timeout', async () => {
        const child = spawnChild(HOLD_LOCK, [file, '2500']);
        await waitForLine(child, 'LOCKED');

        const started = performance.now();
        let code: string | null = null;
        try {
            await insertUser(db, { name: 'gives up' });
        } catch (err) {
            let current: any = err;
            while (current && !current.code && current.cause) current = current.cause;
            code = current?.code ?? String(err);
        }
        const elapsedMs = performance.now() - started;

        expect(code).toBe('SQLITE_BUSY');
        expect(elapsedMs).toBeGreaterThan(BUSY_TIMEOUT_MS * 0.8);
        expect(elapsedMs).toBeLessThan(2400);
        await child.exited;
    }, 10000);

    it('a legacy-style write waits for a lock held by the Drizzle connection', async () => {
        db.$client.run('BEGIN IMMEDIATE');
        await insertUser(db, { name: 'holder' });

        const child = spawnChild(INSERT_ROW, [file]);
        const output = outputOf(child);
        await output.waitFor('READY');
        // Hold the lock for 300 ms without blocking this process's event loop.
        await new Promise(resolve => setTimeout(resolve, 300));
        db.$client.run('COMMIT');

        const report = JSON.parse((await output.all()).trim().split('\n').pop() as string);
        expect(report.code).toBeNull();
        expect(report.waitedMs).toBeGreaterThan(100);
        expect(db.$client.query("SELECT name FROM users WHERE id = 'waiting-user'").get()).toEqual({ name: 'w' });
    }, 10000);
});
