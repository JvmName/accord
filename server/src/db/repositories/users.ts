/**
 * `users` repository (server-ts task 10). Plain functions over Drizzle that
 * return `User` rows (no classes, no serialisation: `api_token` is a column of
 * the row and stripping it is the serialisation layer's job, task 11).
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users } from '../schema';
import type { User } from '../types';
import { assertDefined, insertStamps, orNull, type DbOrTx } from './internal';

/**
 * `User.find(id)` (Sequelize `findByPk`): the user, or `null`. A nullish id
 * yields `null` without a query, as `findByPk` does.
 */
export async function findUserById(db: DbOrTx, id: string | null | undefined): Promise<User | null> {
    if (id === null || id === undefined) return null;
    return orNull(await db.query.users.findFirst({ where: eq(users.id, id) }));
}

/**
 * `User.findByApiToken(token)` — the authentication lookup. Exact, case-
 * sensitive equality (SQLite BINARY collation, same as legacy). Returns the
 * user or `null` (Sequelize `findOne`). `undefined` throws exactly like
 * Sequelize's `where: {api_token: undefined}`; both callers guard with
 * `if (this.apiToken)` so that path is unreachable today.
 */
export async function findUserByApiToken(db: DbOrTx, token: string | null | undefined): Promise<User | null> {
    assertDefined(token, 'api_token');
    if (token === null) return null; // `api_token IS NULL` — the column is NOT NULL, so never a match
    return orNull(await db.query.users.findFirst({ where: eq(users.api_token, token) }));
}

export interface InsertUserValues {
    name: string;
    id?: string;
    /** Generated (`randomUUID()`) when falsy, like `User`'s `beforeValidate` hook. */
    api_token?: string | null;
}

/**
 * `User.create({...})`. Generates `api_token` when it is falsy (the legacy hook
 * tests `!user.api_token`), the id via the schema's `$defaultFn`, and sets
 * `created_at`/`updated_at` to now.
 */
export async function insertUser(db: DbOrTx, values: InsertUserValues): Promise<User> {
    const [row] = await db.insert(users).values({
        ...(values.id ? { id: values.id } : {}),
        name:      values.name,
        api_token: values.api_token || randomUUID(),
        ...insertStamps(),
    }).returning();
    return row;
}
