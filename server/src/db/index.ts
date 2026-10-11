/**
 * Drizzle connection factory (server-ts task 09).
 *
 * Nothing in the running server uses this yet — the Sequelize stack is still
 * live until the task 10/11 cutover, and both may open the same SQLite file.
 *
 * Importing this module has NO side effects: no file is opened and no config
 * is read until `createDb()` is called.
 *
 * Unlike legacy `BaseRecord.connection` (FINDINGS F-01), there is no static
 * cache and no database-id lookup: every call opens exactly the database it is
 * given (or the one the legacy config resolves to), and the caller owns it.
 */
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import path from 'node:path';
import * as schema from './schema';

export { schema };

export type Schema = typeof schema;
export type Db = BunSQLiteDatabase<Schema> & { $client: Database };

/** The generated baseline + later drizzle-kit migrations. */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

/**
 * The database file the legacy stack would open, resolved through the SAME
 * source (`lib/activeRecord/db/connectionConfiguration.js`):
 * `$DATABASE_PATH`, else `<cwd>/config/db/database.<NODE_ENV>.sqlite`.
 * Required lazily so that importing this module stays side-effect free.
 */
export function resolveDatabasePath(): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ConnectionConfiguration } = require('../../lib/activeRecord/db/connectionConfiguration');
    return new ConnectionConfiguration('default').storage;
}

export interface CreateDbOptions {
    /** SQLite file path, or `':memory:'`. Defaults to `resolveDatabasePath()`. */
    path?: string;
}

/** Open a bun:sqlite database and wrap it in Drizzle with the full schema + relations. */
export function createDb(options: CreateDbOptions = {}): Db {
    const file   = options.path ?? resolveDatabasePath();
    const client = new Database(file, { create: true });
    return drizzle({ client, schema }) as Db;
}

/** Apply every pending drizzle-kit migration from `drizzle/` to `db`. */
export function migrateDb(db: Db, migrationsFolder: string = MIGRATIONS_FOLDER): void {
    migrate(db, { migrationsFolder });
}
