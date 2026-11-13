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

- **SQLite only** (FINDINGS F-37): `sqlite-core` + `bun:sqlite`. Production has
  always been SQLite. Engine choice is revisited in task 19.
- **`migration_versions` is not modelled.** It is the old Sequelize migrator's
  bookkeeping table, not application data. Drizzle tracks its own state in
  `__drizzle_migrations`; a DB migrated by the old migrator keeps a leftover
  `migration_versions` table that Drizzle ignores.
- **Declared types are TEXT.** The old schema declared UUID / DATETIME /
  VARCHAR(255) columns; Drizzle declares TEXT. SQLite gives UUID and DATETIME
  NUMERIC affinity and TEXT gets TEXT affinity. For the stored values (UUID
  strings, ISO datetime strings) this makes no difference, since they are not
  numeric-looking and are stored as text either way. TEXT is the safer
  choice. See FINDINGS F-38.
- **Datetimes are ISO 8601 text, typed `Date`** (user decision 2026-10-11,
  FINDINGS F-39). All 27 datetime columns use the `isoDateTime` custom type
  (`columns.ts`): declared `text`, written as `Date#toISOString()`
  (`YYYY-MM-DDTHH:mm:ss.SSSZ`, always UTC), read back as `Date`. NULL stays
  NULL. Read back with `new Date(text)`; ISO is the only supported format.
  - **No legacy-format tolerance.** Existing dev/test sqlite files under
    `config/db/` may contain old-format rows (`YYYY-MM-DD HH:mm:ss.SSS +00:00`);
    delete/recreate them on next migrate.
- **No foreign keys, no DB defaults for ids/timestamps.** Same as the old schema:
  ids and `created_at`/`updated_at` are set by the application.
  `relations()` are query-level only.
- **Unique index names** differ from the legacy DB (`mat_codes_code_unique`,
  `users_api_token_unique` vs `sqlite_autoindex_*`), and `rounds.stoppage` is
  an integer boolean (legacy declared `TINYINT(1)`). See FINDINGS F-42 and F-43.

## Tests

`test/db/schema.test.ts` applies `./drizzle` to an in-memory database and
checks the table list, columns, NOT NULL on value-class columns, unique
constraints, round trips and relational queries. `test/db/datetime.test.ts`
checks the stored ISO format, reads, ordering and NULLs on a temp-file DB.

## Repositories (task 10)

`repositories/{users,mats,matCodes,matches,rounds,votes}.ts` and
`transaction.ts`. The inventory that drove the API (every legacy call site ->
function, or -> task 10b) is
`.ai/plans/server-ts/artifacts/repository-inventory.md`.

- **Plain functions, no classes.** Each is `async fn(db, ...)` where `db` is
  the `createDb()` handle or a `transaction()` handle (`DbOrTx`), returning
  Drizzle rows (`types.ts`). No ActiveRecord base, no `save()`, no
  `toApiResponse`/`apiSafeKeys`: rows carry every column (including
  `users.api_token`) and serialisation is task 11. ES `export`, like
  `schema.ts`: only TS/new code and tests load them (`require()` works under
  bun; smoke-tested in `test/db/repositories/matCodes.test.ts`).
- **Association caching is dropped, not ported.** `BaseRecord`'s
  per-instance `#cachedAssociations` existed because every association was a
  lazy round trip, and it brought stale-cache bugs with it (manual
  `clearCachedAssociation` calls, F-34). The hot path now loads in one
  relational query instead: `findMatchGraph` / `findMatchGraphsByIds`
  (match + mat + competitors + judges + rounds + votes + pauses) and
  `findMatGraph`. A worker tick that cost ~127 queries on the contract seed
  costs 3 (F-49). If profiling ever shows a need, add an explicit
  request-scoped cache then.
- **Legacy semantics kept:** a missing row is `null` everywhere; lookups
  passed `undefined` throw like Sequelize's `where`; ordering reproduces the
  implicit legacy order explicitly (F-48); creates set
  `created_at = updated_at = now`, updates bump `updated_at`; join-table adds
  are idempotent like `belongsToMany#add`, `setMatchJudges` behaves like
  `belongsToMany#set`.
- **Write primitives only.** Lifecycle commands (start/end match or round,
  votes, pause/resume, set result) are composed from these primitives in
  task 10b.
- **`transaction(db, async (tx) => ...)`** really is atomic: BEGIN DEFERRED,
  COMMIT on resolve, ROLLBACK + rethrow on error, resolves to the callback's
  value, nested calls become SAVEPOINTs, top-level transactions on one
  connection are queued. It does NOT use Drizzle's `db.transaction()`, which
  on bun-sqlite commits at the callback's first `await`. Caveat: other
  non-transactional queries on the same connection that run while a
  transaction is open join it. The legacy `BaseRecord.transaction` was not
  atomic at all and returned `undefined` (F-50). `POST /mats` and
  `POST /match/:id/start` run inside it (`behavior: 'immediate'`); the
  lifecycle commands use conditional writes instead.
- **Lifecycle commands** composed from these primitives live in
  `src/services/` (task 10b, see its README).
- **`stoppage`** reads as `true/false/null` here; Sequelize returns `1/0/null`
  from a legacy `TINYINT(1)` column (F-51). Only truthiness is used.
