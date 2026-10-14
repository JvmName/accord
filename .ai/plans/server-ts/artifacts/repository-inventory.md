# Repository inventory (server-ts task 10)

Every legacy data-access call site in `controllers/`, `lib/` (excluding `lib/activeRecord/`), `models/` and `bin/`, mapped to the Drizzle repository function that covers it, or to the lifecycle services of task **10b**.

Repositories: `server/src/db/repositories/{users,mats,matCodes,matches,rounds,votes}.ts`, `server/src/db/transaction.ts`; constants in `server/src/domain/matCode.ts`. Every function takes the Drizzle `db` (or a `transaction()` handle) first and returns Drizzle rows.

**Scope (user decision 2026-10-11):** task 10 = reads, write primitives and `transaction()`. The lifecycle commands (`Match#start/end/startRound/endRound`, `Round#startRidingTime/endRidingTime/pause/resume/end/setResult`, `RidingTimeVote#end`) are task 10b. Their *bodies* are listed below as "10b", and each storage step inside them is mapped to the primitive 10b composes.

`bin/`: no data-access call sites (`www`/`worker`/`migrate`/`generate-openapi.ts` only boot or migrate).

Grep used (plus a manual read of every listed file):

```
grep -rnE "\b(User|Mat|MatCode|Match|Round|RidingTimeVote|RoundPause)\.(find|where|create|findOne|findAll|findByPk|findByApiToken|findByCode|getOpenRounds|transaction|generateCode)\b" controllers lib models bin
grep -rnE "\.(getJudges|getViewers|getMatCodes|getMatches|getIncompleteMatches|getMat|getRounds|getRedCompetitor|getBlueCompetitor|getRidingTimeVotes|getPauses|getCurrentPause|getMatch|getLastRound|addJudge|removeJudge|setJudges|addViewer|removeViewer|save|competitorForColor|currentRidingTimeVoteForJudge)\(" controllers lib models bin
```

## Static queries and creates

| Call site | Legacy | Repository function |
|---|---|---|
| `lib/server/serverController.js:308` | `User.findByApiToken(apiToken)` | `findUserByApiToken(db, token)` |
| `lib/server/webSocket.js:51` | `User.findByApiToken(apiToken)` | `findUserByApiToken(db, token)` |
| `lib/server/serverController.js:316` | `MatCode.CODE_REGEXP.test(params.matId)` | `isMatCode(s)` / `CODE_REGEXP` in `src/domain/matCode.ts` |
| `lib/server/serverController.js:318` | `Mat.find(params.matId)` | `findMatById(db, id)` |
| `lib/server/serverController.js:323` | `MatCode.findByCode(matCode)` | `findMatCodeByCode(db, code)` |
| `lib/server/serverController.js:325` | `matCode.getMat()` | `findMatById(db, code.mat_id)` |
| `lib/server/serverController.js:333` | `Match.find(params.matchId)` | `findMatchById(db, id)` (or `findMatchGraph` when the request renders it) |
| `lib/server/webSocket.js:31` | `Match.find(matchId)` | `findMatchById(db, id)` |
| `models/mat.js:9-11` | `Mat.findByCode(code)` (no callers; dead code) | `findMatByCode(db, code)` |
| `controllers/usersController.js:32` | `User.create({name})` | `insertUser(db, {name})` |
| `controllers/mat/usersController.js:128` | `User.create({name})` | `insertUser(db, {name})` |
| `controllers/matchesController.js:182,188` | `User.find(id)` | `findUserById(db, id)` |
| `controllers/matchesController.js:184,190` | `User.create({name})` | `insertUser(db, {name})` |
| `controllers/matchesController.js:29` | `Match.create({...})` | `insertMatch(db, values)` |
| `controllers/matsController.js:15` | `Mat.transaction(cb)` | `transaction(db, cb)` (see F-50) |
| `controllers/matsController.js:71` | `Mat.create({...})` | `insertMat(db, values)` |
| `controllers/matsController.js:82` | `MatCode.generateCode()` | not data access (external word generator); stays with the caller (13a) |
| `controllers/matsController.js:83` | `MatCode.create({code, role, mat_id})` | `insertMatCode(db, values)` |
| `lib/workerQueue/matchUpdateWorker.js:18` | `Round.getOpenRounds()` | `findOpenRounds(db)` |
| `lib/workerQueue/matchUpdateWorker.js:19` | `Match.where({break_started_at ≠ null, ended_at: null})` | `findMatchesInBreak(db)` |
| `lib/workerQueue/matchUpdateWorker.js:56` | `Match.find(matchId)` | `findMatchGraph(db, id)` |
| `lib/workerQueue/breakTransitionWorker.js:12` | `Match.where({break...})` | `findMatchesInBreak(db)` |
| `lib/workerQueue/breakTransitionWorker.js:30` | `Match.find(match.id)` | `findMatchGraph(db, id)` |
| `lib/workerQueue/techFallTrackerWorker.js:33` | `Round.getOpenRounds()` | `findOpenRounds(db)` |
| `lib/workerQueue/roundTimerWorker.js:10` | `Round.getOpenRounds()` | `findOpenRounds(db)` |
| `models/match.js:77,94` | `Match.transaction(cb)` (in `start`/`end`) | 10b, using `transaction(db, cb)` (see F-50) |
| `models/match.js:117` | `Round.create({match_id})` (in `startRound`) | 10b, using `insertRound(db, {match_id})` |

## Association getters (reads)

| Call site | Legacy | Repository function |
|---|---|---|
| `controllers/mat/usersController.js:19` | `mat.getViewers()` | `findMatViewers(db, matId)` |
| `controllers/mat/usersController.js:194` | `mat.getViewers({where: {id}})` | `findMatViewers(db, matId, {userId})` |
| `controllers/mat/usersController.js:25,172` | `mat.getJudges()` | `findMatJudges(db, matId)` |
| `models/match.js:82` | `mat.getJudges()` (in `start`) | 10b, using `findMatJudges` |
| `models/mat.js:23` | `mat.getJudges()` (render `includeMatJudges`) | `findMatJudges` / `findMatGraph(db, matId).judges` |
| `models/mat.js:24` | `mat.getMatCodes()` (render `includeCodes`) | `findMatCodesForMat(db, matId)` / `findMatGraph().matCodes` |
| `models/mat.js:16,26` | `mat.getIncompleteMatches()` | `findIncompleteMatchesForMat(db, matId)` / `findMatGraph().incompleteMatches` (caller sorts by `created_at`, as the render did) |
| `controllers/mat/usersController.js:145,178` | `mat.getIncompleteMatches()` then `.find(m => m.started)` (unsorted, F-48) | `findIncompleteMatchesForMat(db, matId)` |
| `controllers/mat/usersController.js:148`, `models/match.js:16-24,49,134,170`, `models/round.js:80,159,324`, `lib/workerQueue/roundTimerWorker.js:64`, `techFallTrackerWorker.js:71` | `match.getRounds()` | `findMatchRounds(db, matchId)` / `findMatchGraph().rounds` |
| `controllers/match/*.js:45,67,87,119`, `models/match.js:112,124` | `match.getLastRound()` | `findLastRound(db, matchId)` |
| `models/match.js:27-40,66-67,156-157`, `models/round.js:239-240`, `match.competitorForColor` (`match.js:104`) | `match.getRedCompetitor()` / `getBlueCompetitor()` | `findUserById(db, match.red_/blue_competitor_id)` / `findMatchGraph().redCompetitor/.blueCompetitor` |
| `lib/server/authorizer.js:64`, `controllers/mat/usersController.js:181`, `models/match.js:166`, `models/round.js:241` | `match.getJudges()` | `findMatchJudges(db, matchId)` / `findMatchGraph().judges` |
| `lib/server/authorizer.js:67`, `models/match.js:81,162` | `match.getMat()` | `findMatById(db, match.mat_id)` / `findMatchGraph().mat` |
| `lib/workerQueue/matchUpdateWorker.js:45`, `roundTimerWorker.js:35`, `techFallTrackerWorker.js:50`, `models/round.js:38,79,92,150,183,238,270,323` | `round.getMatch()` | `findMatchById(db, round.match_id)` / `findMatchGraphsByIds(db, ids)` |
| `models/round.js:29,255` | `round.getRidingTimeVotes()` | `findRoundVotes(db, roundId)` / graph `rounds[i].ridingTimeVotes` |
| `models/round.js:143` | `round.getRidingTimeVotes({where: {ended_at: null}})` (in `end`) | 10b, using `findOpenRoundVotes(db, roundId)` |
| `models/round.js:108-114`, `controllers/mat/usersController.js:151` | `round.currentRidingTimeVoteForJudge(judge)` | `findOpenVoteForJudge(db, roundId, judgeId)` (returns `undefined` when none, as legacy) |
| `models/round.js:50,256,276`, `lib/workerQueue/roundTimerWorker.js:50` | `round.getPauses()` | `findRoundPauses(db, roundId)` / graph `rounds[i].pauses` |
| `models/round.js:60-68,133` | `round.getCurrentPause()` / `isPaused()` | `findCurrentPause(db, roundId)` |
| `models/match.js:154-175` (`toApiResponse` with `includeMat/includeMatchJudges/includeRounds`) and the round scoring it triggers (`Round#collectResultsData`) | ~9-15 queries per match render (F-49) | `findMatchGraph(db, id)`; one tick of workers: `findOpenRounds` + `findMatchesInBreak` + `findMatchGraphsByIds` |

## Writes (instance `save` / association mutators)

| Call site | Legacy | Primitive |
|---|---|---|
| `controllers/mat/usersController.js:174` | `mat.addJudge(user)` | `addMatJudge(db, matId, userId)` |
| `controllers/mat/usersController.js:159` | `mat.removeJudge(user)` | `removeMatJudge(db, matId, userId)` |
| `controllers/mat/usersController.js:199` | `mat.addViewer(user)` | `addMatViewer(db, matId, userId)` |
| `controllers/mat/usersController.js:162` | `mat.removeViewer(user)` | `removeMatViewer(db, matId, userId)` |
| `controllers/mat/usersController.js:187` | `match.addJudge(user)` | `addMatchJudge(db, matchId, userId)` |
| `controllers/mat/usersController.js:156` | `match.removeJudge(user)` | `removeMatchJudge(db, matchId, userId)` |
| `controllers/mat/usersController.js:153` | `activeVote.end()` | `setVoteEnded(db, voteId)` (the `end()` body itself is 10b) |
| `lib/workerQueue/breakTransitionWorker.js:24-26` | `match.break_* = null; match.save()` | `updateMatch(db, id, {break_started_at: null, break_duration: null})` |
| `lib/workerQueue/breakTransitionWorker.js:28` | `match.startRound()` | lifecycle: task 10b |
| `lib/workerQueue/roundTimerWorker.js:43`, `techFallTrackerWorker.js:65` | `match.endRound()` | lifecycle: task 10b |
| `controllers/matchesController.js:46` | `match.start()` | lifecycle: task 10b (`updateMatch` + `findMatJudges` + `setMatchJudges` + `insertRound` inside `transaction`) |
| `controllers/matchesController.js:63` | `match.end()` | lifecycle: task 10b (`updateMatch` + round end, inside `transaction`) |
| `controllers/match/roundsController.js:14` | `match.startRound()` | lifecycle: task 10b (`findLastRound` + `insertRound`) |
| `controllers/match/roundsController.js:26` | `match.endRound({safe})` | lifecycle: task 10b |
| `controllers/match/roundsController.js:52` | `round.setResult({winner, stoppage})` | lifecycle: task 10b (`updateRound(db, id, {declared_winner_id, stoppage})`) |
| `controllers/match/roundsController.js:74` | `round.pause()` | lifecycle: task 10b (`findCurrentPause` + `insertRoundPause`) |
| `controllers/match/roundsController.js:94` | `round.resume()` | lifecycle: task 10b (`findCurrentPause` + `setPauseResumed`) |
| `controllers/match/ridingTimeVoteController.js:22` | `round.startRidingTime(user, rider)` | lifecycle: task 10b (`findOpenVoteForJudge` + `insertRidingTimeVote`) |
| `controllers/match/ridingTimeVoteController.js:36` | `round.endRidingTime(user, rider)` | lifecycle: task 10b (`findOpenVoteForJudge` + `setVoteEnded`) |
| `models/match.js:79,98` | `this.save()` in `start`/`end` | 10b, using `updateMatch` |
| `models/match.js:83` | `this.setJudges(judges)` in `start` | 10b, using `setMatchJudges(db, matchId, userIds)` |
| `models/round.js:97` | `vote.save()` (new vote) | 10b, using `insertRidingTimeVote` |
| `models/round.js:126` | `roundPause.save()` (new pause) | 10b, using `insertRoundPause` |
| `models/round.js:137` | `openPause.save()` (resumed) | 10b, using `setPauseResumed` |
| `models/round.js:145` | `vote.end()` | 10b, using `setVoteEnded` |
| `models/round.js:153` | `this.save()` (`ended_at`) | 10b, using `updateRound` |
| `models/round.js:171` | `match.save()` (break start) | 10b, using `updateMatch` |
| `models/round.js:192` | `this.save()` (result) | 10b, using `updateRound` |
| `models/ridingTimeVote.js:7` | `this.save()` in `end()` | 10b, using `setVoteEnded` |

## Not data access (no repository function, by design)

| Call site | Why |
|---|---|
| `*.toApiResponse()`, `apiSafeKeys`, `ServerController#_formatJSONBody` | serialisation: task 11 |
| `getCachedAssociation` / `clearCachedAssociation` / `_cacheMatch` / `_cacheRecord` / `this._cachedPauses` | per-instance association cache: **dropped** (see `src/db/README.md`) |
| `Match#getWinner` memo (`#winner`, F-34), `Round#collectResultsData` memo | derived values; pure functions in `src/domain/scoring.ts` take the loaded graph |
| `Round#getRoundNumber` / `getIndex` / `getMaxDuration` | index of the round in `findMatchRounds` / `graph.rounds` |
| `MatCode#isAdminCode` / `isViewerCode`, `MatCode.ROLES` | `src/domain/matCode.ts` |
| `Authorizer#classForScope` dispatches on `scope.constructor.name` (`'Mat'`, `'Match'`, `'User'`) | does NOT map cleanly onto plain rows (F-53); task 12 must dispatch explicitly |

## Ordering (legacy queries carry no ORDER BY)

Determined with `EXPLAIN QUERY PLAN` on a legacy-migrated DB and rows inserted in reverse id order; reproduced explicitly (F-48):

| Legacy query | Legacy order | Repository |
|---|---|---|
| `mat.getJudges()`, `mat.getViewers()`, `match.getJudges()` | by `user_id` (driven from the unique `(x_id, user_id)` join index) | `ORDER BY join.user_id` |
| `mat.getMatCodes()` | by `role` (unique `(mat_id, role)` index) | `ORDER BY role` |
| `mat.getIncompleteMatches()` | insertion (rowid) | `ORDER BY rowid` |
| `Match.where({break..., ended_at: null})` | `(mat_id, rowid)` (scan of partial `incomplete_matches_idx`) | `ORDER BY mat_id, rowid` |
| `Round.getOpenRounds()` | insertion (table scan) | `ORDER BY rowid` |
| `match.getRounds()` | rowid, then stable JS sort by `created_at` | `ORDER BY created_at, rowid` |
| `round.getRidingTimeVotes()`, `round.getPauses()` | insertion (via the `round_id` index) | `ORDER BY rowid` |

## Counts

- First grep (static queries/creates): 28 lines (incl. 3 `transaction`, 1 `generateCode`, the dead `Mat.findByCode`'s inner `MatCode.findByCode`), plus `CODE_REGEXP.test` and `matCode.getMat()` in `serverController.js`.
- Second grep (association getters, mutators, `save`, cache plumbing): 93 lines, of which 17 are `add*/remove*/set*/save` writes; the rest are reads or cache plumbing. Grouped in the tables above.
- Lifecycle command call sites routed to 10b: 13 (controllers/workers calling `start`/`end`/`startRound`/`endRound`/`setResult`/`pause`/`resume`/`startRidingTime`/`endRidingTime`/`vote.end`), plus every storage step inside those bodies (mapped to primitives above).
- Unmapped: 0. Not cleanly mappable: `Authorizer#classForScope` (F-53).
