# Task 13a — port the mat-domain routes: working notes

`run_task` MCP was unavailable in this session (agent-task-queue failed to
connect), so every `bun` command ran through Bash, with explicit timeouts, as the
protocol allows when it says so.

## 0. Step-4 verification (2026-10-11)

| Plan / orchestrator assumption | Reality |
|---|---|
| `src/http/server.ts` | does not exist; task 12 built `src/http/{router,route,types,envelope,errors,...}.ts`, `registerRoutes`, `routeChain`, `legacyBodyParsers`, and every route declared with a throwing placeholder |
| `routes/index.js`, `routes/users.js` | Express-generator boilerplate (`GET /` -> `res.render('index')`; `GET /` -> `'respond with a resource'`). See section 3. |
| PORTED_CONTROLLERS "class names" | two different controllers are both named `UsersController` (`controllers/usersController.js`, `controllers/mat/usersController.js`). A bare class name cannot tell them apart, so entries are `<dir>/<Class>` relative to `controllers/` (`UsersController`, `MatsController`, `mat/UsersController`). |
| skip "in `#importControllersFromFile`" (plan) | NOT possible without breaking `test/characterization/routeTable.test.js`, which builds the table from `server.controllerClasses` and asserts all six classes and all 23 routes. The skip is therefore in `registerControllers()` (discovery unchanged, registration skips). The characterization file is a test of reflection/discovery, not of the live router; the new live-router test covers the latter. |
| legacy busy timeout | measured: 1000 ms (node-sqlite3 sets `sqlite3_busy_timeout(db, 1000)` on open, `node_modules/sqlite3/src/database.cc:175`; Sequelize does not change it). bun:sqlite default: 0. Both `journal_mode = delete`. Sequelize also sets `foreign_keys = ON`, bun:sqlite leaves it OFF, but neither schema declares a single FOREIGN KEY (`grep REFERENCES drizzle/*.sql` = 0, migrations have no `references`), so that pragma is moot. |
| `test/http/routeTable.test.ts` "placeholder on every route" | written by task 12 to be updated here: ported routes no longer carry placeholders. |

## 1. Legacy wire behaviour beyond the goldens (differential probe)

Probe: `scratchpad/matProbe.js` (not committed). Boots a server on a temp DB and
runs 173 mat-domain requests (odd inputs, overrides, joins/leaves mid-match,
solo match refusal, follow-up reads through the legacy match routes), normalizing
ids/codes/dates positionally and user-list order (F-48 decision: order does not
matter). Captured from the UNMODIFIED code twice: byte-identical. The same probe
is rerun after each controller is ported and diffed against that baseline.

Findings it surfaced (all to be reproduced):
- created entities render the INPUT values, not the stored ones (Sequelize
  `create` returns the built instance): `POST /users {name: 5}` -> `name: 5`
  (stored `'5'`), `{name: true}` -> `true` (stored `'1'`); same for the join's
  anonymous user and for `POST /mats` `name`/`judge_count`.
- `POST /mats` without `judge_count` renders `"judge_count": "1"` (a STRING: the
  model default is the string `"1"` from `config/db/schemas/default.js`), while
  the DB gets 1. `judge_count: null` -> 500 `notNull Violation: Mat.judge_count
  cannot be null`; an object/array name -> 500 `string violation: name cannot be
  an array or an object`; both -> the two messages joined by `,\n`.
- non-scalar `judge_count` is accepted and stored as its string form
  (`'[object Object]'`, `[1]` -> `1`, `[1,2]` -> `'1,2'`); bun:sqlite refuses to
  bind objects, so the port coerces with `String()`.
- `DELETE /mat/:code/join?matCode=&matId=<uuid>` -> 500
  `null is not an object (evaluating 'this.currentMatCode.role')`.

## 2. Progress

- [x] read everything listed; probe baseline captured
- [x] seam: `src/http/mountPorted.ts` (`ROUTES_BY_LEGACY_CONTROLLER`, `portedRoutes`, `mountPortedRoutes`;
      refuses unknown keys and placeholder handlers), `PORTED_CONTROLLERS` + `portedControllers` getter +
      `controllerKey` + `db` (lazy) + `expressApp` in `lib/server/applicationServer.js`;
      `isPlaceholder` in `src/http/route.ts`; `BUSY_TIMEOUT_MS` + `createLazyDb` in `src/db/index.ts`.
- [x] controller 1 `UsersController` (`POST /users`): probe diff vs baseline EMPTY; full suite 933/0/57.
      `test/http/liveRoutes.test.ts` added (live Express stack: no duplicates, table == baseline, who serves what).

### Mount position: a race in the legacy F-25.1 path (found while porting controller 1)

First attempt mounted the ported routes BEFORE the remaining controllers. The UNMODIFIED
`test/characterization/authorization.test.js` then failed deterministically (ECONNRESET on the
`POST /users` right after `GET /match/<unknown>`). Cause, traced with a raw socket and server-side
socket ids: legacy `GET /match/:unknownId` (F-25.1) renders the 404, keeps running, throws, and
Express's final handler then DESTROYS the keep-alive socket (headers already sent). The client
(same process) reuses that pooled socket for its next request if it has not yet processed the
close. GETs are retried by fetch, POSTs are not. Whether the close lands first is a sub-millisecond
race; in legacy mode it happened to land ~0.02 ms first, with the ported routes before the
controllers it landed ~0.4 ms later. Mounting the ported routes AFTER the remaining controllers (so
the legacy routes keep their stack positions) restored the legacy timing: 6/6 runs green. Recorded as
a finding: the characterization matrix (and any keep-alive client) depends on this race until 13b
ports `GET /match/:matchId` (the registry stops at the 404, so the socket survives).
- [x] controller 2 `MatsController` (`POST /mats`, `GET /mat/:matId`): probe diff EMPTY; full suite 933/0/57.
- [x] controller 3 `mat/UsersController` (join/leave/judges/viewers): probe diff EMPTY (twice); full suite 935/0/57.
      Leave mid-match ends the open vote with `endVote` (src/services/ridingTimeVotes.ts), never Sequelize.
- [x] `test/controllers/mat/usersController.test.js` ported in place to the exported handler commands
      (`addAsJudge`, `removeUser`) on a scratch in-memory Drizzle DB; every behaviour the old file pinned is kept
      (19 -> 21 tests: + authorize calls for the joining user, + viewer leave). Order "vote ended before match
      judge removed" asserted from Drizzle's statement log; mutation (swap) fails it.
- [x] busy timeout: `test/db/busyTimeout.test.ts` (5 tests, child-process sqlite3 connection), 3/3 runs green.
- [x] DEV mode (`NODE_ENV=development`, OpenAPI validator active): probe legacy-only vs ported identical.

## 3. routes/index.js, routes/users.js

Express-generator boilerplate, required by nothing (grep over bin, lib, controllers, models, src, test,
config), no view engine configured (`views/*.jade` likewise dead). The live Express stack holds exactly the
20 non-DEV baseline routes (`test/http/liveRoutes.test.ts`). Not ported; F-87 (delete in 15).

## 4. Authorization per route (effective checks, legacy vs ported)

| route | legacy (callbacks + action) | ported (gate spec + handler) | proof |
|---|---|---|---|
| POST /users | none (`except: 'postIndex'`) | none/public | matrix (user creation in every world), probe |
| POST /mats | `authorize('create', Mat)` (= user?) then validate | newMat/create gate then validate | matrix 3 rows; mutation a3 |
| GET /mat/:matId | `authorize('view', currentMat)` only, no authn; null mat -> 401 | mat/view gate | matrix 5 rows (F-15/F-16) |
| POST /mat/:code/join | none; action: unknown code 404; admin: `assign` + `be assigned judge` on the mat (Authorizer built lazily: sees the created user) | matCode/public; handler: 404, admin: `ctx.authorize` both with subject = joining user | matrix 3 rows; ported unit test asserts the two calls |
| DELETE /mat/:code/join | unawaited authenticateRequest: missing mat 404 wins, else no user 401; admin: `assign` + `be assigned judge` | matCode/view gate (404 then 401); handler admin: both `ctx.authorize` | matrix row (anon 401); mutation a2 |
| GET /mat/:code/judges, /viewers | same as DELETE | matCode/view | matrix 3 rows; mutation a1 |

`assign`/`create a match` on a mat need the request's code to be the ADMIN code OF THAT mat; in join/leave the
mat comes from that same code, so the check can only fail via a null mat (unreachable). `test/characterization/
authorization.test.js` runs UNMODIFIED against the live app (46/46, 8 extra runs green);
`test/http/authorizationParity.test.ts` and `routeTable.test.ts` (per-route spec table) unchanged and green.

## 5. Mutation proofs (each reverted; md5 identical afterwards)

| id | mutation | result |
|---|---|---|
| a1 | `GET /mat/:matCode/judges` gate `matCode/view` -> `matCode/public` | 9 fail: characterization (anon roster DENY, unknown code 404), contract goldens, routeTable spec table, authorizationParity |
| a2 | `DELETE /mat/:matCode/join` gate -> `public` | characterization "DENIES an anonymous leave request" fails |
| a3 | `POST /mats` gate `newMat/create` -> `none/public` | characterization 2 rows (anon, bad token) + contract goldens fail |
| b | remove `mat/UsersController` from PORTED_CONTROLLERS (as asked) | all green: by design the list also drives the mount, so the controller simply serves again (clean rollback) |
| b' | `registerControllers` stops skipping ported controllers | liveRoutes: duplicates + table + served-by fail (3) |
| b'' | mount `mat/UsersController` routes without listing it (skip and mount diverge) | liveRoutes 4 fail |
| b''' | skip without mounting | liveRoutes 4 fail (routes missing) |
| b4 | list `MatchesController` (placeholders) | server refuses to start (registerControllers throws) |
| c | leave: remove match judge before ending the vote | ported usersController test fails |

## 6. Verification (2026-10-11, Bash; run_task unavailable)

- `bun run typecheck`: exit 0.
- `bun run test`: 940 pass / 0 fail / 58 files (baseline 926 / 56; +7 liveRoutes, +5 busyTimeout, +2 in the
  ported usersController test), twice.
- goldens and test/characterization: zero modifications (`git status` clean for both paths).
- `bun run generate:openapi` x2 byte-identical; `openapi.json` unchanged (sha1 8384b649...).
- `bunx --bun drizzle-kit generate`: "No schema changes".
- real sqlite files untouched: config/db/database.development.sqlite (Apr 24), database.test.sqlite (Apr 20),
  server/database.sqlite (Jan 15).
- handlers import no `models/`, `lib/activeRecord` or `sequelize` (import list checked).
