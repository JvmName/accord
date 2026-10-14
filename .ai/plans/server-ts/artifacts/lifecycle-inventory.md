# Lifecycle inventory (server-ts task 10b)

Progress notes + the inventory that drives `server/src/services/*`. Written
incrementally so the work survives an interruption.

## Status log

- [x] Read plan, FINDINGS, repositories, domain, models, workers, controllers, tests.
- [x] Inventory (below).
- [x] Services written (`src/services/{matchLifecycle,roundLifecycle,ridingTimeVotes}.ts`); typecheck 0.
- [x] Parity harness (`test/services/support.js`, `lifecycleParity.test.js`): 72/72 green.
  Harness found on first run: (a) missing-competitor setResult keeps the old
  `declared_winner_id` (Sequelize omits an `undefined` attribute) -> service
  fixed to pass `competitor?.id` through undefined; (b) a non-boolean
  `stoppage` is stored verbatim by legacy -> pinned divergence, F-59;
  (c) a test-fixture error (timer scenario had an open pause, which freezes
  the clock; legacy correctly did nothing) -> fixture fixed.
- [x] Mutation proofs (scripted: apply to the service file, run
  `test/services/lifecycleParity.test.js`, restore from the in-memory original;
  md5 of `src/services/*.ts` verified identical afterwards). ALL 12 KILLED:

  | Mutation | Failing parity tests |
  |---|---|
  | M1 Round#end: resume pause BEFORE closing votes (swap steps 1/2) | 3 |
  | M2 Round#end: drop the vote close | 8 |
  | M3 Match#endRound: remove the `safe` branch | 6 |
  | M4 Round#end: early match end at 2 wins | 1 (NO EARLY EXIT) |
  | M5 Match#end: do not clear break fields | 2 |
  | M6 Match#end: endRound before writing ended_at (swap) | 2 |
  | M7 Round#end: set ended_at before resuming the pause | 5 |
  | M8 setResult: drop the Sequelize no-op skip | 3 |
  | M9 Match#start: skip copying mat judges | 5 |
  | M10 pause: drop the already-paused check | 1 |
  | M11 endRidingTime: honour the rider colour (a "fix") | 1 |
  | M12 break duration index off by one | 1 |
- [x] FINDINGS F-54..F-62; `src/services/README.md`; `src/db/README.md` note on F-50.
- [x] Verification (2026-10-11, Bash; run_task MCP unavailable): typecheck exit 0;
  `bun run test` 674 pass / 0 fail / 45 files (baseline 598 / 43; +72 parity,
  +4 modules); drizzle-kit generate "No schema changes"; generate:openapi twice
  identical, openapi.json unchanged; real sqlite mtimes unchanged; git status:
  only new src/services/, test/services/, this file, and src/db/README.md;
  "transaction" / "models/" in src/services appear only in comments.

## Lifecycle methods x call sites

Legacy method | Body (order of effects) | Call sites (args) | Resolves to
---|---|---|---
`Match#start()` (`models/match.js:75`) | throw `Error("This match has already started")` if `started_at`; then (inside a NON-atomic `Match.transaction`, F-50): `started_at = new Date()`, save; `mat = getMat()`; `judges = mat.getJudges()` (by user_id); `setJudges(judges)` (belongsToMany#set: SELECT current, DELETE obsolete, bulk INSERT new); `startRound()` | `matchesController.js:46` `currentMatch.start()` (controller pre-checks `started` -> 400 'match has already started') | `undefined`
`Match#end()` (`match.js:90`) | throw `"This match has already ended"` if `ended_at`; throw `"This match has already not started"` if `!started_at`; (NON-atomic transaction) `ended_at = now`, `break_started_at = null`, `break_duration = null`, save; `endRound({safe: true})` | `matchesController.js:63` `currentMatch.end()` (controller pre-checks not started / ended -> 400); `round.js:164` from `Round#end` when `allRounds.length == maxRounds` | `undefined`
`Match#startRound()` (`match.js:111`) | `lastRound = getLastRound()`; if `lastRound && !lastRound.ended` throw `"Cannot start a new round while there is an active round"`; `Round.create({match_id})`; log `Round created: match=.. round=..` | `roundsController.js:14` `currentMatch.startRound()` (catch -> 400 renderErrors); `breakTransitionWorker.js:28` (after `break_* = null; save()`); `Match#start` | `undefined`
`Match#endRound({safe}={})` (`match.js:123`) | `lastRound = getLastRound()`; if none or ended: `safe` -> return, else throw `"No available round to end"`; `lastRound.end()` | `roundsController.js:26` `endRound({safe: false})`; `roundTimerWorker.js:43` and `techFallTrackerWorker.js:65` `endRound()` (safe undefined = falsy); `Match#end` `endRound({safe: true})` | `undefined`
`Match#getLastRound()` | last of `getRounds()` (created_at, rowid) or `null` | rounds/ridingTime controllers, `startRound`, `endRound` | repo `findLastRound`
`Match#competitorForColor(color)` | `color = C + olor.lower`; `this['get'+color+'Competitor']()` (TypeError for any other colour; TypeError for undefined colour) | `Round#startRidingTime`, `Round#setResult` | `User` or `null`
`Round#end()` (`round.js:141`) | 1. end every open vote (`getRidingTimeVotes({where:{ended_at:null}})`, rowid order, each `vote.end()`); 2. `if (isPaused()) resume()`; 3. `match = getMatch()`; 4. `ended_at = now`, save; 5. scores (log only) + log `Round ended:`; 6. `allRounds = match.getRounds()`; log `Round transition:`; 7. if `allRounds.length == maxRounds`: log `Match ending:`, `match.end()`; else `d = rules.getBreakDuration(allRounds.length)`, log `Break check:`, if `d > 0`: `match.break_started_at = now`, `break_duration = d`, save, clear rounds cache, log `Break started:`. NO guard on an already-ended round. | only via `Match#endRound` | `undefined`
`Round#pause()` | throw `'Round has not started'` if `!created_at`; `'Round has already ended'` if `ended_at`; `'Round is already paused'` if a pause is open; insert `RoundPause{round_id, paused_at: now}` | `roundsController.js:74` (controller pre-checks last round active -> 422) | `undefined`
`Round#resume()` | `openPause = getCurrentPause()` (last open by rowid); none -> throw `'Round is not paused'`; `openPause.resumed_at = now`, save. No ended check. | `roundsController.js:94` (same 422 pre-check); `Round#end` | `undefined`
`Round#setResult({winner, stoppage=false}={})` | throw `'Cannot set result on a round that has not ended'` if `!ended_at`; winner truthy: `competitor = match.competitorForColor(winner)`, `declared_winner_id = competitor?.id`, `stoppage = stoppage`; else both `null`; save (Sequelize: skipped when nothing changed) | `roundsController.js:52` `lastRound.setResult({winner: params.winner, stoppage: params.stoppage})` (controller pre-checks result window = break or match ended -> 422, and last round ended -> 422) | `undefined`
`Round#startRidingTime(judge, riderColor)` | `currentRidingTimeVoteForJudge(judge)` exists -> throw `'Riding time is already active'`; `match = getMatch()`; `competitor = match.competitorForColor(riderColor)`; insert vote `{competitor_id: competitor.id, judge_id, round_id}`. No paused/ended check (controller only routes to an active last round). | `ridingTimeVoteController.js:22` `(currentUser, params.rider)` | `undefined`
`Round#endRidingTime(judge, riderColor)` | no open vote for judge -> throw `'Riding time is not active'`; `activeVote.end()`. **`riderColor` is ignored.** | `ridingTimeVoteController.js:36` `(currentUser, params.rider)` | `undefined`
`Round#currentRidingTimeVoteForJudge(judge)` | first open vote of judge (rowid), `undefined` if none | `start/endRidingTime`, `usersController.js:151` | repo `findOpenVoteForJudge`
`Round#getCurrentPause()` / `isPaused()` | last open pause (rowid) or `null` / boolean | `pause`, `resume`, `end` | repo `findCurrentPause`
`RidingTimeVote#end()` | `ended_at = now`, save | `Round#endRidingTime`, `Round#end`, `usersController.js:153` (judge leaving a mat mid-round) | `undefined`

Worker drivers (to replicate exactly in parity):
- RoundTimer: `Round.getOpenRounds()` -> per round `match = round.getMatch()`, time remaining 0 -> `match.endRound()`.
- TechFallTracker: per open round `round.hasReachedTechFallThreshold()` -> `match.endRound()`.
- BreakTransition: `Match.where(break set, not ended)`; elapsed >= duration -> `break_* = null; match.save(); match.startRound()`.

Caching (`getCachedAssociation`, `_cacheMatch`, `clearCachedAssociation('rounds')`):
every cached read in these flows is either loaded fresh in the same flow or
updated in memory in step with the DB, so re-reading from the DB at the same
point is equivalent in sequential execution. Dropped (no caching in services).
