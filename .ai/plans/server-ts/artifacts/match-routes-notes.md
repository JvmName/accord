# Task 13b — port the match-domain routes: working notes

`run_task` MCP was unavailable in this session (agent-task-queue failed to
connect), so every `bun` command ran through Bash with explicit timeouts, as
the protocol allows when it says so.

## 0. Step-4 verification (2026-10-12)

| Plan / orchestrator assumption | Reality |
|---|---|
| `src/http/server.ts` | does not exist. Seam = `src/http/mountPorted.ts` (`ROUTES_BY_LEGACY_CONTROLLER`) + `PORTED_CONTROLLERS` in `lib/server/applicationServer.js` (13a). |
| `routes/matches.ts`, `rounds.ts`, `ridingTimeVotes.ts` "create" | exist since task 12 with every route declared and `notImplemented('13b')` placeholder handlers. Only the handlers are replaced. |
| plan step 4: end-round overload `{ submission, submitter }` / `{ stoppage: true, stopper }` | NOT what the code does. `controllers/match/roundsController.js` implements the two-step flow only: `POST /match/:matchId/rounds/end` (no body, `endRound({safe:false})`) and `PATCH /match/:matchId/rounds/result` (`winner` validated as enum `[undefined,'red','blue']`, `stoppage` unvalidated, -> `lastRound.setResult({winner, stoppage})`). `AccordClient.kt` calls exactly these two (`endRound`, `patchRoundResult` with `EndRoundRequest(winner, stoppage)`). No `submission`/`submitter`/`stopper` parameter exists anywhere in `server/` (grep). The overloading lives client-side (`RoundController.endRound(winner, submission, stoppage)` -> `stoppage` flag). Ported what the code does. |
| `MatchesController` = 4 routes incl. `POST /mat/:matCode/matches` | yes: `postIndex` is in MatchesController (not ported by 13a), so 13b ports it. |
| `test/controllers/**` match-domain tests | none exist (only `test/controllers/mat/usersController.test.js`, ported in 13a). Nothing to port. |
| controllers emit WebSocket events | no (grep: no emit/notify in controllers/). |
| `PORTED_CONTROLLERS` keys | `MatchesController`, `match/RoundsController`, `match/RidingTimeVoteController` (`controllerKey` = directory prefix + class name). `test/http/liveRoutes.test.ts#controllerKeyOf` maps fixture owners (bare class names) to keys and must learn the `match/` prefix. |

## 1. Progress

- [x] read everything listed
- [x] probe `scratchpad/matchProbe.js` (not committed): 264 match-domain requests + a dump of every row of the
      10 tables (join rows sorted: they are written in user-id order and ids are random per run), clock FROZEN
      with `setSystemTime` and advanced explicitly (1 s per request plus jumps), `connection: close` on every
      request. Legacy-only baseline (PORTED list empty) captured twice: byte-identical. Ids/codes/tokens named
      positionally, user lists sorted (F-48 decision); dates, scores, `time_remaining`, `break_remaining` compared
      LITERALLY.
- [x] seam: `src/http/routes/matchPayload.ts` (`renderMatch` + the three render option sets).
- [x] controller 1 `match/RidingTimeVoteController` (POST/DELETE ridingTime): probe vs legacy baseline: 0 response
      diffs, 0 row diffs (test mode AND development mode); full suite 940/0/58 (goldens + characterization included).
      `test/http/liveRoutes.test.ts#controllerKeyOf` taught the `match/` prefix.
- DEV-mode note: the DEV OpenAPI validator never rejects anything on these routes: the hand-written spec declares
  `servers: [{url: '/api'}]` while every route is mounted at the root, so no request matches a documented path
  (`POST /users {name:{}}` reaches the action in DEV too). Legacy-dev and test-mode probes are identical. F-89.
- [x] controller 2 `match/RoundsController` (rounds start/end/result/pause/resume): probe 0 response diffs, 0 final-row
      diffs, test and development mode; full suite 940/0/58. Probe extended with mid-run snapshots of `rounds.stoppage`
      after the odd-`stoppage` PATCHes (legacy baseline re-captured): the ONLY difference is the pre-recorded F-59
      storage divergence, never visible on the wire (the immediate PATCH responses, which render the round result
      method from the stored value, are identical):
      `stoppage: "yes"` legacy TEXT 'yes' / ported INTEGER 1; `"false"` 'false' / 1 (truthy in BOTH);
      `{a:1}` '[object Object]' / 1; urlencoded `stoppage=true` 'true' / 1. `0`, `false`, `true`, `null`: identical.
- [x] controller 3 `MatchesController` (create, GET, start, end): probe (extended to 272 requests: non-string competitor
      ids, override of matchId through query/body on start/end) 0 response diffs, test and development mode, legacy
      baseline re-captured with the same script; only the F-59/F-93 stoppage snapshots differ. Full suite 940/0/58.
      `POST .../matches` with `red.id: true|{}|[1,2]` reproduces Sequelize's `Argument passed to findByPk is invalid:
      <String(id)>` 500 (F-91).
- [x] `test/http/matchRoutes.test.ts` (7 tests): findByPk 500s + orphan competitor, numeric/unknown id 401, F-54 500
      with writes done, F-56 start 500 after writes, no `judges` on round/ridingTime payloads (F-65), `rider` ignored
      (F-55), keep-alive survives a 404 for an unknown match (F-92). Rollback check: removing `MatchesController`
      from PORTED_CONTROLLERS (legacy serves again) -> everything green except the keep-alive test (66/1), i.e. a
      clean rollback, and the keep-alive test is not vacuous.
- [x] stale comments updated (no task/finding refs added): `routes/index.ts` header, `errors.ts` NotImplementedError,
      `serialize/index.ts`, `services/README.md`.

## 2. Authorization per route (effective checks, legacy vs ported)

Gates are the task-12 specs, unchanged by this task; the only in-handler check is the competitor `assign` on create.

| route | legacy (callbacks + action) | ported (gate + handler) |
|---|---|---|
| POST /mat/:matCode/matches | authenticateRequest (401) -> `create a match`(mat) -> `assign`(mat) -> validateCreation (400) -> fetch red, blue -> `assign`(red), `assign`(blue) (null -> 401) | `matCode/create a match` gate (401, 401, 401) -> validate (400) -> handler: fetch red, blue -> `ctx.authorize('assign', user)` x2 |
| GET /match/:matchId | authn 401 -> requireMatch 404 (then double render) | `match/view`: 401 -> 404 |
| POST /match/:id/start, /end | authn 401 -> 404 -> `manage` 401 -> pre-checks 400 | `match/manage`: 401 -> 404 -> manage 401 -> handler pre-checks 400 |
| POST rounds, rounds/end; PATCH rounds/result | authn -> authenticateMatch: 404 -> `manage` 401 (-> validate for PATCH) | `match/manage` (-> validate for PATCH) |
| POST rounds/pause, rounds/resume | authn -> 404 -> `manage` -> `pause` (judge branch dead, F-11) | `match/pause`: 401 -> 404 -> manage -> pause. Master only; NOT widened. |
| POST, DELETE ridingTime | authn -> 404 -> open round else 400 -> `judge` 401 (-> validate for POST) | `match/judge, round: open`: same order |

Evidence: `test/characterization/authorization.test.js` UNMODIFIED against the live app 46/46 (10 isolated runs + every
full suite); `test/http/authorizationParity.test.ts`, `routeTable.test.ts` (per-route spec table) unchanged and green;
every authz deny/allow row in the 272-request probe identical to legacy.

## 3. Mutation proofs (characterization matrix, unmodified; each restored, md5 identical afterwards)

| id | mutation | result |
|---|---|---|
| a | `PATCH /rounds/result` gate `manage` -> `view` | 45/1: "DENIES a match judge every round-administration route" |
| b | `pause` gate drops the leading `manage` check (judges admitted) | 45/1: "DENIES a match judge — despite the `pause` permission granting judges access" |
| c | `POST /ridingTime` gate `judge + open round` -> `match/view` | 41/5: judge allow row, creator/viewer/outsider deny rows, "400 (not 401) when there is no active round" |
| r | remove `MatchesController` from PORTED_CONTROLLERS | matchRoutes keep-alive test fails only (clean rollback) |

Note: a first scripted attempt of a/b/c did not restore between mutations (zsh does not word-split an unquoted
`$FILES`), so b and c ran cumulatively; detected, all three files restored by reverse substitution (authorize.ts
back to HEAD, route specs checked line by line), and a/b/c re-run one at a time with an array and per-file backups
(the table above). md5 of the three files identical to the pre-mutation values after each run.

## 4. Mount order (F-81 re-evaluation)

Only System (+ DEV Docs) controllers are still registered by the legacy path; nothing they serve overlaps the
registry. Raw keep-alive socket: legacy closes the connection after `GET /match/<unknown>` 404; ported keeps it and
answers the next request (F-92). Ported mounted BEFORE the System controllers (temporary): authorization matrix +
liveRoutes + contract 5/5 green; restored (md5 identical). Kept as is (after). Authorization matrix alone 10/10;
full suites: 3 runs 940/0/58 before the new test file, 5 runs 947/0/59 after. No flake.

## 5. Live route table vs baseline

Booted `ApplicationServer`, Express stack read after `registerControllers()` (DEV mode, so the 3 docs routes exist),
`:param` -> `{param}`, sorted: identical to `artifacts/route-table.txt` (23 routes), no duplicates; test mode 20.
Registry serves 18. Legacy still serves: `GET /`, `GET /system/healthCheck`, and in DEV `GET /docs`,
`GET /docs.json`, `GET /async-docs.json` (SystemController/DocsController, task 13c).

## 6. Verification (2026-10-12, Bash; run_task unavailable)

- `bun run typecheck`: exit 0.
- `bun run test`: 947 pass / 0 fail / 59 files (baseline 940/58; +7 in test/http/matchRoutes.test.ts), 5 runs.
- goldens and test/characterization: zero modifications (git status clean for both).
- `bun run generate:openapi` x2 byte-identical; `openapi.json` unchanged (md5 6141f875e4ee9591a88f0e12fe6c3fa6).
- `bunx --bun drizzle-kit generate`: "No schema changes, nothing to migrate".
- real sqlite files untouched: config/db/database.development.sqlite (Apr 24), database.test.sqlite (Apr 20),
  server/database.sqlite (Jan 15).
- handlers import no `models/`, `lib/activeRecord`, `sequelize` (grep of imports/requires; and at runtime, requiring
  the three route modules loads 0 modules from models/, lib/activeRecord or sequelize).
