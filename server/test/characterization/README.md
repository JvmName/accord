# Characterization tests

**These tests pin the behavior of the server: a failing one means the behavior changed.**

They are a fidelity instrument. They were written against the original
JavaScript implementation, before it was rewritten in TypeScript, and they
have been kept deliberately: a test written next to the code it adjudicates
tends to encode that code's behavior, which is a silent failure of the
instrument.

## Rules

1. **A failing characterization test means the behavior changed.** The default
   response is to fix the code, not the test.
2. **Editing a test here is a deliberate decision that requires
   justification** in the commit message. It is never a way to turn a red
   gate green.
3. Any assertion you change must be called out conspicuously.

## What is pinned

| File | Pins |
|---|---|
| `routeTable.test.ts` | The complete set of registered `(METHOD, path)` pairs, plus the count, against `fixtures/routeTable.txt`, and cross-checked against `../fixtures/route-table.txt` |
| `authorization.test.ts` | `(actor role, action, resource state) → allow \| deny`, driven over real HTTP |
| `workers/techFallTracker.test.ts` | Tech-fall detection ends the round and emits `round.tech-fall`; no-op below threshold; no double-end |
| `workers/breakTransition.test.ts` | Expired break starts the next round and emits `break.ended`; unexpired break is a no-op; an ended match never gets a fourth round |
| `workers/roundTimer.test.ts` | Elapsed-minus-pauses ≥ `max_duration` ends the round; pause intervals are excluded from elapsed time; unexpired round untouched |
| `workers/tickIntervals.test.ts` | `requeueInterval` for all four workers (250ms / 1000ms) and the `queueJob` scheduling contract |
| `errorMapping.test.ts` | The four error-class → HTTP status/envelope mappings from `src/http/middleware/errors.ts` |
| `matCode.test.ts` | `MatCode.CODE_REGEXP` word-code vs. UUID discrimination, and its effect on mat lookup in `src/http/middleware/requestState.ts` |

## Deliberately out of scope

Already well covered elsewhere; duplicating them buys no protection and costs
maintenance:

- consensus riding-time algorithm — `test/ridingTime.test.ts`
- round scoring, round-end match transition, break creation — `test/services/` and `test/domain/`
- `MatchUpdateWorker` cadence/throttle/final-update — `test/workers/emissionDifferential.test.ts`
  (only its **tick interval**, which that file does not assert, is pinned here)

## Harness notes

Run with `bun run test` (never a bare `bun test`: it skips `--isolate`, see `CLAUDE.md`).

`authorization.test.ts` boots a real server against a throwaway SQLite file
under `$TMPDIR` and drives it with `fetch`. It never touches
`config/db/database.test.sqlite`; it applies the Drizzle migrations directly. See `test/helpers/httpServer.ts`.
