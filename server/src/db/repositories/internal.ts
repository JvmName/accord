/**
 * Shared plumbing for the repository modules. Not part of
 * the public repository API.
 *
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
 * `created_at` and `updated_at` are both set to the same "now" on insert (the
 * schema has no DB default for them).
 */
export function insertStamps(now: Date = new Date()): { created_at: Date; updated_at: Date } {
    return { created_at: now, updated_at: now };
}

/**
 * SQLite's implicit `rowid`, i.e. insertion order. For an index-driven
 * `WHERE x = ?` (or a table scan) SQLite returns rows in `(x, rowid)` order,
 * which is insertion order within the group. Used as the explicit,
 * deterministic order wherever insertion order is wanted.
 *
 * Unqualified on purpose: every use is in a single-table (sub)select, where
 * `rowid` resolves to that table, including inside Drizzle's relational
 * subqueries, which alias the table.
 */
export const rowid: SQL = sql`rowid`;

/** Drizzle's `findFirst` yields `undefined` when nothing matches, and callers want `null`. */
export function orNull<T>(row: T | undefined): T | null {
    return row === undefined ? null : row;
}

/**
 * Drizzle builds `col = NULL`/`col IS NULL` for `where: { col: undefined }`,
 * which silently matches nothing or everything. Throw instead, so a lookup
 * with a missing key fails loudly (callers guard, so this is unreachable in
 * practice).
 */
export function assertDefined<T>(value: T, column: string): asserts value is Exclude<T, undefined> {
    if (value === undefined) {
        throw new Error(`WHERE parameter "${column}" has invalid "undefined" value`);
    }
}

/** The row an `INSERT ... RETURNING` just wrote; the database always returns it. */
export function inserted<T>(row: T | undefined): T {
    if (row === undefined) throw new TypeError('Expected the insert to return its row');
    return row;
}

/* Compile-time check (erased): the root `createDb()` handle is a `DbOrTx`. */
type Assert<T extends true> = T;
export type _DbIsDbOrTx = Assert<import('../index').Db extends DbOrTx ? true : false>;
