const { afterEach, beforeEach, describe, expect, it } = require('bun:test');
/**
 * src/db/transaction.ts (task 10) against a real temp-file SQLite DB (a file,
 * not :memory:, so a second connection can observe what was committed).
 */
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');
const { Database } = require('bun:sqlite');
const { createDb, migrateDb } = require('../../../src/db');
const { transaction, inTransaction } = require('../../../src/db/transaction');
const Users = require('../../../src/db/repositories/users');
const Mats  = require('../../../src/db/repositories/mats');
const MatCodes = require('../../../src/db/repositories/matCodes');

let dir;
let file;
let db;
let observer;

beforeEach(() => {
    dir  = fs.mkdtempSync(path.join(os.tmpdir(), 'accord-tx-'));
    file = path.join(dir, 'test.sqlite');
    db   = createDb({ path: file });
    migrateDb(db);
    observer = new Database(file, { readonly: true });
});

afterEach(() => {
    observer.close();
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
});

const countUsers = () => observer.query('SELECT count(*) AS n FROM users').get().n;
const tick = () => new Promise((r) => setTimeout(r, 1));

describe('transaction()', () => {
    it('commits the callback\'s writes and resolves to its return value', async () => {
        const result = await transaction(db, async (tx) => {
            const user = await Users.insertUser(tx, { name: 'a' });
            await tick();
            await Users.insertUser(tx, { name: 'b' });
            expect(countUsers()).toBe(0); // not visible to another connection before COMMIT
            return user.id;
        });
        expect(typeof result).toBe('string');
        expect(countUsers()).toBe(2);
        expect(db.$client.inTransaction).toBe(false);
    });

    it('rolls back EVERY write, including those after an await, and rethrows the same error', async () => {
        const boom = new Error('boom');
        await expect(transaction(db, async (tx) => {
            await Users.insertUser(tx, { name: 'a' });
            await tick();
            await Users.insertUser(tx, { name: 'b' });
            throw boom;
        })).rejects.toBe(boom);
        expect(countUsers()).toBe(0);
        expect(db.$client.inTransaction).toBe(false);
    });

    it('rolls back on a constraint error inside (the MatsController#postIndex shape)', async () => {
        const creator = await Users.insertUser(db, { name: 'creator' });
        await MatCodes.insertMatCode(db, { mat_id: 'other', code: 'taken.code.here', role: 'admin' });
        await expect(transaction(db, async (tx) => {
            const mat = await Mats.insertMat(tx, { name: 'm', creator_id: creator.id });
            await MatCodes.insertMatCode(tx, { mat_id: mat.id, code: 'fresh.code.here', role: 'admin' });
            await MatCodes.insertMatCode(tx, { mat_id: mat.id, code: 'taken.code.here', role: 'viewer' });
        })).rejects.toThrow(/UNIQUE/);
        expect(observer.query('SELECT count(*) AS n FROM mats').get().n).toBe(0);
        expect(observer.query('SELECT count(*) AS n FROM mat_codes').get().n).toBe(1);
    });

    it('accepts a synchronous callback', async () => {
        expect(await transaction(db, () => 7)).toBe(7);
    });

    it('nested transaction() is a SAVEPOINT: inner rollback keeps outer work', async () => {
        await transaction(db, async (tx) => {
            await Users.insertUser(tx, { name: 'outer' });
            await expect(transaction(tx, async (inner) => {
                await Users.insertUser(inner, { name: 'inner' });
                throw new Error('inner');
            })).rejects.toThrow('inner');
            expect(await transaction(tx, async (inner) => (await Users.insertUser(inner, { name: 'inner-ok' })).name)).toBe('inner-ok');
        });
        expect(observer.query('SELECT name FROM users ORDER BY name').all().map((r) => r.name)).toEqual(['inner-ok', 'outer']);
    });

    it('an error escaping a nested transaction rolls back the whole outer one', async () => {
        await expect(transaction(db, async (tx) => {
            await Users.insertUser(tx, { name: 'outer' });
            await transaction(tx, async (inner) => { await Users.insertUser(inner, { name: 'inner' }); throw new Error('x'); });
        })).rejects.toThrow('x');
        expect(countUsers()).toBe(0);
    });

    it('serialises concurrent top-level transactions on one connection', async () => {
        const events = [];
        const run = (label, fail) => transaction(db, async (tx) => {
            events.push(`${label}:begin`);
            await Users.insertUser(tx, { name: label });
            await tick();
            events.push(`${label}:end`);
            if (fail) throw new Error(label);
        });
        const results = await Promise.allSettled([run('a', true), run('b', false)]);
        expect(events).toEqual(['a:begin', 'a:end', 'b:begin', 'b:end']);
        expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
        expect(observer.query('SELECT name FROM users').all().map((r) => r.name)).toEqual(['b']);
    });

    it('inTransaction() reflects the async context', async () => {
        expect(inTransaction(db)).toBe(false);
        await transaction(db, async (tx) => {
            await tick();
            expect(inTransaction(tx)).toBe(true);
        });
        expect(inTransaction(db)).toBe(false);
    });
});

describe('why not Drizzle\'s own db.transaction() (pins the bun-sqlite limitation)', () => {
    it('with an async callback it commits at the first await, so a later throw rolls back nothing', async () => {
        let settled;
        try {
            const p = db.transaction(async (tx) => {
                await Users.insertUser(tx, { name: 'a' });
                throw new Error('too late');
            });
            await p;
        } catch (err) {
            settled = err;
        }
        expect(settled?.message).toBe('too late');
        expect(countUsers()).toBe(1);
    });
});
