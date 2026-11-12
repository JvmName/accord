/**
 * Real-HTTP test harness.
 *
 * Boots an actual `ApplicationServer` on a free port against a throwaway
 * SQLite database under $TMPDIR, so tests can drive the server the way a client
 * does, with `fetch`, rather than through internal classes.
 *
 * `DATABASE_PATH` is set before anything can open a connection, so the
 * configured development and test databases are never touched.
 */
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';


/**
 * Point every connection at a fresh, empty SQLite file. Must be called before
 * anything opens a connection (connections open lazily, so "before the first
 * query" is enough, but earliest is safest).
 */
function useTemporaryDatabase(label = 'accord-char') {
    const file = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`)),
        'database.sqlite',
    );
    process.env.DATABASE_PATH = file;
    return file;
}


/** Creates the schema in the `DATABASE_PATH` database (the Drizzle migrations). */
async function migrate() {
    const { createDb, migrateDb } = require('../../src/db');
    if (!process.env.DATABASE_PATH) throw new Error('call useTemporaryDatabase() before migrate()');
    const db = createDb({ path: process.env.DATABASE_PATH });
    try {
        migrateDb(db);
    } finally {
        db.$client.close();
    }
}


function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.unref();
        probe.on('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address() as net.AddressInfo;
            probe.close(() => resolve(port));
        });
    });
}


/**
 * Boots an ApplicationServer and resolves once it answers requests.
 *
 * `ApplicationServer#listen()` is fire-and-forget and exposes neither the http
 * server nor a ready promise, so readiness is established by polling the
 * always-registered health check.
 */
async function startServer({ timeoutMs = 10000, serverOptions = {} } = {}) {
    const { ApplicationServer } = require('../../src/http/server');

    const port   = await freePort();
    const server = new ApplicationServer({ ...serverOptions, port });
    const origin = `http://127.0.0.1:${port}`;

    await server.listen();

    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            const res = await fetch(`${origin}/system/healthCheck`);
            if (res.ok) break;
        } catch (err) {
            if (Date.now() > deadline) throw new Error(`server did not come up on ${origin}: ${(err as Error).message}`);
        }
        if (Date.now() > deadline) throw new Error(`server did not come up on ${origin}`);
        await new Promise(r => setTimeout(r, 25));
    }

    return { server, origin, port };
}


/**
 * Issues one request and returns `{ status, body }`, where `body` is the parsed
 * JSON envelope (`{ data, status }`) or `null` for an empty response.
 */
function makeClient(origin: string) {
    return async function request(method: string, routePath: string, { token, body, headers = {} }: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
        const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers: { ...headers } };

        if (token) init.headers['x-api-token'] = token;
        if (body !== undefined) {
            init.headers['content-type'] = 'application/json';
            init.body = JSON.stringify(body);
        }

        const res  = await fetch(`${origin}${routePath}`, init);
        const text = await res.text();

        let parsed: any = null; // whatever JSON (or text) the route answered
        if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }

        return { status: res.status, body: parsed };
    };
}


export {
    freePort,
    makeClient,
    migrate,
    startServer,
    useTemporaryDatabase,
};
