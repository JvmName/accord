# src/db — Drizzle schema (server-ts task 09)

Nothing in the running server uses this yet. The Sequelize stack stays live
until the task 10/11 cutover; both may open the same SQLite file.

## Source of truth

`schema.ts` is the source of truth for the database. Migrations in
`server/drizzle/` are generated from it with drizzle-kit; do not hand-edit the
generated SQL or `drizzle/meta/`. `types.ts` exports row types
(`InferSelectModel` / `InferInsertModel`) for all 10 tables. `index.ts` has
`createDb()` / `migrateDb()` (importing it has no side effects).

The 14 legacy Sequelize migrations in `config/db/migrations/` (the original
plan said 15) and `config/db/schemas/default.js` are **historical only**. They
are deleted at the task 11 cutover. The baseline `drizzle/0000_baseline.sql`
reproduces the schema they produce today; it was verified by replaying them
into a scratch DB and diffing PRAGMA output against the Drizzle baseline.

## Commands (run from `server/`)

```bash
bun run drizzle:generate   # diff schema.ts vs drizzle/meta, write a new migration
bun run drizzle:migrate    # apply pending migrations to the configured SQLite file
bun run drizzle:studio
```

Each script is `bunx --bun drizzle-kit <cmd>`. `--bun` makes drizzle-kit run
under the bun runtime, so it uses the built-in `bun:sqlite` driver and needs no
native sqlite package. Use bun only, never npm/yarn/pnpm. `generate` never
opens a database. `migrate`/`studio` use `$DATABASE_PATH`, else
`config/db/database.<NODE_ENV>.sqlite` (see `drizzle.config.ts`), which is a
real file: do not point them at dev or production data by accident.

The `drizzle:*` names are deliberately distinct from the legacy `db:*` scripts
(`db:migrate` runs the Sequelize migrator). They get renamed to `db:*` at the
task 11/15 cutover when the Sequelize path is removed.

## Decisions and caveats

- **SQLite only** (FINDINGS F-37): `sqlite-core` + `bun:sqlite`. Production has
  always been SQLite. Engine choice is revisited in task 19.
- **`migration_versions` is not modelled.** It is Sequelize's own migration
  bookkeeping table, not application data. Drizzle tracks its own state in
  `__drizzle_migrations`. A DB previously migrated by Sequelize therefore has a
  leftover `migration_versions` table that Drizzle ignores.
- **Declared types are TEXT.** The legacy DB declares UUID / DATETIME /
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
  - **Both stacks write the same text.** Until the task 11 cutover Sequelize
    shares these tables, so `lib/activeRecord/db/isoDateTime.js` patches
    Sequelize's SQLite `DATE` type (write: `_stringify`; read: `parse`) to write
    and read the same ISO text. That patch is deleted with the Sequelize layer (task 15).
  - **No legacy-format tolerance.** Existing dev/test sqlite files under
    `config/db/` may contain old-format rows (`YYYY-MM-DD HH:mm:ss.SSS +00:00`);
    delete/recreate them on next migrate.
  - Sequelize parses a column only when its **declared** type is DATETIME. On
    a DB created by the Drizzle baseline (declared TEXT) Sequelize returns
    the ISO string unparsed (FINDINGS F-47).
- **No foreign keys, no DB defaults for ids/timestamps.** Same as the legacy DB:
  ids and `created_at`/`updated_at` are set by the application.
  `relations()` are query-level only.
- **Unique index names** differ from the legacy DB (`mat_codes_code_unique`,
  `users_api_token_unique` vs `sqlite_autoindex_*`), and `rounds.stoppage` is
  an integer boolean (legacy declared `TINYINT(1)`). See FINDINGS F-42 and F-43.

## Tests

`test/db/schema.test.js` applies `./drizzle` to an in-memory database and
checks the table list, columns, NOT NULL on value-class columns, unique
constraints, round trips and relational queries. `test/db/datetime.test.js`
opens one temp-file DB from both Sequelize and Drizzle and checks the stored
ISO format, cross-stack reads, ordering and NULLs.

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
  bun; smoke-tested in `test/db/repositories/matCodes.test.js`).
- **Association caching is dropped, not ported.** `BaseRecord`'s
  per-instance `#cachedAssociations` existed because every association was a
  lazy round trip, and it brought stale-cache bugs with it (manual
  `clearCachedAssociation` calls, F-34). The hot path now loads in one
  relational query instead: `findMatchGraph` / `findMatchGraphsByIds`
  (match + mat + competitors + judges + rounds + votes + pauses) and
  `findMatGraph`. A worker tick that cost ~127 queries on the contract seed
  costs 3 (F-49). If profiling ever shows a need, add an explicit
  request-scoped cache then.
- **Legacy semantics kept:** `null` vs `undefined` exactly as the models
  returned them (`findMatByCode` -> `undefined` for an unknown code,
  `findOpenVoteForJudge` -> `undefined`, everything else `null`); lookups
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
  atomic at all and returned `undefined` (F-50); whether the ported call
  sites use the atomic version is a 10b/13a decision.
- **`stoppage`** reads as `true/false/null` here; Sequelize returns `1/0/null`
  from a legacy `TINYINT(1)` column (F-51). Only truthiness is used.
