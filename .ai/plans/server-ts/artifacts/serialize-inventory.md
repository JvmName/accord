# Serialization inventory (server-ts task 11)

Progress notes and the spec the mappers in `server/src/serialize/` reproduce.
The reflective legacy filter's EFFECTS are the spec; this file enumerates them.

## How legacy serialises (two layers)

1. `BaseRecord#toApiResponse()` (`lib/activeRecord/baseRecord.js:184-200`):
   `apiSafeKeys` = `rawAttributes` minus camelCase keys, `created_at`,
   `updated_at`, `mats_users`; each value is `this[key] || null`
   (so ANY falsy value, e.g. `judge_count: 0`, `break_duration: 0`, `name: ''`,
   becomes `null`). Model overrides add computed keys.
2. `ServerController#_formatJSONBody` (`lib/server/serverController.js:121-145`)
   walks the result: anything with `toApiResponse` is rendered (with the SAME
   options object, recursively), `Date` -> `toISOString()`, `undefined` -> `null`
   (only reachable case: `Mat.current_match` when no match is started).
   The worker/WebSocket path skips this layer: socket.io JSON-encodes the raw
   result, so nested Sequelize users go through `toJSON()` (F-22) and
   `undefined` would be dropped (no case reachable).

## Per entity (wire keys, in legacy order)

| Entity | Keys | Notes |
|---|---|---|
| User | `id`, `name` | `apiSafeKeys` drops `api_token`; `|| null` on both |
| MatCode | `code`, `role` | explicit `apiSafeKeys`; `|| null` |
| Mat | `id`, `name`, `judge_count`, `creator_id` (+ `judges` / `codes` / `current_match` + `upcoming_matches`) | includes only under `includeMatJudges` / `includeCodes` / `includeMatches`; absent otherwise. `current_match` null (not absent) when none started. Incomplete matches sorted by `created_at` (stable) before `find(started)` / `filter(!started)`; nested matches rendered with no match includes |
| Match | `creator_id`, `id`, `mat_id`, `started_at`, `ended_at`, `break_started_at`, `break_duration`, `red_competitor`, `blue_competitor`, `winner`, `break_remaining` (+ `mat` / `judges` / `rounds`) | `red_score`/`blue_score` NOT emitted (absent). `break_remaining` computed on EVERY render (HTTP too, F-20). includes only under `includeMat` / `includeMatchJudges` / `includeRounds`; rounds/ridingTime routes pass `includeJudges` (not a real option) so `judges` is ABSENT there |
| Round | `id`, `started_at` (= `created_at`), `ended_at`, `max_duration`, `paused`, `time_remaining`, `score`, `result {winner, method {type, value}}` | `stoppage`, `declared_winner_id`, `match_id` NOT emitted |

Route render options (controllers):

| Route | Render |
|---|---|
| `POST /mats` | `{mat}` `{includeCodes, includeMatJudges}` |
| `GET /mat/:matId` | `{mat}` `{includeMatches, includeMatJudges}` |
| `POST /mat/:code/join` | `{mat, user, api_token}` `{includeMatJudges}` |
| `DELETE /mat/:code/join` | `{mat}` `{includeMatJudges}` |
| `GET /mat/:code/judges` / `viewers` | `{judges}` / `{viewers}` (users) |
| `POST /mat/:code/matches` | `{match}` `{includeMat}` |
| `GET /match/:id`, `POST .../start`, `POST .../end` | `{match}` `{includeMat, includeMatchJudges, includeRounds}` |
| `POST/PATCH .../rounds*`, `POST/DELETE .../ridingTime` | `{match}` `{includeRounds, includeJudges(no-op), includeMat}` |
| `POST /users` | `{user, api_token}` |
| WS `match.update` / `break.ended` | Match `{includeMat, includeMatchJudges, includeRounds}`, leaked users |
| WS `round.tech-fall` (and RoundTimer's `match.update`) | Match `{includeRounds}`, leaked users |

## Mappers (`server/src/serialize/`)

| Function | Input | Output schema |
|---|---|---|
| `serializeUser(user)`, `serializeNullableUser`, `serializeUsers` | `users` row (`id`, `name`) | `userSchema` |
| `serializeMatCode(code)` | `mat_codes` row | `matCodeSchema` |
| `serializeMat(mat, { judges?, codes?, incompleteMatches?, now? })` | `mats` row (+ `findMatGraph` parts; incomplete matches as `MatchGraph`s) | `matSchema` |
| `serializeMatch(graph, { includeMat?, includeMatchJudges?, includeRounds?, now? })` | `findMatchGraph` result | `matchSchema` |
| `serializeRound(graph, round, { now? })` | match graph + one of its rounds | `roundSchema` |
| `serializeLeakedUser/Match/Round` (F-22, delete in 18) | same | `leaked*Schema` |
| helpers: `matchBreakRemaining`, `matchWinner`, `roundOutcome`, `roundMaxDuration`, `roundTimeRemaining`, `currentPause`, `splitIncompleteMatches`, `legacyColumn`, `wireTime` | | |
| `assertWire(kind, v)`, `devAssertWire(kind, v)`, `wireValidationEnabled()` | opt-in runtime check (`ACCORD_VALIDATE_WIRE=1` or `NODE_ENV=development`) | |

Domain reuse: round score = `RDojoKombatRules.scoreRound` (bound `this.ended_at = now`, i.e. the
legacy call-time fallback made explicit, F-33/F-67); round result = `getRoundResult`; match
winner = `getMatchWinner` over `roundOutcome` of each ended round. `time_remaining` and
`break_remaining` are render logic (not domain), ported verbatim with the injected clock.

## Golden equivalence (`test/serialize/goldenEquivalence.test.js`)

Replays the whole capture plan (order parsed from `capture.ts`, requests rebuilt from the goldens)
against the legacy server on a temp legacy-migrated DB seeded by `seed.ts`, clock frozen at NOW.
After each response the rows are read via Drizzle and rendered by the mappers with the route's
legacy options, normalised with a copy of the capture normaliser, and compared as canonical JSON.

- Replay fidelity: all 81 HTTP goldens reproduced by legacy (status + normalised body).
- Rendered and matched byte-for-byte: all 37 success goldens that carry a User/Mat/Match/Round
  (users.create.success, mats.create.success, mat.get x4, mat.judges/viewers.success, mat.join x3
  success, mat.leave x3, matches.create x2, match.get x8 success, match.start/end success,
  rounds.start/end/pause/resume success, rounds.result submission/stoppage/clear,
  ridingTime.start x2 / end success). Every one also parses through its route envelope schema.
- WS: the four real workers' `performJob()` run in capture order with `notifyServer` captured;
  `serializeLeakedMatch` matches all 4 `ws.*` goldens.

### Mutation proofs (each applied, run, reverted; all restored)

| # | Mutation | Caught by |
|---|---|---|
| M1 | emit `red_score` on Match | golden equivalence (byte + schema + ws) |
| M2 | `judges: null` instead of absent when not included | golden equivalence (byte + schema + ws) |
| M3 | `break_remaining` always null (the plan's claim) | golden equivalence (byte + ws) — schema alone would NOT catch it |
| M4 | `current_match` absent instead of null | golden equivalence (byte) — schema alone would NOT catch it |
| M5 | `winner` always null | golden equivalence (byte) |
| M6 | `time_remaining` ignores resumed pauses | golden equivalence (byte + ws) |
| M7 | rounds reversed | golden equivalence (byte + ws) |
| M8 | drop legacy `|| null` | unit tests only (3 fail; no golden has a falsy column — F-63) |
| M9 | scoring ignores injected `now` | unit tests only (4 fail; goldens freeze the system clock) |
| M10 | HTTP match leaks competitor `api_token` | unit (15) + golden equivalence |
| M11 | Round emits `stoppage` | unit (20) + golden equivalence |

## Progress

- [x] read plan, START-HERE, README, FINDINGS, contract schemas, models, baseRecord, serverController, repositories, domain, goldens, capture/seed
- [x] mappers
- [x] unit tests (user/matCode/mat, match, round, index/hygiene)
- [x] golden-equivalence replay test + mutation proofs
- [x] findings F-63..F-68
- [x] full-suite verification: `bun run typecheck` exit 0; `bun run test` 742 pass / 0 fail / 50 files
  (baseline 674/45 + 68 new tests in 5 files); goldens, characterization, src/db untouched.
  Run via Bash (run_task MCP unavailable in this session).
