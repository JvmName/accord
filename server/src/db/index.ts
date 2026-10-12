/**
 * Drizzle connection factory (server-ts task 09).
 *
 * The web server serves the ported routes through this connection while the
 * Sequelize stack (web and worker processes) still opens the same SQLite file.
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

/**
 * How long a statement waits for another connection's lock before failing
 * with SQLITE_BUSY. bun:sqlite defaults to 0 (fail at once). 1000 ms is what
 * the sqlite3 driver sets on every connection it opens, i.e. what the
 * Sequelize connections in the web and worker processes use, and those write
 * the same database file. Note that bun:sqlite waits synchronously, so a wait
 * blocks this process's event loop for up to this long.
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
 * the first query does (the Sequelize connections are lazy in the same way).
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
