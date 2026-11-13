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
 * NOT inside a transaction while one is open executes inside that open
 * transaction, and shares its commit or rollback. Queries are not routed
 * through the queue. This only happens if the callback awaits something that
 * is not a database call (a sync driver resolves each query in a microtask, so
 * no other request runs in between). Keep callbacks to database work.
 *
 * The legacy `BaseRecord.transaction` was NOT atomic (its queries ran outside
 * the transaction) and always resolved to `undefined`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { Db } from './index';
import type { DbOrTx } from './repositories/internal';

export type TransactionBehavior = 'deferred' | 'immediate' | 'exclusive';

export interface TransactionOptions {
    /** SQLite BEGIN mode for a top-level transaction. Default `'deferred'`. */
    behavior?: TransactionBehavior;
}

interface ActiveTransaction {
    client: object;
    depth: number;
}

/** The connection behind a handle. Every handle in this codebase comes from `createDb`, which has it. */
const clientOf = (db: DbOrTx): object & { inTransaction: boolean } => (db as Db).$client;

const active = new AsyncLocalStorage<ActiveTransaction>();
const queues = new WeakMap<object, Promise<void>>();

/** Run `fn` atomically on `db`'s connection; see the module comment. */
export async function transaction<T>(
    db: DbOrTx,
    fn: (tx: DbOrTx) => Promise<T> | T,
    options: TransactionOptions = {},
): Promise<T> {
    const client = clientOf(db);
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
            if (clientOf(db).inTransaction) db.run(sql.raw('ROLLBACK'));
            throw err;
        }
        db.run(sql.raw('COMMIT'));
        return result;
    } finally {
        release();
        if (queues.get(client) === tail) queues.delete(client);
    }
}

async function savepoint<T>(db: DbOrTx, current: ActiveTransaction, fn: (tx: DbOrTx) => Promise<T> | T): Promise<T> {
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
export function inTransaction(db: DbOrTx): boolean {
    const current = active.getStore();
    return Boolean(current && current.client === clientOf(db));
}
