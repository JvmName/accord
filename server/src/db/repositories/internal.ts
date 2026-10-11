/**
 * Shared plumbing for the repository modules (server-ts task 10). Not part of
 * the public repository API.
 *
 * ES `export` like `../schema.ts`: repositories are loaded only by TS / new
 * code and tests, never by the legacy CommonJS stack.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from '../schema';

/**
 * Anything a repository function can run against: the root Drizzle database
 * (`createDb()`) or a handle passed into a `transaction()` callback. Both are
 * `BaseSQLiteDatabase<'sync', …, Schema>`, so `db.query.*` relational queries
 * and the query builders are available on either.
 */
export type DbOrTx = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

/**
 * Sequelize's automatic timestamps: `created_at` and `updated_at` are both set
 * to the same "now" on insert (the schema has no DB default for them).
 */
export function insertStamps(now: Date = new Date()): { created_at: Date; updated_at: Date } {
    return { created_at: now, updated_at: now };
}

/**
 * SQLite's implicit `rowid`, i.e. insertion order. The legacy queries carry no
 * ORDER BY; for an index-driven `WHERE x = ?` (or a table scan) SQLite returns
 * rows in `(x, rowid)` order, which is insertion order within the group. This
 * is used as the explicit, deterministic equivalent (see the inventory in
 * `.ai/plans/server-ts/artifacts/repository-inventory.md`, "Ordering").
 *
 * Unqualified on purpose: every use is in a single-table (sub)select, where
 * `rowid` resolves to that table, including inside Drizzle's relational
 * subqueries, which alias the table.
 */
export const rowid: SQL = sql`rowid`;

/** Drizzle's `findFirst` yields `undefined` when nothing matches; Sequelize's `findOne`/`findByPk` yield `null`. */
export function orNull<T>(row: T | undefined): T | null {
    return row === undefined ? null : row;
}

/**
 * Sequelize rejects `where: { col: undefined }` with
 * `WHERE parameter "col" has invalid "undefined" value`. Drizzle would instead
 * build `col = NULL`/`col IS NULL`. Reproduce the legacy throw so a lookup
 * with a missing key fails the same way it did (callers guard today, so this
 * is unreachable in practice).
 */
export function assertDefined(value: unknown, column: string): void {
    if (value === undefined) {
        throw new Error(`WHERE parameter "${column}" has invalid "undefined" value`);
    }
}

/* Compile-time check (erased): the root `createDb()` handle is a `DbOrTx`. */
type Assert<T extends true> = T;
export type _DbIsDbOrTx = Assert<import('../index').Db extends DbOrTx ? true : false>;
