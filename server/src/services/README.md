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
| `startRidingTime(db, round, judgeId, rider)` / `endRidingTime(...)` | `Round#startRidingTime` / `#endRidingTime` | `POST` / `DELETE /match/:id/ridingTime` |
| `endVote(db, vote)` | `RidingTimeVote#end` | `endRidingTime`, `finishRound`, mat leave (`usersController.js:153`) |
| `competitorForColor(db, match, color)`, `isRoundPaused(db, roundId)` | supporting reads | the commands above |

`match`/`round`/`vote` arguments are rows already loaded by the caller (the
legacy methods checked their preconditions on the in-memory instance; the
services check them on the row passed in). Everything else is re-read from
the DB at the point the legacy code read it; there is no association cache.

Rules:

- **Legacy behaviour, bugs included.** Same preconditions in the same order,
  same error class and message, same writes in the same order, every command
  resolves to `undefined`. Defects are in `FINDINGS.md` (F-54..F-62), not
  fixed. The callers keep their own pre-checks (e.g. the result window 422 of
  `PATCH .../rounds/result` is the route's, not `setRoundResult`'s).
- **No transactions** (user decision 2026-10-11, F-50): legacy
  `Match.transaction()` was never atomic, so `startMatch`/`endMatch` run their
  steps sequentially and unwrapped. `src/db/transaction.ts` is not used here;
  real atomicity is a task-18 change.
- **No WebSocket emission, no serialisation.** Workers emit; task 11 renders.
- ES `export` like the repositories; only new code loads these, and they load
  through `require()` under bun (`test/services/modules.test.js`).

Parity: `test/services/lifecycleParity.test.js` runs every command against the
legacy model method on a separate, identically seeded legacy-migrated DB and
compares outcome, all rows, and a trigger-captured log of every write in
order. Inventory, call sites and mutation proofs:
`.ai/plans/server-ts/artifacts/lifecycle-inventory.md`.
