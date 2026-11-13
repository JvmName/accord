# src/services — lifecycle commands (server-ts task 10b)

The state-transition commands that used to live on the Sequelize models,
ported to plain async functions over the Drizzle handle (`createDb()`), built
from the task-10 repositories and the task-08 domain functions. One
implementation for both callers: the match, round and riding-time route
handlers and the worker jobs in `src/workers` call them.

| Function | Legacy | Callers (legacy today) |
|---|---|---|
| `startMatch(db, match)` | `Match#start` | `POST /match/:id/start` |
| `endMatch(db, match)` | `Match#end` | `POST /match/:id/end`; `finishRound` (final round) |
| `startRound(db, matchId)` | `Match#startRound` | `POST /match/:id/rounds`; BreakTransitionWorker (after clearing the break with `updateMatch`) |
| `endRound(db, matchId, { safe }?)` | `Match#endRound` | `POST .../rounds/end` (`safe: false`); TechFall/RoundTimer workers (no options); `endMatch` (`safe: true`) |
| `finishRound(db, round)` | `Round#end` | `endRound` only |
| `pauseRound(db, round)` / `resumeRound(db, round)` | `Round#pause` / `#resume` | `POST .../rounds/pause` / `resume`; `finishRound` |
| `setRoundResult(db, round, { winner, stoppage })` | `Round#setResult` | `PATCH .../rounds/result` |
| `startRidingTime(db, round, judgeId, rider)` / `endRidingTime(db, round, judgeId)` | `Round#startRidingTime` / `#endRidingTime` | `POST` / `DELETE /match/:id/ridingTime` |
| `endVote(db, vote)` | `RidingTimeVote#end` | `endRidingTime`, `finishRound`, mat leave (`usersController.js:153`) |
| `competitorForColor(db, match, color)`, `isRoundPaused(db, roundId)` | supporting reads | the commands above |

`match`/`round`/`vote` arguments are rows already loaded by the caller (the
legacy methods checked their preconditions on the in-memory instance; the
services check them on the row passed in). Everything else is re-read from
the DB at the point the legacy code read it; there is no association cache.

Rules:

- **Legacy behaviour, with the fixes recorded in `FINDINGS.md`** (F-54..F-62,
  task 18). Every command resolves to `undefined`, except `tryEndRound` and
  `finishRound`, which say whether they ended the round. The callers keep their own pre-checks (e.g. the result window 422 of
  `PATCH .../rounds/result` is the route's, not `setRoundResult`'s).
- **Conditional writes, not transactions.** The web process and the worker
  process write the same rows, so a command that ends a round, ends a match or
  starts a match claims it with `UPDATE ... WHERE <not yet done>` and goes on
  only if a row changed (`claimRoundEnd`, `claimMatchEnd`, `claimMatchStart`).
  The loser of a race writes nothing: `endRound` throws "No available round to
  end" (or returns with `safe`), `startMatch` / `endMatch` throw
  `CommandRefused` (a 400). The workers call `tryEndRound` and emit only when
  they ended the round. A route that needs all-or-nothing wraps the call in
  `transaction()` (`POST /mats`, `POST /match/:id/start`).
- **No WebSocket emission, no serialisation.** Workers emit; task 11 renders.
- ES `export` like the repositories; only new code loads these, and they load
  through `require()` under bun (`test/services/modules.test.ts`).

Parity: `test/services/lifecycleParity.test.ts` runs every command against the
legacy model method on a separate, identically seeded legacy-migrated DB and
compares outcome, all rows, and a trigger-captured log of every write in
order. Inventory, call sites and mutation proofs:
`.ai/plans/server-ts/artifacts/lifecycle-inventory.md`.
