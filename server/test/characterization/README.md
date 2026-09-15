# Characterization tests

**These tests pin the behavior of the server as it exists today, bugs included.**

They are a **fidelity instrument, not a correctness one.** Their job is to make a
rewrite prove it did not change behavior — not to assert that the behavior is
good. Several of the things asserted here are, in fact, wrong (see
`.ai/plans/server-ts/FINDINGS.md`). They are asserted anyway, and deliberately.

They were written in task `02b` against the **unmodified** JavaScript
implementation, before any of the phase 4–5 rewrites existed. That ordering is
the whole point: a characterization test written next to the rewrite it is meant
to adjudicate tends to encode the *new* behavior, which is a silent and total
failure of the instrument.

## Rules

1. **A failing characterization test means the rewrite changed behavior.** The
   default response is to fix the rewrite, not the test.
2. **Editing a test here is a deliberate decision that requires justification**,
   written down in the task notes and in `FINDINGS.md`. It is never a way to turn
   a red gate green.
3. **Task 18 is the only task permitted to intentionally change behavior.** Every
   assertion changed there must be called out conspicuously.
4. Anything surprising found while these tests were written is recorded in
   `FINDINGS.md` rather than fixed here.

## What is pinned, and who consumes it

| File | Pins | Consumed by |
|---|---|---|
| `routeTable.test.js` | The complete set of registered `(METHOD, path)` pairs, plus the count, against `fixtures/routeTable.txt`, and cross-checked against `.ai/plans/server-ts/artifacts/route-table.txt` | `13a`, `13b`, `13c`, `15` |
| `authorization.test.js` | `(actor role, action, resource state) → allow \| deny`, driven over real HTTP rather than through the `Authorizer` API | `12`, `15` |
| `workers/techFallTracker.test.js` | Tech-fall detection ends the round and emits `round.tech-fall`; no-op below threshold; no double-end | `14` |
| `workers/breakTransition.test.js` | Expired break starts the next round and emits `break.ended`; unexpired break is a no-op; an ended match never gets a fourth round | `14` |
| `workers/roundTimer.test.js` | Elapsed-minus-pauses ≥ `max_duration` ends the round; pause intervals are excluded from elapsed time; unexpired round untouched | `14` |
| `workers/tickIntervals.test.js` | `requeueInterval` for all four workers (250ms / 1000ms) and the `queueJob` scheduling contract | `14` |
| `errorMapping.test.js` | The four error-class → HTTP status/envelope mappings from `applicationServer.js#handleError` | `12` |
| `matCode.test.js` | `MatCode.CODE_REGEXP` word-code vs. UUID discrimination, and its effect on mat lookup in `serverController.js#initCurrentMat` | `12` |

## Deliberately out of scope

Already well covered elsewhere; duplicating them buys no protection and costs
maintenance:

- consensus riding-time algorithm — `test/ridingTime.test.js`
- round scoring, `Round.end()` match transition, break creation — `test/models/round.test.js`
- `MatchUpdateWorker` cadence/throttle/final-update — `test/workerQueue/matchUpdateWorker.test.js`
  (only its **tick interval**, which that file does not assert, is pinned here)
- HTTP client — `test/http/`

## Harness notes

Run with `bun run test` (never a bare `bun test` — see `FINDINGS.md` **F-06**).

`authorization.test.js` boots a real `ApplicationServer` against a throwaway
SQLite file under `$TMPDIR` and drives it with `fetch`. It never touches
`config/db/database.test.sqlite`, and it does not run the migration CLI (which
would rewrite `config/db/schemas/default.js`); it applies the migration modules
directly. See `test/helpers/httpServer.js`.
