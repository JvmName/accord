# Contract goldens

**These files are the API's contract of record.** They are byte-exact snapshots
of every HTTP response and every WebSocket payload this server produces,
captured against the implementation as it stood at the start of the TypeScript
migration (`.ai/plans/server-ts/`, task 04).

The Kotlin client in `app/shared/src/commonMain/kotlin/dev/jvmname/accord/network/`
consumes these exact bytes — field names, nesting, `null` vs absent, enum
spellings, computed numbers. The migration replaces the ORM (task 11) and the
entire routing layer (tasks 13a–13c), and neither rewrite is visible to the
existing unit tests, which test internals. These goldens are what stands between
those rewrites and a silently broken client.

## Changing a golden

**A red `contract.test.js` means the wire contract changed. Fix the server.**

Regenerating goldens to turn the gate green is the one failure mode this
directory exists to prevent, so it is deliberately awkward: goldens are only
rewritten when `CAPTURE_GOLDENS=1` is set. If a change to a golden is genuinely
intended, it is an **API change**, and it needs:

1. a stated reason in the commit message,
2. a corresponding update to `models.kt` / `AccordClient.kt` / `SocketClient.kt`,
3. a reviewer looking at the golden diff, not just the test result.

These are **fidelity** instruments, not correctness ones. They encode current
behaviour *including its bugs* — see `F-11`, `F-14`, `F-15`, `F-16`, `F-20`
through `F-25` in `.ai/plans/server-ts/FINDINGS.md`, several of which are
visible right here in the goldens. That is intentional. Task 18 is the only
place behaviour is allowed to change.

## Running

```bash
cd server

# THE GATE — replays every golden and asserts byte-equality.
bun test --isolate test/contract/contract.test.js

# Completeness oracle: fails on any route with no golden, prints the summary.
bun test --isolate --coverage test/contract/capture.test.js

# Regenerate (deliberate act — review the diff).
CAPTURE_GOLDENS=1 bun test --isolate test/contract/capture.test.js
```

Both files also run as part of `bun run test`. Never a bare `bun test` — see
`FINDINGS.md` F-06.

## Files

| File | What it is |
|---|---|
| `seed.ts` | The deterministic fixture graph: fixed UUIDs, fixed mat codes, a caller-driven clock. One match per interesting shape. |
| `capture.ts` | The harness. Boots a real server, runs the ordered request plan, drives the real workers for the WebSocket events, normalizes and reports. |
| `capture.test.js` | Completeness oracle; writes goldens under `CAPTURE_GOLDENS=1`. |
| `contract.test.js` | The gate: byte-equality replay, plus the `models.kt` population and nullability cross-checks. |
| `goldens/*.json` | 85 snapshots — 81 HTTP, 4 WebSocket. |

## How a golden is made deterministic

The wall clock is **frozen** for the whole run and every fixture has a fixed
primary key. That is what lets the goldens assert real timestamps, real
`time_remaining`, real `break_remaining` and real riding-time `score` values
literally, instead of masking them behind placeholders — mutation **M6** in
`artifacts/mutation-log.txt` (changing the score divisor from 3 to 4) is caught
only because of this.

Only identifiers the server invents *during* the run are placeholdered, and
positionally: `<uuid:1>` for a new user id, `<code:1>` for a generated mat code.
Seeded identifiers get semantic names (`<user:red>`, `<match:break>`) so a diff
says what changed instead of showing two indistinguishable UUIDs.

Object keys are sorted, so a harmless reordering in the server cannot redden the
gate.

**`null` and absent are never normalized into each other, in either direction.**
`Match.merge()` in `models_ext.kt` exists because some endpoints return partial
payloads: absent means "keep the cached value", `null` means "genuinely empty".
`ws.round.techFall.json` is the live example — `TechFallTrackerWorker` renders
without `includeMat`/`includeMatchJudges`, so `mat` and `judges` are *absent*
there while every other payload carries them.

## What is deliberately not captured

`GET /docs`, `GET /docs.json` and `GET /async-docs.json` are registered only
when `NODE_ENV === 'development'`. The goldens record what production serves —
a 404 — and not the DEV bodies. `/docs.json` is the *generated* OpenAPI spec
which task 06 replaces on purpose, so byte-locking it would create a gate a
later task is required to break. The harness prints this decision on every run.

## Evidence

- `.ai/plans/server-ts/artifacts/coverage-capture.txt` — the completeness oracle
  run, and the six branches it caught that the route checklist could not.
- `.ai/plans/server-ts/artifacts/mutation-log.txt` — seven deliberate server
  mutations, each confirmed to make this gate fail, each reverted.
