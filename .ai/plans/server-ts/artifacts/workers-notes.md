# Task 14 — workers and WebSocket tier: working notes

`run_task` MCP unavailable in this session (agent-task-queue failed to connect);
every `bun` command runs through Bash with explicit timeouts.

## 0. Step-4 verification (2026-10-13)

| Assumption | Reality |
|---|---|
| plan: `break_remaining` WS-only | wrong (F-20); computed on every render. WS payloads use `serializeLeaked*` (F-22 leak kept). |
| plan step 4: wrap performJob | behavior change, deferred (orchestrator). Base loop ported unwrapped; `performJob()` abstract. |
| plan step 3: characterization worker tests "pass unchanged" against the rewrite | `techFallTracker`, `breakTransition`, `roundTimer` mock `models/round` / `models/match` and drive fake model instances (`hasReachedTechFallThreshold`, `getMatch`, `save`, `startRound`, `Match.where`); they test the legacy classes through the model API. No path-only edit can point them at Drizzle-based workers. Left UNTOUCHED (still green against `lib/workerQueue`, which stays on disk until task 15). The new classes are adjudicated by the differential emission test (legacy vs new on identical DBs) plus new unit tests restating the same pins. `tickIntervals.test.js` CAN be retargeted path-only (see section 3). |
| `test/characterization/routeTable.test.js:119` | control assertion requires `lib/server/webSocketServer` to be in the require cache of a booted server; becomes false once server.ts loads `src/ws`. Path-only retarget. |
| `test/workerQueue/matchUpdateWorker.test.js`, `test/server/{webSocket,webSocketServer,workerWebSocket}.test.js` | not protected; unit tests of the legacy classes via model/socket mocks. Left on the legacy modules (deleted with them in task 15); new TS tests cover the new modules. |
| `test/contract/capture.ts` | requires `lib/workerQueue/*`; path-only retarget to `src/workers` (approved). No mock.module in it. |
| `test/serialize/goldenEquivalence.test.js` | uses the legacy workers as the oracle for the serializers. Left on legacy (oracle role). |
| token | constructor injection kept; no server-side validation (task 18). |

## Progress

- [x] read everything listed
- [x] src/ws/{abstractWebSocket,webSocket,workerWebSocket,webSocketServer}.ts, src/workers/{worker,matchUpdateWorker,techFallTrackerWorker,roundTimerWorker,breakTransitionWorker,index}.ts; `findFirstUserWithApiTokenIn` added to `src/db/repositories/users.ts`; server.ts imports the new WebSocketServer and passes its db; bin/worker path-only. typecheck 0.

## 1. WebSocket auth/join semantics (black-box probe, scratchpad `wsProbe.js`)

Server in a child process (crashes observable), 22 scenarios, socket.io-client websocket transport, a fake worker
socket broadcasting `match.update` into the room after each scenario. Run on the LEGACY tier first (before the switch),
then on the new tier: identical in every field except the client's `disconnected` reason in two crash scenarios
(`io client disconnect` vs `transport close`: when the crash lands relative to the client's own close; both crashed with
the same error). Legacy findings (all reproduced, NEW, see F-100..F-102):
- unknown token (any truthy `auth.apiToken` matching no user): connection SUCCEEDS (`disconnect()` inside an io
  middleware is a no-op on a not-yet-connected socket, then `next()` connects it). Then:
  - `match.join <existing id>` -> `can('view')` true -> `logger.info(... this.currentUser.id ...)` TypeError ->
    unhandled rejection -> WEB PROCESS EXITS (code 1);
  - `room.join 'match:<id>'` -> joined, receives every match.update (with the F-22 competitor api_tokens). No
    authentication needed beyond a truthy junk token. Same for any worker-token socket and for authenticated users.
- no token at all: connected, but no handlers, so it cannot join.
- `match.join` with `true` / `{}` / `[..]` (findByPk refuses) -> unhandled rejection -> web process exits.
- `auth.apiToken: [token]` authenticates (Sequelize `IN`), `['x', token]` too; `{}` -> connect_error "Invalid value {}";
  `5` -> connects with no user (then crashes on match.join like the unknown token).
Port: `findUserForToken` (scalar `=`, array `IN` smallest token first (probed 30/30 pairs), object `Invalid value
<inspect>`), `findMatchForId` (findByPk rules), same `this.currentUser.id` expression in the log.

## 2. ESM `import` vs `require` of dual packages (NEW finding F-103)

Mock audit of the retargeted tickIntervals.test.js found its `mock.module(require.resolve('socket.io-client'))` did NOT
apply to `src/workers/worker.ts` when that file used `import { io } from 'socket.io-client'`: bun resolves `import` via
the package's `exports.import` condition (`build/esm-debug/index.js`), `require.resolve` gives `build/cjs/index.js`.
Fixed by requiring both socket.io packages (`require('socket.io-client')`, `require('socket.io')`) with `import type`
for the types, as the legacy files did.

## 3. Mock audit (retargeted tests)

- `test/characterization/workers/tickIntervals.test.js` (path-only: 5 worker requires -> src/workers):
  - `mock.module(require.resolve('socket.io-client'))`: applies after the require fix. Probe: worker.ts throws in
    `connect()` unless `io` is a mock -> 9/9 pass; control with the mock line removed -> the close() test fails.
  - `mock.module('../../../lib/logger')`: applies (worker.ts imports the same `lib/logger.ts`). Probe: worker.ts
    throws at load unless `logger.debug` is a mock -> 9/9; control without the mock line -> file fails to load.
  - `mock.module('../../../models/round' | 'models/match')`: inert (no new module loads models/) and irrelevant: with
    both removed the file passes 9/9 plus an added probe asserting nothing from models/, lib/workerQueue or
    lib/server/*ebSocket* is in the require cache. No new path exists for them; left as they are (path-only rule).
  - probes ran on a temporary copy in the same directory, deleted afterwards; worker.ts restored (cmp).
- `test/characterization/routeTable.test.js`: one require.resolve path (control assertion), no mocks.
- `test/contract/capture.ts`: 3 worker requires, no mocks.
- `test/server/applicationServer.test.js` (not protected): WebSocketServer require; it spies on the prototype, so a
  wrong path would make "starts the web socket server" fail (non-vacuous by construction).

## 4. Differential emission test (`test/workers/emissionDifferential.test.js`)

Legacy workers (lib/workerQueue, Sequelize) on a temp FILE built by the legacy migrations; new workers (src/workers,
Drizzle) on an in-memory Drizzle-baseline DB; both restored to the same raw rows before each scenario (support.js
snapshot/restore). Clock frozen per step (setSystemTime). Persistent worker instances per scenario, every 250 ms step
runs matchUpdate, whole seconds run techFall, breakTransition, roundTimer, matchUpdate (one scenario runs matchUpdate
first). Captured at `notifyServer`: (step, job, event, room, payload JSON round trip). Compared: emissions, outcome of
every job run and every "HTTP" action (pause/resume/start/end via legacy model vs service), and after EVERY step the
full tables plus the trigger write log. New payloads also go through `assertSocketPayload` (event schema).

Two canonicalizations, both because the legacy jobs handle matches concurrently (Promise.all over Sequelize I/O):
1. emissions within one (step, job) group are sorted by room, stably. Legacy emits in completion order (it varied with
   per-match query counts), the new jobs in query order. No client can observe cross-room order. Order within a room,
   and of steps and jobs, is exact.
2. the write log is grouped by owning match, stably. First run showed the legacy cross-match write interleaving
   VARIES BETWEEN RUNS (two tech falls in one tick: "400 then 500" in one run, "500 then 400" in the next). Per-match
   write order is exact.
Generated ids (new rounds) labelled by first appearance; fixture ids are known.

Scenarios (11, + a self-check and a statement report = 13 tests): idle ticks; open round cadence (emits at 0,1,2,3 s
on a 250 ms tick); pause + resume (actions); break countdown 55,54,53 then 1, expiry at 55 s -> break.ended with the new
open round; tech fall round 1 (payload rounds only, break_remaining 60); tech fall in round 3 -> match ends -> exactly one
final match.update; round timer expiry round 1 with a resumed pause; round timer expiry round 3 -> one final update then
silence; a rejecting tick (expired break over an open round: "Cannot start a new round while there is an active round"
on both, same writes: break cleared first); all at once (9 matches, master-ended match with the stale break (F-25.3) ->
one final update with break_remaining 60, timer3 ends and `starter` starts in the same tick); all at once with
matchUpdate first. Stable 3/3 runs.

Mutations (scratchpad `mutate.py`, applied to src/workers, run, restored; md5 identical afterwards): 16/17 killed.
| # | mutation | failing tests |
|---|---|---|
| M1 | MU: drop final-broadcast branch | 4 |
| M2 | MU: throttle 1000 -> 750 | 9 |
| M3 | MU: `>=` -> `>` | 9 |
| M4 | TF: emits `match.update` (wrong event) | 4 |
| M5 | TF: payload includes mat | 4 |
| M6 | TF: emit before ending the round (order swap) | 4 |
| M7 | BT: startRound before clearing the break (order swap; payload equal, write log differs) | 3 |
| M8 | MU: never remember the active set | 4 |
| M9 | RT: ignore pauses | 3 |
| M10 | TF: red only | 3 |
| M11 | BT: `<` -> `<=` | 3 |
| M12 | MU: no break broadcasts | 5 |
| M13 | RT: payload with all includes | 4 |
| M14 | MU: safe serializer (no F-22 leak) | 9 |
| M15 | BT: render before the new round exists | 3 |
| M16 | TF: `endRound(..., {safe: true})` | 0: equivalent without a race (the F-58 race is timing-dependent in legacy, not scriptable deterministically) |
| M17 | MU: first tick not broadcast | 9 |
(Run with the rejecting-tick scenario added after: re-run below in verification.)

## 5. Query counts (same scenario, both sides, statements per job run)

Legacy counted with Sequelize `options.logging`, new with `$client.prepare`. "All at once" scenario (9 matches):
| job | total legacy | total new | one tick at 5 s, legacy | new |
|---|---|---|---|---|
| techFall | 412 | 59 | 22 | 2 |
| breakTransition | 28 | 17 | 1 | 1 |
| roundTimer | 197 | 55 | 10 | 2 |
| matchUpdate | 862 | 107 | 53 | 3 |
A throttled (quiet) matchUpdate tick: 2 vs 2.

## 6. WebSocket tier differential (`test/ws/webSocketTier.test.js`)

Legacy and new WebSocketServer each on their own http.Server, same legacy-migrated DB (legacy via models, new via
Drizzle; read-only). 25 client scripts (auth types, joins, leaves, room.join bypass, worker socket, forged client
relay), identical observations required; direct handler calls for the crashing cases (same error class + message);
token lookup matrix (24 JSON values) and match lookup matrix (12) vs the legacy model lookups. Mutations (scratchpad
`mutateWs.py`), 10/10 killed: W1 reject unknown-user socket, W2 refuse array tokens, W3 null-safe join log, W4 room
name, W5 drop room.join, W6 relay tech-fall as match.update, W7 require a user to view, W8 numbers throw, W9 worker
branch first, W10 largest token wins.

## 7. End to end (scratchpad `e2e.js`, `serverBoot.js`, `dumpCache.js`)

Temp DB from the legacy migrations (NODE_ENV=test). Web process: `new ApplicationServer({workerToken}).listen()` in a
child (`serverBoot.js`: bin/www minus its `npm run worker` spawn). Worker: `bun ./bin/worker <token>` with `PORT` and
`PROC_NAME=WORKER` in the environment (as bin/www passes them), `LOG_LEVEL=debug`. Both preload `dumpCache.js` (writes
the project modules in the require cache to a file every second). Users/mat/match/judges via HTTP; judgeA and a viewer
join the room with socket.io-client (websocket transport). Time is advanced by moving every timestamp of the match back
(a `shift()` helper on a separate bun:sqlite connection), not by sleeping. Transcript:

```
[16:06:38.037] server up on 49792
[16:06:38.073] match 15e52736-0bb8-4620-9e2b-98b55c5d11ee
[16:06:38.402] match started
[16:06:42.603] 1. cadence during round 1:
[16:06:42.604]     1.04s match.update rounds=1 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[0,0]]
[16:06:42.604]     2.05s match.update rounds=1 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[0,0]]
[16:06:42.604]     3.07s match.update rounds=1 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[0,0]]
[16:06:42.605]     4.09s match.update rounds=1 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[0,0]]
[16:06:42.625] 2. match moved 80 s back (red consensus for 80 s: 26 points, threshold 24)
[16:06:46.127]     0.55s round.tech-fall rounds=1 open=0 break_remaining=60 ended_at=null mat=false judges=false score=[[26,0]]
[16:06:46.127]     0.87s match.update rounds=1 open=0 break_remaining=60 ended_at=null mat=true judges=true score=[[26,0]]
[16:06:46.128]     1.88s match.update rounds=1 open=0 break_remaining=59 ended_at=null mat=true judges=true score=[[26,0]]
[16:06:46.128]     2.91s match.update rounds=1 open=0 break_remaining=58 ended_at=null mat=true judges=true score=[[26,0]]
[16:06:46.130] 3. match moved 61 s back (break of 60 s expired)
[16:06:48.632]     0.06s break.ended rounds=2 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[26,0],[0,0]]
[16:06:48.632]     0.42s match.update rounds=2 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[26,0],[0,0]]
[16:06:48.632]     1.44s match.update rounds=2 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[26,0],[0,0]]
[16:06:48.632]     2.47s match.update rounds=2 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[26,0],[0,0]]
[16:06:48.637] 4. match moved 125 s back (round 2 is 120 s)
[16:06:51.147]    match moved 61 s back (break expired)
[16:06:53.652]     0.59s match.update rounds=2 open=0 break_remaining=60 ended_at=null mat=false judges=false score=[[26,0],[0,0]]
[16:06:53.652]     0.98s match.update rounds=2 open=0 break_remaining=60 ended_at=null mat=true judges=true score=[[26,0],[0,0]]
[16:06:53.652]     2.00s match.update rounds=2 open=0 break_remaining=59 ended_at=null mat=true judges=true score=[[26,0],[0,0]]
[16:06:53.652]     2.59s break.ended rounds=3 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[26,0],[0,0],[0,0]]
[16:06:53.652]     3.03s match.update rounds=3 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[26,0],[0,0],[0,0]]
[16:06:53.652]     4.04s match.update rounds=3 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[26,0],[0,0],[0,0]]
[16:06:53.658] 5. match moved 65 s back (round 3 is 60 s)
[16:06:58.663]     0.04s match.update rounds=3 open=1 break_remaining=null ended_at=null mat=true judges=true score=[[26,0],[0,0],[0,0]]
[16:06:58.664]     0.60s match.update rounds=3 open=0 break_remaining=null ended_at=set mat=false judges=false score=[[26,0],[0,0],[0,0]]
[16:06:58.664]     0.81s match.update rounds=3 open=0 break_remaining=null ended_at=set mat=true judges=true score=[[26,0],[0,0],[0,0]]
[16:06:58.664]    viewer received the same events: true
[16:07:02.089] 6. last ~3.4 s of worker debug output: techFall 3 breakExpiry 3 timerExpiry 3 broadcast 4
[16:07:02.096]    second match updates: 3 worker exit: null server alive: 200
[16:07:02.096]    totals for match 1 (judgeA): [["match.update",18],["round.tech-fall",1],["break.ended",2]]
[16:07:03.298]    server process: 70 project modules loaded; legacy worker/socket/model modules: []; src/ws: 4; src/workers: 0; sequelize-backed lib/activeRecord: lib/activeRecord/db/connectionConfiguration.js,lib/activeRecord/utils.js
[16:07:03.298]    worker process: 50 project modules loaded; legacy worker/socket/model modules: []; src/ws: 2; src/workers: 6; sequelize-backed lib/activeRecord: lib/activeRecord/db/connectionConfiguration.js,lib/activeRecord/utils.js
```

Reading it: (1) match.update every ~1.02 s during round 1 (judge and viewer receive the same events); (2) tech fall:
`round.tech-fall` without mat/judges, break_remaining 60, then match.update 60, 59, 58; (3) `break.ended` with round 2
open, break null; (4) round 2 timer expiry: RoundTimer's match.update (rounds only), break 60, 59, then `break.ended`
with round 3; (5) round 3 timer expiry ends the match: RoundTimer's match.update (rounds only, ended_at set) and
exactly ONE full final match.update from MatchUpdateWorker (mat + judges), then silence for 4 s; (6) all four jobs
alive afterwards: debug lines in the last 3.4 s: tech fall 3, break expiry 3, timer expiry 3, broadcast 4; a second
match started afterwards receives updates; worker not exited; server healthy. (A first attempt that back-dated only
some rows produced an invalid state, see F-106 (6); not a port issue: the differential covers legacy == new there.)
Require caches: web process 70 project modules, worker 50; neither loads anything from models/, controllers/,
lib/workerQueue or lib/server/{abstractWebSocket,webSocket,webSocketServer,workerWebSocket,authorizer}.js; the worker
loads all 6 src/workers files and src/ws/{workerWebSocket,abstractWebSocket} (EVENTS). Both load
lib/activeRecord/db/connectionConfiguration.js + utils.js (the existing DB path resolver of src/db). Also pinned
permanently by `test/workers/modules.test.js` (with a control).

## 8. Verification (2026-10-13, Bash; run_task unavailable)

- `bun run typecheck`: exit 0.
- `bun run test`: 996 pass / 0 fail / 65 files, 3 consecutive runs, no flake (baseline 965 / 61; +13 emission
  differential, +4 ws differential, +11 worker unit, +3 module boundaries). The differential file alone: 3/3 stable
  before the suite runs, and in every suite run.
- Protected tests touched, path-only: `test/characterization/routeTable.test.js` (1 line: require.resolve path of the
  WebSocketServer control assertion), `test/characterization/workers/tickIntervals.test.js` (5 require paths),
  `test/contract/capture.ts` (3 require paths). Goldens untouched; ws.* goldens now produced by the NEW workers through
  the real socket tier (capture -> contract.test.js) and pass.
- `bun run generate:openapi` x2: md5 5077a418... both times, openapi.json unchanged (git diff empty).
- `timeout 60 bunx --bun drizzle-kit generate`: "No schema changes, nothing to migrate".
- real sqlite files: md5 unchanged (development aef3d070..., test and database.sqlite empty), mtimes unchanged.
- legacy files on disk untouched: lib/workerQueue/*, lib/server/*ebSocket*.js, models/ (git status clean for them).

## 9. performJob footgun (F-03 / F-17 / F-98), unchanged

`Worker#_performJob` is ported unwrapped: `if closed return; await performJob(); queueJob()`. A rejection is not
caught, never re-queues, and escapes the timer callback as an unhandled rejection, which ends the whole worker
process under bun (F-98). `performJob()` is `abstract`. Pinned in `test/workers/worker.test.ts` ("lets a rejection
escape and does not re-queue") and, end to end, by the differential's rejecting-tick scenario (same error on both
sides). Nothing new beyond F-100..F-106.
