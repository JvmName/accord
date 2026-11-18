# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Accord is a distributed application for tracking "riding time" (controlled grappling time) in competitive grappling matches using consensus-driven voting by judges. It consists of:

- **Android App**: Kotlin Compose Multiplatform application (`/app`) - supports both Android and JVM desktop
- **Node.js Server**: Express + Socket.IO backend (`/server`) with SQLite database

## Commands

### Server (Node.js)

**Use `bun` exclusively — never `npm`, `yarn`, or `pnpm`, for any command.** The server has a single lockfile (`bun.lock`).

```bash
cd server

# Development
bun run start                # Start the server; it spawns the worker (bin/worker.ts)
bun run dev                  # Same, reloading on file changes

# Checks (CI runs both)
bun run typecheck            # tsc over src/lib/bin (strict) and over test/ (relaxed)
bun run test                 # Run all tests with coverage
bun run test -- <file>       # Run specific test file

# Database migrations
bun run db:generate          # Generate a new migration from src/db/schema.ts
bun run db:migrate           # Apply pending Drizzle migrations

# API documents (generated from src/contract; commit the result)
bun run generate:openapi     # Rewrites server/openapi.json
```

**Never run a bare `bun test`.** It skips the `--isolate` flag that the `test` script supplies. bun shares one module registry across all test files without it, and the suite's `mock.module()` doubles then contaminate each other — a bare `bun test` fails tests that pass when each file runs alone. Worse, the same contamination can make an assertion pass while testing nothing.

### Android App (Kotlin/Gradle)

```bash
cd app

# Build
./gradlew build             # Build all targets
./gradlew assembleDebug     # Build Android debug APK
./gradlew assembleRelease   # Build Android release APK (requires signing config)

# Run
./gradlew :shared:run       # Run JVM desktop app
./gradlew :shared:run -Paccord.baseUrl=https://staging.example   # Point any build at another server (or set ACCORD_BASE_URL)

# Android deployment
./gradlew installDebug      # Install debug APK to connected device
```

## Architecture

### Core Consensus Algorithm

The application's defining feature is **threshold-based consensus** for tracking control time (`/server/src/domain/ridingTime.ts`):

- **Vote Threshold**: Single judge: threshold = 1. Multiple judges: threshold = 2 (always, regardless of judge count)
- **Control Recognition**: Control is only counted when active votes ≥ threshold
- **Time Accumulation**: Riding time accumulates only during periods when threshold is met
- **Winner Determination**: Competitor with more riding time wins (or by submission if called)

Example: With 3 judges and threshold of 2, riding time starts accumulating when the 2nd judge presses their button and stops when votes drop below 2.

### Entity Hierarchy

```
Users (authenticated via API token)
  ↓
Mats (training locations with word-based invite codes like "morning.coffee.bicycle")
  ↓
Matches (orange vs green competitor)
  ↓
Rounds (sequential sub-matches with RidingTimeVotes and RoundPauses)
  ↓
RidingTimeVotes (individual judge votes with timestamps)
RoundPauses (pause/resume intervals with paused_at/resumed_at timestamps)
```

### Real-Time Updates (WebSocket)

- **Server**: Socket.IO with room-based broadcasting (`/server/src/ws/webSocketServer.ts`)
  - Each match has its own room: `match:${matchId}`
  - Clients authenticate with `socket.handshake.auth.apiToken` (a string naming a user); the worker with `socket.handshake.query.workerToken`, which must equal the server's `workerToken`. Any other handshake is refused with a `connect_error` (`unauthorized`). Only `match.join` / `match.leave` exist for clients; there are no generic room events.
  - Payloads are the same safe `Match` shape the HTTP routes render: competitors are `{ id, name }`, never `api_token`.

- **Worker process** (`/server/bin/worker.ts`, spawned by `bin/www.ts`, token from `WORKER_TOKEN` or the first argument): Separate process, with its own SQLite connection, that connects via WebSocket using `workerToken`. Runs four background jobs (`/server/src/workers/`):
  - `MatchUpdateWorker`: Ticks every **250ms**. Broadcasts `match.update` for every open (not-yet-ended) round **and** for every match currently in a break, throttled to ~1s. Also tracks active match IDs across ticks — when a match exits the active set (just ended), immediately broadcasts one final `match.update` so judges receive the ended state without waiting for their local countdown to expire. The other three workers tick every 1 second:
  - `TechFallTrackerWorker`: Checks open rounds for tech fall threshold; if reached, ends the round in the DB and broadcasts `round.tech-fall`
  - `BreakTransitionWorker`: Checks matches in break state; when break expires, starts the next round and broadcasts `break.ended`
  - `RoundTimerWorker`: Checks open rounds for timer expiry; if elapsed time (minus pauses) ≥ max duration, ends the round and broadcasts `match.update`
  - **Critical**: Route handlers never emit WebSocket events directly — all WebSocket emissions go through the worker process exclusively.
  - **Errors in a job**: `Worker._performJob` logs a throw from `performJob()` and queues the next tick, so one bad round does not stop the worker. If the worker process itself exits, `bin/www.ts` restarts it (`src/workers/supervisor.ts`: a delay that doubles from 1 s to 30 s).
  - **Races**: the web process and the worker write the same rows. Ending a round, ending a match and starting a match are claimed with a conditional `UPDATE ... WHERE <not yet done>` (`claimRoundEnd`, `claimMatchEnd`, `claimMatchStart`); the caller that loses writes nothing. Partial unique indexes allow one open vote per judge per round and one open pause per round. `RoundTimerWorker` and `TechFallTrackerWorker` call `tryEndRound` and emit only if they ended the round, so a tech fall in the same second as the timer, or a master tap as the timer fires, ends the round once.

- **Break lifecycle**: When a round ends and the match is not over, `finishRound` (`/server/src/services/roundLifecycle.ts`) sets `break_started_at` and `break_duration` on the match. `MatchUpdateWorker` picks this up within 1 second and starts broadcasting `match.update` with `break_remaining` (computed seconds). `BreakTransitionWorker` auto-starts the next round when elapsed >= `break_duration` and emits `break.ended`.

- **Server→Client events** (all carry the full Match payload):
  - `match.update` — periodic score/state updates while a round is active or a break is in progress
  - `round.tech-fall` — fired once when tech fall threshold is reached and round is ended
  - `break.ended` — fired once when a break expires and the next round has been auto-started

- **Client**: Flow-based observation (`/app/shared/src/commonMain/kotlin/dev/jvmname/accord/network/SocketClient.kt`)
  - `observeMatch(matchId): Flow<Match>` auto-joins room on collection and listens to `match.update`, `round.tech-fall`, and `break.ended`
  - Auto-leaves room on cancellation

### Server Architecture

Design decisions that are not obvious from the code (consistency model, the wire contract the client depends on, authorization, known limits) are in `/server/DESIGN.md`.

**Layers** (all in `/server/src`, TypeScript, bun):
- `db/`: Drizzle ORM over bun:sqlite. `schema.ts` is the schema; `repositories/` are plain query functions (no model classes, no association caching); `transaction.ts` is the transaction helper.
- `services/`: the lifecycle commands (`matchLifecycle`, `roundLifecycle`, `ridingTimeVotes`), shared by routes and workers.
- `domain/`: pure rules and scoring (`ridingTime`, `scoring`, `rules/`, `matCode`).
- `serialize/`: renders stored rows into the wire payloads. `contract/`: the Zod schemas that `openapi.json` and the AsyncAPI document are generated from.
- `http/`: Express 5 routes declared with `defineRoute`; `ws/`: Socket.IO; `workers/`: the background jobs.
- Migrations are generated into `/server/drizzle/` by `bun run db:generate`.

**Request Flow**:
```
requestState (resolve the user, mat, match, round) → authorize (the route's gate)
  → validate (path, query and body parsed by Zod) → handler → render JSON / errorMiddleware
```

**Authorization Levels** (`/server/src/http/permissions.ts`, applied by `http/middleware/authorize.ts`):
- `judge`: User must be in Match's judges list
- `manage`: Match creator permissions (the master)
- `pause`: `can()` grants managers and judges, but every route that uses it also requires `manage`, so **only the master can pause or resume a round**. This is intended.
- `view`: Public access to a mat (`GET /mat/:matId` takes no token on purpose); `GET /match/:id` needs a token.

**Key route files** (`/server/src/http/routes/`, listed in `routes/index.ts`):
- `mats.ts`, `matUsers.ts` - Mat creation and reads, judge/viewer join and leave
- `matches.ts`, `rounds.ts`, `ridingTimeVotes.ts` - Match lifecycle, round management, votes
- `requests.ts` - the Zod schemas for every request part

### Android App Architecture

**UI Framework**: Slack Circuit (Presenter pattern)
- Screens in `/app/shared/src/commonMain/kotlin/dev/jvmname/accord/ui/`
- Each screen has: `Screen.kt` (route), `Presenter.kt` (logic), `Content.kt` (UI)
- Navigation is stack-based with gesture support

**Dependency Injection**: Metro (annotation-based)
- `AppScope`: Singleton app-level dependencies
- `MatchScope`: Per-match scoped dependencies
- Assisted injection for screen parameters

**Domain Layer** (`/app/shared/src/commonMain/kotlin/dev/jvmname/accord/domain/`):
- `MatchManager`: Match lifecycle, API calls, caching
- `MatManager`: Mat operations
- `UserManager`: Authentication and profile
- `RoundTracker`: Local round timing for solo mode
- `RoundAudioFeedbackHelper`: Plays audible alerts (start/stop/end of round, control changes) based on match state transitions

**Network Layer** (`/app/shared/src/commonMain/kotlin/dev/jvmname/accord/network/`):
- `AccordClient`: HTTP client (Ktor) for REST API
- `SocketClient`: WebSocket client (Socket.IO) for real-time updates
- `ApiResult<T>`: Sealed interface for Success/Error responses

**Dual Control Modes**:
1. **Solo Mode** (`SoloControlTimePresenter`): Local-only practice mode, no network
2. **Consensus Mode** (`ConsensusControlTimePresenter`): Network-synchronized judging with live riding time
3. **Delegation** (`DelegatingControlTimePresenter`): Routes to correct presenter based on `ControlTimeType`

### Key Data Models

**Server** (Drizzle, `/server/src/db/schema.ts`):
- `User`: `id`, `name`, `api_token`
- `Mat`: `id`, `name`, `judge_count` (1 when omitted on creation), `creator_id`
- `Match`: `id`, `mat_id`, `creator_id`, `red_competitor_id`, `blue_competitor_id`, `red_score`, `blue_score` (stored but never sent; scores are computed from votes), `started_at`, `ended_at`, `break_started_at`, `break_duration`
- `Round`: `id`, `match_id`, `ended_at`, `declared_winner_id`, `stoppage`
- `RidingTimeVote`: `id`, `round_id`, `judge_id`, `competitor_id`, `ended_at`
- `RoundPause`: `id`, `round_id`, `paused_at`, `resumed_at`

**Client** (Kotlin with kotlinx.serialization):
- Value classes for type safety: `UserId`, `MatId`, `MatchId`, `RoundId`
- Models use nested relationships (e.g., `Match` includes `judges: List<User>`, `rounds: List<Round>`)
- `Round.controlTime: Map<UserId, Int>` contains riding time in seconds per competitor

## Important Patterns

1. **Consensus as Core**: Not voting for a winner, but real-time consensus on "who has control" - prevents single biased judge from affecting result

2. **Time-Based Calculations**: Riding time calculated from vote timestamps (started_at/ended_at), not increments - resilient to race conditions

3. **Invite Code Pattern**: Sharable word-based codes (e.g., "morning.coffee.bicycle") instead of UUIDs for user-friendly mat access

4. **Stateless Server**: Judge state stored in database, not in-memory - enables horizontal scaling

5. **Room-Based Broadcasting**: WebSocket rooms keep server scalable; all interested clients receive updates atomically

6. **Match Extensions in `models_ext.kt`**: All winner/score derivation from `Match` belongs in `/app/shared/src/commonMain/kotlin/dev/jvmname/accord/network/models_ext.kt`, not inlined in presenters. Key extensions: `Match.winner(roundIndex)`, `Match.winnerCompetitor`, `Match.roundScore()`, `Match.toMatchResult()`. `toMatchResult()` always returns a non-null `MatchResult` for any ended match — do NOT add a `winner ?: return null` guard; a null winner on an ended match is a valid draw. `Match.merge(other)` handles cache updates — some HTTP endpoints return partial payloads (omitting `judges`, `mat`, etc.) and merge preserves cached values for those. `break_remaining` (seconds left in a break) is computed on every render, over HTTP as well as WebSocket, and is `null` outside a break. `merge` uses `if (breakStartedAt != null) breakRemaining ?: other.breakRemaining else null` to preserve the last WebSocket value during an active break and clear it once the break ends.

7. **`MatchResult` is shared across screens**: Defined in `JudgeSessionScreen.kt` but imported by `MasterSessionScreen.kt` as well. Has `winConditions: String` and `roundWinners: List<Competitor>`. Empty `roundWinners` means all rounds were tied (draw); `toText()` handles this case.

8. **Judge vs Master role separation**: Judges only vote on control time — they do NOT handle meta-round actions (submission, stoppage, manual score edits are master-only). `JudgeSessionEvent.EndRound` is a simple `data object` that ends the round with no params. All structured end-round actions (submission name, who submitted/stopped, stoppage vs submission choice) belong exclusively in the master session.

9. **Master session overlay pattern**: The master uses Circuit's `OverlayEffect` + `BottomSheetOverlay` for dialogs (not `AlertDialog`). The end-round dialog is `SubmissionDialog` in `/app/.../ui/session/master/overlay.kt`, which returns a `SubmissionResult` sealed class. `SubmissionResult.Confirmed` carries `winner` and `stoppage`. The content maps the result to `MasterSessionEvent.RecordRoundResult(winner, stoppage)` — NOT `EndRound`. `EndRound` is a `data object` that fires `POST /rounds/end` immediately on button tap and opens the dialog; `RecordRoundResult` fires `PATCH /rounds/result` when the dialog is confirmed. There is also a separate `EndMatchConfirmDialog` (triggered by `MasterSessionEvent.ShowEndMatchDialog` / `DismissEndMatchDialog`) that shows a confirmation prompt before ending the entire match — distinct from the per-round end flow. `MasterSessionState` includes `showEndMatchDialog`, `orangeHealthFraction`, and `greenHealthFraction` for the health bar UI.

10. **All rounds always play out**: A match always runs all `maxRounds` (3) rounds — there is no early exit when a competitor reaches 2 wins. The match winner is determined by best-2-of-3 only after all 3 rounds have completed. `Match.getWinner()` returns `null` while rounds are still in progress. Do not reintroduce early-exit logic in `Round.end()` or `Match.getWinner()`.

11. **End-round overloads are client-side**: `RoundController.endRound(winner, submission, stoppage)` — `winner` doubles as submitter (submission path) or stopper (stoppage path). `MasterSession` routes to the correct `MatchManager.endRound` overload based on the `stoppage` flag, and every overload sends the same `{ winner, stoppage }` to `PATCH rounds/result` (see 12). The server has no `submission`, `submitter` or `stopper` parameter.

12. **Two-step end-round flow**: Ending a round is split into two API calls. `POST /match/:matchId/rounds/end` (no body) stops the clock and starts the break immediately. `PATCH /match/:matchId/rounds/result` `{ winner: "red"|"blue"|null, stoppage: boolean }` records who won — this is only valid during the break or after the match has ended. On the client: `MasterSessionEvent.EndRound` (data object) calls `session.endRound()` and opens the dialog; `MasterSessionEvent.RecordRoundResult(winner, stoppage)` calls `session.recordRoundResult()`. Dismissing the dialog without confirming leaves the result null on the server.

## Testing

### Server Tests

Tests are TypeScript (`server/test/**/*.test.ts`) and run on **`bun test`**.

```bash
cd server
bun run test                        # Run all tests with coverage
bun run test -- ridingTime.test.ts  # Run specific test
```

**Always `bun run test`, never a bare `bun test`** — see the Commands section above for why.

Config lives in `server/bunfig.toml`: it preloads `test/setup.ts` and excludes `**/helpers/**` from coverage. That pattern is a **glob**, not Jest's substring pattern — `/helpers/` would match nothing.

`test/setup.ts` supplies one thing the runner doesn't: a `toHaveBeenCalledBefore` matcher (`bun:test` doesn't ship it).

Two typecheck configs: `tsconfig.json` (src, lib, bin: `strict`, `noUncheckedIndexedAccess`, unused locals and parameters are errors) and `tsconfig.test.json` (the same, with `noImplicitAny`, unused checks and `noUncheckedIndexedAccess` off for tests). `bun run typecheck` runs both. TypeScript is pinned to 5.9.3: an unpinned `bun add -d typescript` resolves to 7.x, which removes `moduleResolution: "node"`.

**Writing tests under bun — the non-obvious parts:**
- `mock.module()` **does not hoist** like `jest.mock()`. It must appear above the `require()` of the module under test, or the real implementation is used and the test passes while asserting nothing. That is why the tests that mock use `require()` after the mock instead of `import`.
- `mock.module('somepkg', …)` with a **bare package specifier silently does nothing.** Use `mock.module(require.resolve('somepkg'), …)`.
- **A TS `import` of a package with both CJS and ESM builds is a different module from `require()` of it** (`socket.io`, `socket.io-client`), so the mock above misses it. `src/workers/worker.ts` and `src/ws/webSocketServer.ts` therefore `require()` those two packages. Keep `require()` for any package a test mocks.
- A module whose CJS export is a bare function can't be mocked at all — prime `require.cache` instead. Export named bindings from new mockable seams.
- A TS file that mixes `import` with `module.exports` fails under bun ("Cannot use import statement with CommonJS-only features"). `src/domain/*` and `lib/{constants,logger}` are CommonJS and use `require` for their own dependencies.
- `spyOn(target, prop, 'get')` is unimplemented — use `spyOnGetter()` from `test/helpers/spy.ts`.
- `expect(asyncFn).rejects` needs a promise: `expect((async () => { … })()).rejects`.
- `new mockFn()` returns the mock's return value, not a fresh instance.

**Frozen fixtures and goldens are protected instruments.** `test/fixtures/frozen/*.jsonl` (lifecycle writes, worker emissions, repository reads, permissions, error rendering) and `test/contract/goldens/*.json` (every HTTP and WebSocket payload) record what the server does. Do not regenerate them to turn a red test green: a diff is a behavior change, so read it entry by entry first. Regenerate with `bun run test:update-fixtures` (`--check` verifies), and goldens with `CAPTURE_GOLDENS=1 bun test --isolate test/contract/capture.test.ts` (`git rm` a golden's old file when its case is renamed).

Key test areas:
- `/server/test/ridingTime.test.ts`, `domain/`, `rules/` - Consensus algorithm, scoring, rules
- `/server/test/services/` - Lifecycle commands, including two connections racing (`concurrentCommands.test.ts`)
- `/server/test/http/` - Routes over real HTTP, authorization, request validation, error shapes
- `/server/test/contract/` - Goldens and the generated OpenAPI document
- `/server/test/ws/`, `workers/`, `characterization/workers/` - WebSocket tier and the background jobs
- `/server/test/db/` - Schema, repositories, transactions, the busy timeout

## Database

- **Development/Testing**: SQLite at `DATABASE_PATH`, else `/server/config/db/database.<NODE_ENV>.sqlite`
- **Schema**: `/server/src/db/schema.ts` (Drizzle). Change it, then `bun run db:generate` writes a migration into `/server/drizzle/`, and `bun run db:migrate` (`bin/migrate.ts`) applies it. Commit the generated SQL and `drizzle/meta/`.
- **Access**: repository functions in `/server/src/db/repositories/`, no ORM models. A missing row is `null`.
- **Connections**: the web process and the worker each open their own connection, with a 1000 ms `busy_timeout`. Lifecycle commands rely on conditional `UPDATE`s, not locks; `POST /mats` and `POST /match/:id/start` wrap their writes in `transaction()` (`src/db/transaction.ts`, `BEGIN IMMEDIATE`). Keep a transaction's callback to database work.

## API Authentication

Endpoints require authentication via the `x-api-token` header, except `POST /users` (the token is returned on user creation), `GET /mat/:matId` (public on purpose), and `POST /mat/:matCode/join` (an anonymous join creates the user and returns its token). The health check and the development docs routes are open too.

WebSocket authentication uses `socket.handshake.auth.apiToken`.

## Common Development Tasks

### Changing the Schema (Server)

1. Edit `/server/src/db/schema.ts`
2. `bun run db:generate`, then `bun run db:migrate`
3. Add or update the repository functions in `/server/src/db/repositories/` and the row types in `src/db/types.ts`
4. If the field reaches the wire, update the Zod schema in `/server/src/contract/`, the serializer in `/server/src/serialize/`, and run `bun run generate:openapi`

### Adding a New Screen (Android)

1. Create screen directory in `/app/shared/src/commonMain/kotlin/dev/jvmname/accord/ui/<screen-name>/`
2. Create three files:
   - `<ScreenName>Screen.kt` - Screen data class (route)
   - `<ScreenName>Presenter.kt` - Business logic with `@CircuitInject` annotation
   - `<ScreenName>Content.kt` - Composable UI with `@CircuitInject` annotation
3. KSP will auto-generate factory classes
4. Add screen to navigation stack in presenter

### Adding a New API Endpoint (Server)

1. Declare the route with `defineRoute` in `/server/src/http/routes/<domain>.ts`: method, path, `authorize` gate, request schemas (`routes/requests.ts`), response, handler. Add it to the list in `routes/index.ts`
2. Put multi-step changes in a service (`/server/src/services/`), not in the handler
3. Return the payload from the handler; the envelope (`{ data, status }`) is added for you. Refuse with `ctx.renderErrors({ field: ['message'] }, status?)`
4. Add the response schema in `/server/src/contract/`, run `bun run generate:openapi`, and add the route to `test/characterization/fixtures/routeTable.txt` and the authorization matrix (`routeTable.test.ts` and `authorizationParity.test.ts` fail until you do)
5. Update `/server/README.md` if the endpoint is client-facing, and capture a golden for it

## Kotlin/Wasm JS Interop (wasmJsMain)

Rules for writing socket.io and other JS interop code in `wasmJsMain`. These are not derivable from the code and were learned the hard way.

**File structure**:
- External declarations with `@file:JsModule("...")` must be in their own file — `js()` helper functions in the same file are treated as module imports and fail to compile.
- `js()` helpers live in the `actual` implementation file (e.g., `SocketClient.wasmJs.kt`), never in the `@file:JsModule` file.
- All files using `JsAny`, `js()`, or any Wasm/JS interop API need `@file:OptIn(ExperimentalWasmJsInterop::class)` at the top.

**External class rules**:
- All `external class` declarations must extend `: JsAny` — this is required for Wasm GC reference typing.
- When the Kotlin name differs from the JS export name, use `@JsName("ExactJsName")`. Example: socket.io-client exports `Socket`, not `JsSocket`, so `@JsName("Socket")` is required.

**`js()` intrinsic rules**:
- Argument must be a string literal (no variables, no concatenation).
- Single-line preferred — multiline/triple-quoted behavior is unconfirmed.
- Function parameters are accessible by their Kotlin names inside the string.
- Add `@Suppress("UNUSED_PARAMETER")` on every `js()` helper — the IDE can't see parameter usage inside the string literal.

**Type rules**:
- Kotlin `String` maps directly to JS `String` in `external` signatures. It is NOT a subtype of `JsAny` — don't use `JsAny` where `String` is correct and vice versa.
- For event callbacks, use three separate payload helpers depending on the event:
  - Match objects → `js("JSON.stringify(obj)")` then `json.decodeFromString<Match>(...)`
  - Disconnect reason (plain string) → `js("String(obj)")`
  - connect_error (JS Error) → `js("err.message || String(err)")` — `JSON.stringify` returns `"{}"` for Error objects

**Lambda identity**:
- Kotlin/Wasm uses `getCachedJsObject` for lambda-to-JS-function conversion. The same Kotlin `val` reference always produces the same JS wrapper.
- `socket.on(event, listener)` + `socket.off(event, listener)` with the same `val` correctly de-registers. No dispatch-map escape hatch is needed.

**webpack.config.d**:
- Files placed in `app/shared/webpack.config.d/` are injected into the generated Karma config for `wasmJsBrowserTest`. Confirmed via `build/wasm/packages/accord-shared-test/karma.conf.js`.
- `socket-io.js` sets `config.node = false` per socket.io bundler docs to prevent webpack from processing Node.js-style dynamic requires.

**`Cannot cast null to kotlin.String` — diagnosing on Wasm**:
- This error means a null value reached a non-nullable `String` position at the Wasm GC level. Common causes:
  1. A DB column that is `allowNull: true` on the server but mapped to a non-nullable value class (e.g. `UserId`, `AuthToken`) in Kotlin. Fix: add a migration to enforce `NOT NULL` on the column.
  2. Stale data in `DataStore` (serialized with a field that was later made non-nullable). Fix: wrap `json.decodeFromString<T>()` in `runCatching { }.getOrNull()` in `observeMatInfo()` / `observeCurrentMatch()` so corrupt cache silently returns null.
  3. `MutablePreferences.remove(key)` in DataStore 1.3.0-alpha on Wasm — see below.

**Known DataStore bug — `MutablePreferences.remove(key)` on Kotlin/Wasm (as of Apr 2026)**:
- `prefs.remove(key)` crashes with `Cannot cast null to kotlin.String` when the key does not yet exist in the store. Internally, DataStore casts the null return of `map.remove()` to non-nullable `String` — a DataStore alpha Wasm GC codegen bug.
- **Affected**: any `Preferences.Key<String>` passed to `remove`. `Int` keys may not be affected.
- **Fix**: never call `remove` on the path where you're about to `set`. Restructure as:
  ```kotlin
  val valueStr = value?.extractString()
  datastore.edit { prefs ->
      if (valueStr != null) prefs[KEY] = valueStr
      else prefs.remove(KEY)   // only reached when genuinely clearing
  }
  ```
  This avoids `remove` on first-write (key not yet present), which is when the crash occurs.
- **Pure-remove callers** (`clearPreBoostVolume`, null-clearing branches in other methods) still use `remove` and will crash if the key was never previously set.

**Known Wasm GC bug — Metro + `@GraphExtension` (as of Apr 2026)**:
- `wasmJsBrowserDevelopmentRun` fails in both Chrome and Firefox with `wasm validation error: type mismatch` / `call[1] expected type (ref null <ImplType>), found struct.get of type (ref null 11)` where type 11 = `kotlin.Any`.
- **Root cause**: Metro generates `AccordGraph.Impl` with a `thisGraphInstance` field typed as `kotlin.Any`. In `Impl.<init>`, this field is read via `struct.get` and passed to child graph factory constructors that expect the concrete `Impl` type. The JVM backend emits `checkcast`; Kotlin/Wasm does not emit `ref.cast`, so the Wasm GC validator rejects the binary.
- **Trigger**: the `@GraphExtension` child graph (`MatchGraph`) is what causes Metro to generate `thisGraphInstance`. Removing the child graph would fix it, but that's not viable.
- **This is NOT**: a Compose/Skiko issue, a socket.io issue, or fixable by restructuring `@Provides` methods or `@ContributesTo` modules. All such changes shift the byte offset but do not resolve the error.
- **Bug report**: `.ai/plans/metro-wasm-bug-report.md` — file against Metro and Kotlin/Wasm.
- **Diagnosing Wasm type mismatches**: parse the name section of the `.wasm` binary with Node.js to map type indices to Kotlin class names (see conversation history for the script).

## Build Queue
For expensive operations, ALWAYS use the `run_task` MCP tool instead of Bash.

**Commands that MUST use run_task:**
- gradle, bazel, make, cmake, mvn, cargo build, go build
- docker build, docker-compose, kubectl, helm
- bun/npm/yarn/pnpm build, pytest, jest, mocha

**Usage:**
- command: The full shell command
- working_directory: Absolute path to project root
- env_vars: Optional like "KEY=value,KEY2=value2"

NEVER run these via Bash. Always use run_task MCP tool.

## Deployment

One VPS runs everything (`/deploy`): Docker Compose with the API image (the web process, which starts its supervised worker, plus SQLite on a host directory) and Caddy, which terminates TLS, proxies the API hostname and serves the web client's static files. `deploy/README.md` is the runbook; `deploy/ansible/site.yml` prepares a fresh box.

- **API** (`.github/workflows/server-deploy.yml`): triggers on a `server/package.json` change to `main` (version bump). It runs the tests, builds `server/Dockerfile`, pushes `ghcr.io/<owner>/accord-server:<version>` and, if the repository variable `VPS_HOST` is set, deploys it over SSH (`docker compose pull && up -d`) and waits for the container to be healthy. The container runs `bun run bin/migrate.ts` before the server starts.
- **Web client** (`.github/workflows/android-release.yml`, `web-deploy` job): triggers alongside the Android release on an `app/gradle.properties` change. It builds `:shared:wasmJsBrowserDistribution`, copies the files into `/srv/web/releases/<sha>` and points `/srv/web/current` at them. Also gated on `VPS_HOST`, so a version bump while no server exists still builds and releases.
- **Version bumping**: `VERSION_NAME` and `VERSION_CODE` in `app/gradle.properties` are the single source of truth for the app version. They flow into `androidApp` `versionName`/`versionCode`, the shared `BuildConfig.VERSION_NAME` (displayed in the UI on `MainContent`), and the GHA release tag. To cut a new release, bump both values there. The API server version is separately managed via `server/package.json`.
- **GitHub settings**: variables `VPS_HOST` (empty or unset turns deploys off), `VPS_USER` (default `deploy`) and `VPS_KNOWN_HOSTS`; secret `DEPLOY_SSH_KEY`.
- **CSP for WebAssembly**: the web block of `deploy/Caddyfile` must include `'wasm-unsafe-eval'` in `script-src`, or the browser will block `.wasm` instantiation. The browser error is `CompileError: call to WebAssembly.instantiateStreaming() blocked by CSP`.
- **CORS**: the API allows `http://localhost:8080` for local dev and reads `WEB_ORIGIN` for the production web client (set from `WEB_HOST` in `deploy/compose.yaml`).
- **Monitoring**: `GET /system/healthCheck` answers 503 while the worker is not connected; point an external uptime monitor at it and at the web hostname.
- **Clients**: release builds call `https://rdk.api.jvmname.dev` (`BASE_URL` in `app/shared/build.gradle.kts`). `-Paccord.baseUrl=...` points a build elsewhere.

## Plans

All plans will always be written into `.ai/plans/<name-of-feature>`. Never put any plans in any folder within `/app` or `/server`