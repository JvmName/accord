/**
 * Drizzle connection factory.
 *
 * Importing this module has NO side effects: no file is opened and no config
 * is read until `createDb()` is called. There is no static cache and no
 * database-id lookup: every call opens exactly the database it is given (or
 * the one `resolveDatabasePath()` names), and the caller owns it.
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
 * The database file to open: `$DATABASE_PATH`, else
 * `<cwd>/config/db/database.<NODE_ENV>.sqlite` (`development` when unset).
 */
export function resolveDatabasePath(): string {
    const env = process.env.NODE_ENV || 'development';
    return process.env.DATABASE_PATH ?? path.join(process.cwd(), 'config', 'db', `database.${env}.sqlite`);
}

export interface CreateDbOptions {
    /** SQLite file path, or `':memory:'`. Defaults to `resolveDatabasePath()`. */
    path?: string;
}

/**
 * How long a statement waits for another connection's lock before failing
 * with SQLITE_BUSY. bun:sqlite defaults to 0 (fail at once). The web and worker
 * processes write the same database file, so a short wait beats failing.
 * Note that bun:sqlite waits synchronously, so a wait blocks this process's
 * event loop for up to this long.
 */
export const BUSY_TIMEOUT_MS = 1000;

/** Open a bun:sqlite database and wrap it in Drizzle with the full schema + relations. */
export function createDb(options: CreateDbOptions = {}): Db {
    const file   = options.path ?? resolveDatabasePath();
    const client = new Database(file, { create: true });
    client.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    return drizzle({ client, schema }) as Db;
}

/**
 * A `Db` that opens its connection on first use, so building the web
 * server and registering its routes never touches the database file; only
 * the first query does .
 */
export function createLazyDb(options: CreateDbOptions = {}): Db {
    let db: Db | undefined;
    const open = (): Db => (db ??= createDb(options));
    return new Proxy({} as Db, {
        get(_target, property) {
            const real  = open();
            const value = Reflect.get(real, property, real);
            return typeof value === 'function' && property !== 'constructor' ? value.bind(real) : value;
        },
    });
}

/** Apply every pending drizzle-kit migration from `drizzle/` to `db`. */
export function migrateDb(db: Db, migrationsFolder: string = MIGRATIONS_FOLDER): void {
    migrate(db, { migrationsFolder });
}
