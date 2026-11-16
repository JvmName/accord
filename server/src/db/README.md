# src/db — Drizzle schema

## Source of truth

`schema.ts` is the source of truth for the database. Migrations in
`server/drizzle/` are generated from it with drizzle-kit; do not hand-edit the
generated SQL or `drizzle/meta/`. `types.ts` exports row types
(`InferSelectModel` / `InferInsertModel`) for all 10 tables. `index.ts` has
`createDb()` / `migrateDb()` (importing it has no side effects).

The baseline `drizzle/0000_baseline.sql` is the only migration history.

## Commands (run from `server/`)

```bash
bun run db:generate   # diff schema.ts vs drizzle/meta, write a new migration
bun run db:migrate    # apply pending migrations to the configured SQLite file
bun run db:studio
```

`db:generate` and `db:studio` run `bunx --bun drizzle-kit <cmd>`. `--bun` makes
drizzle-kit run under the bun runtime, so it uses the built-in `bun:sqlite`
driver and needs no native sqlite package. Use bun only, never npm/yarn/pnpm.
`generate` never opens a database; `studio` uses `$DATABASE_PATH`, else
`config/db/database.<NODE_ENV>.sqlite` (see `drizzle.config.ts`), which is a
real file: do not point it at dev or production data by accident.

`db:migrate` runs `bin/migrate.ts`, which applies the pending migrations to the
database that `resolveDatabasePath()` names, the same file the server opens.
It uses only runtime dependencies, so it also works in a production-only
install (drizzle-kit is a dev dependency).

## Decisions and caveats

- **SQLite only**: `sqlite-core` + `bun:sqlite`.
- **`migration_versions` is not modelled.** A database migrated by the old
  Sequelize migrator keeps a leftover `migration_versions` table; Drizzle
  ignores it and tracks its own state in `__drizzle_migrations`.
- **Declared types are TEXT** for ids, datetimes and strings. The stored
  values are never numeric-looking, so SQLite affinity makes no difference.
- **Datetimes are ISO 8601 text, typed `Date`.** All 27 datetime columns use
  the `isoDateTime` custom type (`columns.ts`): declared `text`, written as
  `Date#toISOString()` (`YYYY-MM-DDTHH:mm:ss.SSSZ`, always UTC), read back as
  `Date` with `new Date(text)`. NULL stays NULL. ISO is the only supported
  format: a dev or test file under `config/db/` with old-format rows
  (`YYYY-MM-DD HH:mm:ss.SSS +00:00`) has to be deleted and recreated.
- **No foreign keys, no DB defaults for ids or timestamps.** Ids and
  `created_at`/`updated_at` are set by the application. `relations()` are
  query-level only.
- **Unique index names** are explicit (`mat_codes_code_unique`,
  `users_api_token_unique`), and `rounds.stoppage` is an integer boolean
  (`true/false/null` in code).

## Tests

`test/db/schema.test.ts` applies `./drizzle` to an in-memory database and
checks the table list, columns, NOT NULL on value-class columns, unique
constraints, round trips and relational queries. `test/db/datetime.test.ts`
checks the stored ISO format, reads, ordering and NULLs on a temp-file DB.

## Repositories

`repositories/{users,mats,matCodes,matches,rounds,votes}.ts` and
`transaction.ts`.

- **Plain functions, no classes.** Each is `async fn(db, ...)` where `db` is
  the `createDb()` handle or a `transaction()` handle (`DbOrTx`), returning
  Drizzle rows (`types.ts`). Rows carry every column (including
  `users.api_token`); stripping is the serialisation layer's job
  (`src/serialize`).
- **One query loads a whole match.** `findMatchGraph` / `findMatchGraphsByIds`
  (match + mat + competitors + judges + rounds + votes + pauses) and
  `findMatGraph` replace per-association round trips: a worker tick costs 3
  queries. If profiling ever shows a need, add an explicit request-scoped
  cache then.
- **Conventions.** A missing row is `null` everywhere; a lookup passed
  `undefined` throws; ordering is always explicit (`ORDER BY`, `rowid` for
  insertion order); creates set `created_at = updated_at = now`, updates bump
  `updated_at`; join-table adds are idempotent.
- **Write primitives** are composed into the lifecycle commands in
  `src/services/` (see its README). A command that changes a row claims the
  change with a conditional `UPDATE` (`claimRoundEnd`, `claimMatchEnd`,
  `claimMatchStart`), because the web process and the worker write the same
  rows.
- **`transaction(db, async (tx) => ...)`** is atomic: BEGIN DEFERRED (or
  `behavior: 'immediate'`), COMMIT on resolve, ROLLBACK + rethrow on error,
  resolves to the callback's value, nested calls become SAVEPOINTs, top-level
  transactions on one connection are queued. It does NOT use Drizzle's
  `db.transaction()`, which on bun-sqlite commits at the callback's first
  `await`. Caveat: other non-transactional queries on the same connection that
  run while a transaction is open join it, so keep callbacks to database work.
  `POST /mats` and `POST /match/:id/start` run inside it.
