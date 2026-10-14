/**
 * drizzle-kit configuration (server-ts task 09). SQLite only (FINDINGS F-37).
 *
 * Run drizzle-kit through the package scripts (`bun run drizzle:generate`,
 * `drizzle:migrate`, `drizzle:studio`), which invoke it as `bunx --bun
 * drizzle-kit`: under the bun runtime drizzle-kit uses the built-in
 * `bun:sqlite` driver, so no native sqlite package is needed. See
 * src/db/README.md.
 *
 * `dbCredentials.url` is only used by commands that open a database
 * (migrate / pull / studio); `generate` never touches one. It resolves like
 * the legacy stack: `$DATABASE_PATH`, else
 * `config/db/database.<NODE_ENV>.sqlite`.
 */
import { defineConfig } from 'drizzle-kit';

const env = process.env.NODE_ENV || 'development';

export default defineConfig({
    dialect:  'sqlite',
    schema:   './src/db/schema.ts',
    out:      './drizzle',
    dbCredentials: {
        url: process.env.DATABASE_PATH ?? `./config/db/database.${env}.sqlite`,
    },
    strict:  true,
    verbose: true,
});
