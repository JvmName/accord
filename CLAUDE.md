# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Accord is a distributed application for tracking "riding time" (controlled grappling time) in competitive grappling matches using consensus-driven voting by judges. It consists of:

- **Android App**: Kotlin Compose Multiplatform application (`/app`) - supports both Android and JVM desktop
- **Node.js Server**: Express + Socket.IO backend (`/server`) with SQLite database

## Commands

### Server (Node.js)

```bash
cd server

# Development
npm start                    # Start dev server with nodemon

# Testing
npm test                     # Run all tests with coverage
npm test -- <file>          # Run specific test file

# Database migrations
npm run db:create_migration  # Create new migration
npm run db:migrate          # Run pending migrations
npm run db:rollback         # Rollback last migration
```

### Android App (Kotlin/Gradle)

```bash
cd app

# Build
./gradlew build             # Build all targets
./gradlew assembleDebug     # Build Android debug APK
./gradlew assembleRelease   # Build Android release APK (requires signing config)

# Run
./gradlew :shared:run       # Run JVM desktop app

# Android deployment
./gradlew installDebug      # Install debug APK to connected device
```

## Architecture

### Core Consensus Algorithm

The application's defining feature is **threshold-based consensus** for tracking control time (`/server/lib/ridingTime.js`):

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

- **Server**: Socket.IO with room-based broadcasting (`/server/lib/server/webSocketServer.js`)
  - Each match has its own room: `match:${matchId}`
  - Authentication via `socket.handshake.auth.apiToken`

- **Worker process** (`/server/bin/worker <workerToken>`): Separate process that connects via WebSocket using `workerToken`. Runs four background jobs:
  - `MatchUpdateWorker`: Ticks every **250ms**. Broadcasts `match.update` for every open (not-yet-ended) round **and** for every match currently in a break, throttled to ~1s. Also tracks active match IDs across ticks — when a match exits the active set (just ended), immediately broadcasts one final `match.update` so judges receive the ended state without waiting for their local countdown to expire. The other three workers tick every 1 second:
  - `TechFallTrackerWorker`: Checks open rounds for tech fall threshold; if reached, ends the round in the DB and broadcasts `round.tech-fall`
  - `BreakTransitionWorker`: Checks matches in break state; when break expires, starts the next round and broadcasts `break.ended`
  - `RoundTimerWorker`: Checks open rounds for timer expiry; if elapsed time (minus pauses) ≥ max duration, ends the round and broadcasts `match.update`
  - **Critical**: Controllers never emit WebSocket events directly — all WebSocket emissions go through the worker process exclusively.
  - **Warning**: An unhandled exception in any worker's `performJob()` will silently kill that worker — it stops re-queuing with no log output. Always handle errors inside `performJob()` or the affected rounds/matches will never auto-advance.

- **Break lifecycle**: When a round ends and the match is not over, `Round.end()` sets `break_started_at` and `break_duration` on the match. `MatchUpdateWorker` picks this up within 1 second and starts broadcasting `match.update` with `break_remaining` (computed seconds). `BreakTransitionWorker` auto-starts the next round when elapsed >= `break_duration` and emits `break.ended`.

- **Server→Client events** (all carry the full Match payload):
  - `match.update` — periodic score/state updates while a round is active or a break is in progress
  - `round.tech-fall` — fired once when tech fall threshold is reached and round is ended
  - `break.ended` — fired once when a break expires and the next round has been auto-started

- **Client**: Flow-based observation (`/app/shared/src/commonMain/kotlin/dev/jvmname/accord/network/SocketClient.kt`)
  - `observeMatch(matchId): Flow<Match>` auto-joins room on collection and listens to `match.update`, `round.tech-fall`, and `break.ended`
  - Auto-leaves room on cancellation

### Server Architecture

**Custom ORM**: `BaseRecord` class (`/server/lib/active_record/baseRecord.js`) wraps Sequelize
- Models extend BaseRecord: `User`, `Mat`, `Match`, `Round`, `RidingTimeVote`
- Database schemas in `/server/config/db/schemas/`
- Migrations in `/server/config/db/migrations/`

**Request Flow**:
```
Express Route → Controller → Authenticate → Authorize → Execute → Render JSON
```

**Authorization Levels** (`/server/lib/server/authorizer.js`):
- `judge`: User must be in Match's judges list
- `manage`: Match creator permissions
- `pause`: Judges or managers can pause/resume a round
- `view`: Public access

**Key Controllers**:
- `/server/controllers/matsController.js` - Mat CRUD, judge/viewer management
- `/server/controllers/matchesController.js` - Match lifecycle, round management
- `/server/routes/mat/` and `/server/routes/match/` - Route definitions

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

**Server** (JavaScript with Sequelize):
- `User`: `id`, `name`, `api_token`
- `Mat`: `id`, `name`, `judge_count` (optional, no longer required on creation), `creator_id`
- `Match`: `id`, `mat_id`, `creator_id`, `red_competitor_id`, `blue_competitor_id`, `red_score`, `blue_score`, `started_at`, `ended_at`, `break_started_at`, `break_duration`
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

6. **Match Extensions in `models_ext.kt`**: All winner/score derivation from `Match` belongs in `/app/shared/src/commonMain/kotlin/dev/jvmname/accord/network/models_ext.kt`, not inlined in presenters. Key extensions: `Match.winner(roundIndex)`, `Match.winnerCompetitor`, `Match.roundScore()`, `Match.toMatchResult()`. `toMatchResult()` always returns a non-null `MatchResult` for any ended match — do NOT add a `winner ?: return null` guard; a null winner on an ended match is a valid draw. `Match.merge(other)` handles cache updates — some HTTP endpoints return partial payloads (omitting `judges`, `mat`, etc.) and merge preserves cached values for those. `break_remaining` is a worker-computed field that is only present in WebSocket `match.update` payloads — HTTP responses always return it as `null`. `merge` uses `if (breakStartedAt != null) breakRemaining ?: other.breakRemaining else null` to preserve the last WebSocket value during an active break and clear it once the break ends.

7. **`MatchResult` is shared across screens**: Defined in `JudgeSessionScreen.kt` but imported by `MasterSessionScreen.kt` as well. Has `winConditions: String` and `roundWinners: List<Competitor>`. Empty `roundWinners` means all rounds were tied (draw); `toText()` handles this case.

8. **Judge vs Master role separation**: Judges only vote on control time — they do NOT handle meta-round actions (submission, stoppage, manual score edits are master-only). `JudgeSessionEvent.EndRound` is a simple `data object` that ends the round with no params. All structured end-round actions (submission name, who submitted/stopped, stoppage vs submission choice) belong exclusively in the master session.

9. **Master session overlay pattern**: The master uses Circuit's `OverlayEffect` + `BottomSheetOverlay` for dialogs (not `AlertDialog`). The end-round dialog is `SubmissionDialog` in `/app/.../ui/session/master/overlay.kt`, which returns a `SubmissionResult` sealed class. `SubmissionResult.Confirmed` carries `winner` and `stoppage`. The content maps the result to `MasterSessionEvent.RecordRoundResult(winner, stoppage)` — NOT `EndRound`. `EndRound` is a `data object` that fires `POST /rounds/end` immediately on button tap and opens the dialog; `RecordRoundResult` fires `PATCH /rounds/result` when the dialog is confirmed. There is also a separate `EndMatchConfirmDialog` (triggered by `MasterSessionEvent.ShowEndMatchDialog` / `DismissEndMatchDialog`) that shows a confirmation prompt before ending the entire match — distinct from the per-round end flow. `MasterSessionState` includes `showEndMatchDialog`, `orangeHealthFraction`, and `greenHealthFraction` for the health bar UI.

10. **All rounds always play out**: A match always runs all `maxRounds` (3) rounds — there is no early exit when a competitor reaches 2 wins. The match winner is determined by best-2-of-3 only after all 3 rounds have completed. `Match.getWinner()` returns `null` while rounds are still in progress. Do not reintroduce early-exit logic in `Round.end()` or `Match.getWinner()`.

11. **End-round method routing**: `RoundController.endRound(winner, submission, stoppage)` — `winner` doubles as submitter (submission path) or stopper (stoppage path). `MasterSession` routes to the correct `MatchManager.endRound` overload based on the `stoppage` flag. The server API uses `{ submission, submitter }` for submissions and `{ stoppage: true, stopper }` for stoppages.

12. **Two-step end-round flow**: Ending a round is split into two API calls. `POST /match/:matchId/rounds/end` (no body) stops the clock and starts the break immediately. `PATCH /match/:matchId/rounds/result` `{ winner: "red"|"blue"|null, stoppage: boolean }` records who won — this is only valid during the break or after the match has ended. On the client: `MasterSessionEvent.EndRound` (data object) calls `session.endRound()` and opens the dialog; `MasterSessionEvent.RecordRoundResult(winner, stoppage)` calls `session.recordRoundResult()`. Dismissing the dialog without confirming leaves the result null on the server.

## Testing

### Server Tests

Tests use Jest with `jest-express` and `jest-extended`:
```bash
cd server
npm test                          # Run all tests with coverage
npm test -- ridingTime.test.js   # Run specific test
```

Coverage excludes `/helpers/` and `/models/` directories (configured in `package.json`).

Key test areas:
- `/server/test/ridingTime.test.js` - Consensus algorithm tests
- `/server/test/server/` - Server framework, WebSocket, authorization
- `/server/test/active_record/` - ORM layer tests
- `/server/test/http/` - HTTP client tests

## Database

- **Development/Testing**: SQLite (`database.sqlite` in `/server`)
- **Schema Management**: Sequelize migrations in `/server/config/db/migrations/`
- **ORM**: Custom `BaseRecord` wrapper around Sequelize models

Migration naming convention: `<description>_<timestamp>.js`

## API Authentication

All endpoints except `POST /users` require authentication via `x-api-token` header. API token is returned on user creation.

WebSocket authentication uses `socket.handshake.auth.apiToken`.

## Common Development Tasks

### Adding a New Model (Server)

1. Create migration: `npm run db:create_migration`
2. Define schema in migration file (`/server/config/db/migrations/`)
3. Run migration: `npm run db:migrate`
4. Create model class extending `BaseRecord` in `/server/models/`
5. Add schema definition in `/server/config/db/schemas/default.js`

### Adding a New Screen (Android)

1. Create screen directory in `/app/shared/src/commonMain/kotlin/dev/jvmname/accord/ui/<screen-name>/`
2. Create three files:
   - `<ScreenName>Screen.kt` - Screen data class (route)
   - `<ScreenName>Presenter.kt` - Business logic with `@CircuitInject` annotation
   - `<ScreenName>Content.kt` - Composable UI with `@CircuitInject` annotation
3. KSP will auto-generate factory classes
4. Add screen to navigation stack in presenter

### Adding a New API Endpoint (Server)

1. Add route in `/server/routes/<domain>/index.js`
2. Create controller method in `/server/controllers/<domain>Controller.js`
3. Use `authorizer.authorize(req, <permission>)` for auth checks
4. Return JSON via `res.json({ ... })`
5. Update `/server/README.md` with endpoint documentation


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
- npm/yarn/pnpm build, pytest, jest, mocha

**Usage:**
- command: The full shell command
- working_directory: Absolute path to project root
- env_vars: Optional like "KEY=value,KEY2=value2"

NEVER run these via Bash. Always use run_task MCP tool.

## Deployment

The project deploys two services to Railway, both triggered by GHA on push to `main`:

- **API server** (`.github/workflows/server-deploy.yml`): triggers on `server/package.json` change (version bump). Uses `railway up` from repo root with `railway.json` at root.
- **Web client** (`.github/workflows/android-release.yml`, `web-deploy` job): triggers alongside the Android release on `app/androidApp/build.gradle.kts` change (version bump). Builds `:shared:wasmJsBrowserDistribution` via Gradle, copies `app/shared/railway.web.json` into the output as `railway.json`, then runs `railway up` from `app/shared/build/dist/wasmJs/productionExecutable/`.

**Key Railway CLI behavior**: `railway up <path>` fails with "prefix not found" for untracked directories (build output). Always `cd` into the target directory and run `railway up` from there instead.

**CORS**: The API server allows `http://localhost:8080` for local dev and reads `WEB_ORIGIN` env var for the production web client URL. Set `WEB_ORIGIN=https://<web-service-domain>` on the Railway API service.

**Required GitHub secrets**: `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID` (API), `RAILWAY_WEB_SERVICE_ID` (web client).

## Plans

All plans will always be written into `.ai/plans/<name-of-feature>`. Never put any plans in any folder within `/app` or `/server`