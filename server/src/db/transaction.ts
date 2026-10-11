/**
 * `transaction()` for the Drizzle data-access layer (server-ts task 10),
 * replacing `BaseRecord.transaction(callback)`.
 *
 * WHY NOT `db.transaction()`: Drizzle's bun-sqlite driver is synchronous. Its
 * `db.transaction(cb)` wraps `cb` in bun:sqlite's native transaction, which
 * COMMITs as soon as `cb` returns. With an `async` callback that is the first
 * `await`, so everything after it runs outside the transaction and a later
 * throw rolls nothing back. Every legacy call site (and every repository
 * function) is async, so this module drives BEGIN/COMMIT/ROLLBACK itself.
 *
 * SEMANTICS
 *  - `transaction(db, async (tx) => ...)` runs the callback inside
 *    `BEGIN DEFERRED` (Sequelize's SQLite default; pass `{behavior}` to
 *    change) and COMMITs when it resolves. If it throws/rejects, the
 *    transaction is ROLLED BACK and the error is rethrown unchanged.
 *  - Resolves to the callback's return value.
 *  - `tx` is the same Drizzle handle as `db` (one SQLite connection): pass it
 *    to repository functions as usual.
 *  - Nested `transaction(tx, ...)` calls made from inside the callback (same
 *    async context) become SAVEPOINTs: an inner failure rolls back only the
 *    inner work if the outer callback catches it.
 *  - Top-level transactions on one connection are serialised by an in-process
 *    queue, so two concurrent requests never interleave BEGIN/COMMIT.
 *
 * CAVEAT (single connection): a query issued on the same `db` by code that is
 * NOT inside a transaction (e.g. another concurrent request) while one is open
 * executes inside that open transaction, and shares its commit or rollback.
 * Queries are not routed through the queue. Accepted for now; the server has
 * one connection per process (task 14/18 may revisit).
 *
 * DIFFERENCES FROM THE LEGACY `BaseRecord.transaction` (FINDINGS F-50):
 * the legacy helper was NOT atomic (the callback's queries ran on Sequelize's
 * default connection, outside the transaction, with no CLS) and always
 * resolved to `undefined`. Call sites (MatsController#postIndex,
 * Match#start/end) ignore the return value and the `Transaction` argument.
 * Whether their ports use this real transaction (a behaviour change on error
 * paths) is decided by task 10b / 13a, not here.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { Db } from './index';

export type TransactionBehavior = 'deferred' | 'immediate' | 'exclusive';

export interface TransactionOptions {
    /** SQLite BEGIN mode for a top-level transaction. Default `'deferred'`. */
    behavior?: TransactionBehavior;
}

interface ActiveTransaction {
    client: object;
    depth: number;
}

const active = new AsyncLocalStorage<ActiveTransaction>();
const queues = new WeakMap<object, Promise<void>>();

/** Run `fn` atomically on `db`'s connection; see the module comment. */
export async function transaction<T>(
    db: Db,
    fn: (tx: Db) => Promise<T> | T,
    options: TransactionOptions = {},
): Promise<T> {
    const client = db.$client;
    const current = active.getStore();

    if (current && current.client === client) {
        return await savepoint(db, current, fn);
    }

    // Serialise top-level transactions on this connection.
    const previous = queues.get(client) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => mine);
    queues.set(client, tail);
    await previous;

    try {
        const behavior = (options.behavior ?? 'deferred').toUpperCase();
        db.run(sql.raw(`BEGIN ${behavior}`));
        let result: T;
        try {
            result = await active.run({ client, depth: 0 }, () => fn(db));
        } catch (err) {
            if (db.$client.inTransaction) db.run(sql.raw('ROLLBACK'));
            throw err;
        }
        db.run(sql.raw('COMMIT'));
        return result;
    } finally {
        release();
        if (queues.get(client) === tail) queues.delete(client);
    }
}

async function savepoint<T>(db: Db, current: ActiveTransaction, fn: (tx: Db) => Promise<T> | T): Promise<T> {
    const depth = current.depth + 1;
    const name  = `accord_sp${depth}`;
    db.run(sql.raw(`SAVEPOINT ${name}`));
    let result: T;
    try {
        result = await active.run({ client: current.client, depth }, () => fn(db));
    } catch (err) {
        db.run(sql.raw(`ROLLBACK TO ${name}`));
        db.run(sql.raw(`RELEASE ${name}`));
        throw err;
    }
    db.run(sql.raw(`RELEASE ${name}`));
    return result;
}

/** Whether the current async context is inside `transaction()` on `db`. */
export function inTransaction(db: Db): boolean {
    const current = active.getStore();
    return Boolean(current && current.client === db.$client);
}
