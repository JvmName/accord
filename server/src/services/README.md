# src/services — lifecycle commands

The state-transition commands: plain async functions over the Drizzle handle
(`createDb()`), built from the repositories and the domain functions. One
implementation for both callers: the match, round and riding-time route
handlers and the worker jobs in `src/workers` call them.

| Function | Callers |
|---|---|
| `startMatch(db, match)` | `POST /match/:id/start` (inside `transaction()`) |
| `endMatch(db, match)` | `POST /match/:id/end` |
| `startRound(db, matchId)` | `POST /match/:id/rounds`; BreakTransitionWorker (after clearing the break with `updateMatch`); `startMatch` |
| `endRound(db, matchId, { safe, transition }?)` | `POST .../rounds/end` (`safe: false`); `endMatch` (`safe: true`, `transition: false`) |
| `tryEndRound(db, matchId)` | TechFall and RoundTimer workers; resolves to whether this call ended the round |
| `finishRound(db, round, { transition }?)` | `tryEndRound` only |
| `closeMatch(db, matchId)` | `endMatch`; `finishRound` (final round) |
| `pauseRound(db, round)` / `resumeRound(db, round)` | `POST .../rounds/pause` / `resume` |
| `setRoundResult(db, round, { winner, stoppage })` | `PATCH .../rounds/result` |
| `startRidingTime(db, round, judgeId, rider)` / `endRidingTime(db, round, judgeId)` | `POST` / `DELETE /match/:id/ridingTime` |
| `endVote(db, vote, endedAt?)` | `endRidingTime`, `finishRound`, mat leave |
| `competitorForColor(db, match, color)`, `isRoundPaused(db, roundId)` | supporting reads for the commands above |

`match`/`round`/`vote` arguments are rows already loaded by the caller; the
commands check their preconditions on the row passed in. Everything else is
re-read from the database; there is no association cache.

Rules:

- Every command resolves to `undefined`, except `tryEndRound` and
  `finishRound`, which say whether they ended the round. The callers keep
  their own pre-checks (e.g. the result window 422 of
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
- No WebSocket emission, no serialisation: the workers emit, `src/serialize`
  renders.
- ES `export` like the repositories; they load through `require()` under bun
  (`test/services/modules.test.ts`).

Tests: `test/services/lifecycleParity.test.ts` runs every command from a
seeded database and compares the outcome, all rows and a trigger-captured log
of every write, in order, against `test/fixtures/frozen/lifecycle.jsonl`.
`test/services/concurrentCommands.test.ts` runs commands on two connections at
once.
