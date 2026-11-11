# Task 15a freeze notes (working log)

## Environment
- run_task MCP (agent-task-queue) failed to connect in this session: bun commands run through Bash (documented exception).
- Start commit (legacy code, unmodified): 6a55eaec2d873a0df55b3bfecba6d011c450eca6 (branch ts-migration), tree clean at start.

## Inventory (re-run 2026-10-13)
- require-form grep: same 31 files as the plan's table. import-form grep: none.
- mock.module paths at legacy code also in test/characterization/workers/tickIntervals.test.js (models/round, models/match; inert since task 14) -> must go for the gate.
- Not in grep but checked: test/server/applicationServer.test.js (src/http/server), test/controllers/mat/usersController.test.js (src only), test/services/modules.test.js (src only).

## Progress log
- Baseline recorded: artifacts/freeze/baseline.txt (996/0/65, per-file + all test names).
- Orchestrator update (user-approved) received mid-read: compact fixtures (delta vs seed, payload dedupe, compact authz grid, JSONL, <1.5MB/<15k lines total, <500KB/file),
  snapshot-update workflow (test/support/updateFrozen + `test:update-fixtures`, idempotent on current tree, behavior change shows as diff),
  README in fixtures dir, provenance header wording "snapshot of expected behavior, originally recorded from the pre-migration implementation on 2026-10-12".
- DESIGN: one encoder shared by freeze scripts (legacy runner) and the update script (modern runner); the frozen test computes the
  modern record, encodes it, and compares with the fixture record. The update script writing byte-identical fixtures on the
  current tree is itself a full new==legacy proof.
- Production gaps for the deletion proof (not fixed, 15a changes no production code): src/db/index.ts#resolveDatabasePath requires
  lib/activeRecord/db/connectionConfiguration (+ utils, config/db/config.js); src/http/routes/system.ts requires lib/openapi/asyncApiGenerator.
- Seed votes get RANDOM uuids (RidingTimeVote.create without id): seed-derived ids must be labelled by (table,rowid) in fixtures and in the seed dump diff.
- Built: server/test/support/{frozen,rowDelta}.js (canonical JSONL, row deltas by rowid, seed/gen id labels);
  test/services/lifecycleScenarios.js (69 scenarios, step DSL; +1 new: pause.withOpenVotes for round.test.js "pause does not end votes");
  test/workers/emissionScenarios.js (11 timelines; records split per payload/room/step).
  Freeze tooling: artifacts/freeze/{legacyHarness.js, legacySeed.ts (verbatim copy of seed.ts @6a55eae, model paths only), freezeLifecycle.js, freezeEmissions.js}.
  Run from server/: `bun ../.ai/plans/server-ts/artifacts/freeze/<script>` (utils.migrationsDirectory is cwd-relative).
- Trial (scratch) outputs: seed 120 recs 35KB; lifecycle 69 recs 55KB; emissions 255 recs 354KB.
  Legacy statement counts "all at once": techFall 412, breakTransition 28, roundTimer 197, matchUpdate 862 (== task-14 notes).
- Decision: legacy-only data that the current code cannot regenerate is NOT in fixtures (update script must be idempotent):
  statement counts -> literal constants in the test; F-59 legacy 'yes' half -> dropped (subject deleted); routeTable legacy owners
  -> already in the protected characterization fixture routeTable.txt (verify equality before switching).
- FREEZE RUN (official) 2026-10-13 23:07 on commit 6a55eaec2d873a0df55b3bfecba6d011c450eca6; `git status` for lib/ models/ controllers/
  src/ routes/ config/: no changes (only 15a's new untracked test/support, scenario modules, freeze tooling).
  Fixtures: seed 120, lifecycle 69, emissions 255 (11 scenarios), repositories 83, webSocketTier 68, permissions 31 (30 subjects + axes),
  errorRendering 13.
- DETERMINISM: trial run (scratch freeze1), official run, and a third run (scratch freeze2): all 7 files byte-identical (cmp).
  No F-105 nondeterminism leaked through the canonicalization (per-(step,job) room sort, per-step write log grouped by match).
- Permissions grid is 5 x 6 x 15 x 9 = 4,050 cells (15 scopes), NOT 4,320 as the plan/F-80 say: 1190 G, 2800 d, 60 throws.
- checkRouteTable.js: legacy reflection table == test/characterization/fixtures/routeTable.txt (23 routes, keys and owners).
- SEED REBUILT (test/contract/seed.ts on src/db/repositories insert functions; seed(clock, db?) opens DATABASE_PATH when no db given).
  seedEquivalence.js: legacy seed on legacy-migrated DB vs new seed on Drizzle-baseline DB: 120 rows, 1718 values incl. rowid +
  typeof, 0 differences; the 9 random vote ids differ by value only (both UUID v4, compared by position). New seed labelled dump ==
  committed seed.jsonl byte for byte.
- Http.migrate() now applies the Drizzle migrations (no legacy migrator). Contract capture/replay, openapi*, schemas, the UNMODIFIED
  authorization matrix (46), characterization routeTable, matchRoutes: 96/96 green on the new seed + Drizzle DB.
- SWITCHED (all green against the legacy-recorded fixtures, i.e. new == legacy):
  lifecycleParity 72 -> 74 (69 scenarios; +count guard; +pause.withOpenVotes; legacy-only F-59 half dropped),
  emissionDifferential 13 -> 14 (+guard; statement test compares with literal pre-migration totals),
  repositories/differential 7 -> 8 (+guard), webSocketTier 4 -> 5 (+guard), permissions 10 -> 10 (grid: 4,050 cells),
  envelope 52 -> 56 (13 error cases vs 10; +guard), routeTable 13 -> 13 (owners from the characterization fixture),
  liveRoutes 5 -> 5 (Sequelize half -> second Drizzle connection), goldenEquivalence 6 -> 6 (WS replay on src/workers),
  datetime 8 -> 6 (Sequelize-only: caveat F-47 + "Sequelize reads Drizzle row" dropped; codec legacy-isoStringify -> Drizzle
  write; + Invalid Date read).
- R4 survivor (viewer filter ignored; every seeded mat has <=1 viewer) killed by a NEW query nonViewerFiltered (user:outsider); repositories.jsonl re-recorded FROM LEGACY (freezeRepositories.js, lib/models untouched), deterministic (cmp with a scratch run), update script reproduces it.
- Provenance header reworded (single `note`: "originally recorded from the pre-migration implementation (commit 6a55eaec2d87) on 2026-10-13 ...").
  Re-ran the whole legacy freeze (freezeAll.sh) so the committed bytes are the legacy output; found freezeErrorRendering needed the
  deleted test/helpers/express.js doubles -> inlined verbatim. Third determinism run (scratch freeze4): 7/7 identical.
  `bun run test:update-fixtures --check`: 7/7 unchanged (current code regenerates the legacy-recorded fixtures byte for byte).
- Update script behavior-change proof: S3 (break_remaining always null) applied, update into a scratch copy -> emissions.jsonl 130 changed
  lines (records 255 -> 200, payloads dedupe), other 6 files unchanged; src restored (md5).

## Session 2 (2026-10-14): finishing after the interruption
- run_task MCP still unavailable (agent-task-queue: connection closed): bun commands run through Bash.
- State re-verified on entry: typecheck 0; `bun run test` 839/0/54 files (32 s); production code (src lib models controllers
  routes config bin) has no diff vs HEAD; authorization.test.js, test/contract/goldens/**, characterization/fixtures/routeTable.txt:
  no diff, no untracked files.
- Count reconciliation vs baseline.txt: 996 - 183 retired (activeRecord 58, models/round 26, server/* 93, matchUpdateWorker 6)
  = 813; + lifecycleParity 2, emissionDifferential 1, repositories/differential 1, webSocketTier 1, envelope 4, datetime -2,
  ws/units 15 (new), services/roundLifecycle 4 (new) = 839. Matches.

### Interrupted edit
- test/db/repositories/support.js was NOT half-written: the header diff is complete (task reference dropped, "seed.ts is not
  required here, it loads Sequelize" sentence replaced by "these tests build smaller graphs of their own"); the rest of the file
  is unchanged vs HEAD. Nothing to repair.

### Style-rule audit (committed files 15a touched or created)
- grep 'task ?[0-9]|F-[0-9]|FINDINGS|plan|server-ts' over every modified/untracked file under server/: hits fixed:
  tickIntervals.test.js header ("so task 14 cannot...", "Consumed by task 14", pointer to the retired matchUpdateWorker test,
  "(F-09.1)/(F-09.2)") -> restated in plain words.
  Remaining hits are not references to plan material: "capture plan" in seed.ts / goldenEquivalence (the plan list inside
  test/contract/capture.ts), and routeTable.test.ts reads `.ai/plans/server-ts/artifacts/route-table.txt` as DATA (functional
  path, pre-existing, the artifacts dir is tracked); left as is.
- ws/units.test.js: header comment moved above the first require. Fixture README / headers / test/support/*: no hits, read in full.

### Protected-instrument rewrites (evidence: `git diff HEAD -- test/characterization`), one-to-one
Every old test has exactly one new test (counts: errorMapping 17->17, matCode 11->11, techFallTracker 11->11,
breakTransition 13->13, roundTimer 20->20, tickIntervals 9->9). Old target -> new target; old assertion -> new assertion.
Mutations proving the new assertions can fail: see "Non-vacuity" below (C1..C16, X1..X3).

errorMapping.test.js: `ApplicationServer#requestHandler` (lib/server/applicationServer.js legacy dispatch, controller doubles from
the deleted test/helpers/express.js, models mocked) -> a registry route (`defineRoute` + `registerRoutes`, src/http/router) whose
handler throws, on a real Express app over fetch, rendered by src/http/middleware/errors.ts#handleError. Error classes from
src/http/errors instead of lib/server/serverController. All 17 test names unchanged; every expected status and body unchanged.
Mechanical substitutions only: response.statusCode -> HTTP status; response._body -> parsed body; `response.json` called once ->
`calls.json === 1` (res.json instrumented by a middleware); `response.end` called once -> `calls.end === 1`. The 4 mock.module
lines for models/{matCode,mat,match,user} are gone (nothing to mock: no token/mat/match is ever supplied).

matCode.test.js: `MatCode.CODE_REGEXP` (models/matCode) + `ServerController#setupRequestState` with mocked models ->
`CODE_REGEXP` from src/domain/matCode + `resolveRequestState` (src/http/middleware/requestState.ts) on a real in-memory DB
with decoys (a mat whose id IS the code string, a mat code whose code IS the UUID), so "the wrong lookup was used" shows up as
the decoy being returned.
- 7 regexp tests: identical assertions on the new regexp object.
- word-code :matId: findByCode called with code / Mat.find not called / currentMat is the mat / currentMatCode not null ->
  currentMatCode.code == code / currentMat.id == 'mat-1' (not the decoy mat whose id is the code) / currentMatCode not null.
- UUID :matId: Mat.find called with UUID / findByCode not called / currentMat is the mat / currentMatCode null ->
  currentMat.id == UUID and name 'Mat by id' (not mat-1 via the decoy code) / currentMatCode null.
- unknown word-code: currentMat null / currentMatCode null -> same two (the decoy mat 'no.such.code' proves Mat.find is not consulted).
- explicit matCode param: findByCode('a.b.c') / Mat.find not called -> currentMatCode.code 'a.b.c' / currentMat 'mat-1' (not the UUID mat).

techFallTracker.test.js: lib/workerQueue/techFallTrackerWorker with mocked models (fake rounds/matches) -> src/workers/
techFallTrackerWorker on a scratch Drizzle DB (test/characterization/workers/world.js, audit triggers), clock frozen;
`endRound` is the real src/services/matchLifecycle.endRound wrapped in a spy via mock.module(require.resolve(...)).
| old | new |
|---|---|
| only open rounds: Round.getOpenRounds called once, no args | an ENDED round already over the threshold: endRound not called, zero writes |
| nothing when no open rounds: no emit | same |
| never re-ends: 2nd tick with the round gone -> no emit | same, on real rows (the ended round drops out of the query) |
| every open round independently: both thresholds checked, 1 emit | below (10 s) + above (80 s) rounds: 1 emit, for the above match; below round still open |
| below threshold: checked, endRound not called, no emit | 70 s = 23 points (one short of 24): endRound not called, ended_at null, no emit |
| Match#endRound once, called with no args | endRound spy once with exactly (db, matchId) (no options), at exactly 24 points; round ended_at = NOW |
| event 'round.tech-fall' == EVENTS.TECH_FALL | same |
| endRound called before notifyServer | same, plus the round row already ended at the moment of emission |
| payload = toApiResponse({includeRounds:true}) with rounds rendered one by one | payload.rounds ids [r1, r2] in order, payload == serializeLeakedMatch(graph after the job, {includeRounds:true}) |
| render options exactly {includeRounds:true} (no includeMat/includeMatchJudges) | payload has rounds, has no mat, no judges |
| rejection from a round escapes performJob | a DB that throws on any use: performJob rejects 'db down' |

breakTransition.test.js: lib/workerQueue/breakTransitionWorker (Match.where/find mocked, Date.now spied) -> src/workers/
breakTransitionWorker on world.js, clock frozen with setSystemTime.
| old | new |
|---|---|
| Match.where({break_started_at: {ne: null}, ended_at: null}) | 3 matches: in break (selected), ended with a break (excluded), no break (excluded): only the first emits; others keep 1 round |
| ended_at: null in the filter, no emit | ended match with an expired break: no emit, still 1 round, zero writes |
| no match in break: no emit, Match.find not called | no emit, zero writes |
| unexpired: no save, no startRound, no emit | zero writes, no emit |
| 59 of 60 s: startRound not called | still 1 round |
| 60 of 60 s: startRound once | 2 rounds |
| break fields null, save once, save before startRound | row has null break fields; write log exactly [UPDATE matches, INSERT rounds] |
| startRound once with no args | 2 rounds, the second open |
| event 'break.ended' == EVENTS.BREAK_ENDED | same |
| Match.find(id) after startRound, emits the fresh payload | payload id, 2 rounds incl. the new round id, == serializeLeakedMatch(graph read after the job, all includes) |
| render options includeMat/includeMatchJudges/includeRounds | payload has mat, judges, rounds |
| two expired breaks: 2 emits | same |
| Match.where rejection escapes | failing DB: rejects 'db down' |

roundTimer.test.js: lib/workerQueue/roundTimerWorker (fake rounds with getMaxDuration/getPauses) -> src/workers/roundTimerWorker
on world.js (real round_pauses rows, real rDojoKombat durations 180/120/60), endRound spy as in techFall.
| old | new |
|---|---|
| only open rounds via getOpenRounds() | ENDED round past its duration: endRound not called, zero writes |
| nothing when no open rounds | same |
| every open round independently (getMaxDuration on both, 1 emit) | live (10 s) + expired (200 s): 1 emit, live open, expired ended |
| 1 s after start: no endRound, no emit | same |
| 179 s: no endRound | same |
| 180 s: endRound once | same |
| 680 s: endRound once | same |
| Match#endRound() no options | endRound spy (db, matchId), round ended |
| event 'match.update' == EVENTS.MATCH_UPDATE | same |
| endRound before notifyServer | same + round already ended at emission |
| payload rounds rendered individually, toApiResponse({includeRounds:true}) | rounds [r1, r2] in order, == serializeLeakedMatch(graph, {includeRounds:true}) (round 2, 120 s duration, 130 s old) |
| render options exactly {includeRounds:true} | payload has rounds, no mat, no judges |
| 7 pause tests (230/[200,140]; 260/two closed; 240/[200,140]; 10000/[9900,open]; 500/[300,open]; 400/[380,350]+[120,open]) | identical timings as real round_pauses rows, identical expectations |
| zero-length round: stub getMaxDuration -> 0 | a real 4th round (index past the configured durations -> 0), started now: endRound once |
| getMaxDuration rejection escapes | failing DB: rejects 'db down' |

tickIntervals.test.js: target already src/workers since task 14; 15a only removed the two inert mock.module lines for
models/round and models/match (nothing loads them) and reworded the header. Assertions untouched.

### Retired scaffolding: verified coverage
artifacts/freeze/coverage-map.md read row by row; every named covering test exists (grep of the test names in
test/ws/units.test.js, test/services/roundLifecycle.test.js, test/http/{registry,authorizationParity,liveRoutes,envelope,
permissions}.test.ts, lifecycleParity, emissionDifferential claims at lines 108-150). Checked specifically:
- webSocket (6) / webSocketServer (5) / workerWebSocket (3): test/ws/units.test.js has the same 14 behaviors (+ break.ended
  relay = 15). The IoServer.Server.prototype spies there assert call counts, so a spy on the wrong module build would fail them.
- serverController validators isInteger/isDateTime/isEmail/validateFunction: grep of controllers/ shows only `presence`
  (usersController, matsController) and `isEnum` (roundsController, ridingTimeVoteController): "subject deleted" holds.
- matchUpdateWorker: final update after a match ends -> emissionDifferential claims (exactly one final match.update with
  mat/judges/rounds after tech fall / timer end in the final round; 2.25 s final inside the throttle window). Killed by E-M1/E-M8.
- models/round.test.js: the two non-reachable behaviors (pause on a round without a start time; isRoundPaused x3) are in
  test/services/roundLifecycle.test.js (4 tests); "pause does not end votes" -> new lifecycle scenario pause.withOpenVotes.
- activeRecord/**: subject deleted. Inherited behaviors: ISO datetime (test/db/datetime.test.js), unique-violation mapping
  (envelope "a REAL SQLite unique violation through Drizzle"), busy timeout (test/db/busyTimeout.test.ts), DATABASE_PATH
  (liveRoutes). The one inherited behavior with no new-stack test is the `config/db/database.<env>.sqlite` fallback, because
  src/db/index.ts#resolveDatabasePath still delegates to lib/activeRecord (production gap, 15b re-homes it): recorded as F-107.
No unique behavior found uncovered; no assertion needed porting in this session.

### Mock-path audit (every mock.module in a rewritten/retargeted/new test file)
Only three files have mock.module: techFallTracker, roundTimer (matchLifecycle via require.resolve), tickIntervals
(socket.io-client via require.resolve, ../../../lib/logger). Probes = temporary copies of the test next to the original
(same relative paths), run with `bun run test -- <copy>`, deleted after; originals md5-identical afterwards.
- techFallTracker: mock replaced by one whose endRound throws -> 7 fail; mock removed -> 2 fail ("ends the round through
  endRound", "BEFORE emitting"). The mock applies to the TS worker's `import { endRound }`.
- roundTimer: throwing mock -> 12 fail; mock removed -> 8 fail. Applies.
- tickIntervals lib/logger: factory that throws -> file fails to load (factory runs, so the path is loaded). Applies.
- tickIntervals socket.io-client: mocked `io` that throws -> "close() cancels..." fails. Applies (worker.ts requires the CJS
  build, F-103). Note: with the io mock REMOVED all 9 still pass (the real client is created and closed at once); the mock is
  not load-bearing for any assertion, only keeps the test off the network. Not a vacuity problem.
- No other new/rewritten file mocks modules. test/ws/units.test.js spies IoServer.Server.prototype and asserts call counts, so a
  spy on a different module build would fail it (it passes).

### Non-vacuity (session 2): artifacts/freeze/mutation-results.md (mutate15a.js, + DT1/DT2/SD1/SD2 added this session)
Per frozen suite, mutations run / killed:
- lifecycleParity (lifecycle.jsonl + seed.jsonl): L-M1..M12 12/12; seed SD1, SD2 2/2
- emissionDifferential (emissions.jsonl): E-M1..M17 16/17 (E-M16 equivalent, recorded since task 14; killed as C4 by the
  rewritten techFall characterization test)
- webSocketTier: W1..W10 10/10 (W1 by crashing the suite)
- repositories/differential: R1..R5 5/5
- permissions: P1..P3 3/3 (P3 = pause widened to judges first)
- envelope (errorRendering.jsonl) + errorMapping: X1..X3 3/3
- goldenEquivalence + contract: S1,S3,S5,S6,S7,S8 6/6
- routeTable/liveRoutes/characterization routeTable/authorization: RF1..RF3 3/3
- datetime: DT1, DT2 2/2
- rewritten characterization tests: C1..C16 16/16
Total 78 killed / 1 equivalent survivor. Whole-tree md5 (src, test, lib: 204 files) identical before and after.
Fixture canaries (canaries15a.py), one value per fixture file: 7/7 fail the expected test; fixtures md5-identical after.

### Final gate greps (from server/)
- legacy require/import grep (plan step 10, first command): no output, exit 1.
- legacy mock.module grep (second command): no output, exit 1.
- broader text grep (lib/server, config/db, sequelize, routes/, lib/controllers) under test/: only prose/strings (error names
  'SequelizeUniqueConstraintError', comments, sample path strings in workers/modules.test.js), no module loads.
- `sqlite3` under test/: only test/db/busyTimeout.test.ts (the documented exception, handled in 15b).

### Deletion proof (throwaway worktree, 2026-10-14)
`git worktree add --detach <scratchpad>/wt15a HEAD`; rsync of the main tree's server/test (diff -r identical) + package.json;
deleted models/, lib/activeRecord, lib/workerQueue, controllers/, lib/openapi, routes/, lib/server/{abstractWebSocket,
applicationServer,authorizer,docsController,index,serverController,systemController,webSocket,webSocketServer,workerWebSocket}.js;
`bun install --frozen-lockfile` (fresh worktree has no node_modules). No test edited.
- Run 1 (as deleted): 770 pass / 24 fail, 794 tests ran (files that hung on server boot count fewer), 410 s. Root cause, verified
  with `bun -e`: src/db/index.ts#resolveDatabasePath requires lib/activeRecord/db/connectionConfiguration even when
  DATABASE_PATH is set, so every lazily opened DB throws -> every HTTP route answers 500 and the boot/capture/replay hooks time
  out. Failing: contract.test.js (hook timeout), capture.test.js (timeout), openapiValidation.test.js (hook timeout),
  authorization.test.js (10, POST /users -> 500), goldenEquivalence (2), liveRoutes "opens the database lazily, at
  DATABASE_PATH" (1), matchRoutes (7), workers/modules.test.js (boot timeout).
- Run 2, same worktree with ONLY the two known production gaps stubbed (probe, never in the main tree): resolveDatabasePath ->
  `process.env.DATABASE_PATH || config/db/database.<env>.sqlite` without the legacy require; system.ts asyncApiGenerator
  require -> `({})`: 838 pass / 1 fail / 839 tests, 32 s. The one failure is openapiValidation "still serves the root and the
  docs routes" expecting `asyncapi: '2.6.0'` from /async-docs.json, i.e. the stubbed asyncApiGenerator itself.
  => every failure traces to gap 1 (resolveDatabasePath) or gap 2 (system.ts -> lib/openapi/asyncApiGenerator). busyTimeout
  passes here because the sqlite3 package is still installed (it fails only once 15b removes the dependency). Recorded as F-107.
- Cleanup: `git worktree remove --force`, `git worktree prune`; `git worktree list` shows only /Users/parth/dev/accord; the
  wt15a directory is gone. Main tree: no production diff.

### Final verification (2026-10-14, from server/, bun via Bash)
- `bun run typecheck`: exit 0.
- `bun run test` x3 consecutively: 839 pass / 0 fail / 54 files each (31.9 s, 31.8 s, 31.8 s).
- `bun run test:update-fixtures --check`: exit 0, 7/7 unchanged; fixtures md5-identical.
- `bun run generate:openapi` twice: identical, openapi.json md5 5077a4187837f8765f196871cddcd719 before and after, no git change.
- `timeout 60 bunx --bun drizzle-kit generate < /dev/null`: "No schema changes, nothing to migrate"; drizzle/ unchanged.
- Real sqlite files untouched (mtimes as at session start): database.sqlite, config/db/database.{development,test}.sqlite.
- Fixture sizes (budget: total < 1.5 MB and < 15,000 lines, < 500 KB per file):
  emissions 354,263 B / 256 lines; lifecycle 55,394 / 70; seed 35,110 / 121; repositories 12,710 / 84; permissions 7,354 / 32;
  webSocketTier 6,714 / 69; errorRendering 1,965 / 14; README 3,143 / 52. Total 476,653 B / 698 lines. Within budget.
- git: 16 deleted, 23 modified, 13 untracked (unchanged set); no production file changed; nothing committed.
- FINDINGS appended: F-107 (deletion blockers), F-108 (4,050 cells), F-109 (F-95/F-104 resolved), F-110 (fixture regeneration
  rule), F-111 (non-load-bearing io mock; W1 crash-kill).
