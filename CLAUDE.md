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
./gradlew :app:run          # Run JVM desktop app

# Android deployment
./gradlew installDebug      # Install debug APK to connected device
```

## Architecture

### Core Consensus Algorithm

The application's defining feature is **threshold-based consensus** for tracking control time (`/server/lib/ridingTime.js`):

- **Vote Threshold**: For multiple judges, threshold = `max(ceil(judgeCount/2), 2)`
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
Matches (red vs blue competitor)
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

- **Worker process** (`/server/bin/worker <workerToken>`): Separate process that connects via WebSocket using `workerToken`. Runs four background jobs every 1 second:
  - `MatchUpdateWorker`: Broadcasts `match.update` for every open (not-yet-ended) round **and** for every match currently in a break
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

- **Client**: Flow-based observation (`/app/app/src/commonMain/kotlin/dev/jvmname/accord/network/SocketClient.kt`)
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
- Screens in `/app/app/src/commonMain/kotlin/dev/jvmname/accord/ui/`
- Each screen has: `Screen.kt` (route), `Presenter.kt` (logic), `Content.kt` (UI)
- Navigation is stack-based with gesture support

**Dependency Injection**: Metro (annotation-based)
- `AppScope`: Singleton app-level dependencies
- `MatchScope`: Per-match scoped dependencies
- Assisted injection for screen parameters

**Domain Layer** (`/app/app/src/commonMain/kotlin/dev/jvmname/accord/domain/`):
- `MatchManager`: Match lifecycle, API calls, caching
- `MatManager`: Mat operations
- `UserManager`: Authentication and profile
- `RoundTracker`: Local round timing for solo mode

**Network Layer** (`/app/app/src/commonMain/kotlin/dev/jvmname/accord/network/`):
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
- `Mat`: `id`, `name`, `judge_count`, `creator_id`
- `Match`: `id`, `mat_id`, `creator_id`, `red_competitor_id`, `blue_competitor_id`, `red_score`, `blue_score`, `started_at`, `ended_at`, `break_started_at`, `break_duration`
- `Round`: `id`, `match_id`, `ended_at`, `submission`, `submission_by`
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

6. **Match Extensions in `models_ext.kt`**: All winner/score derivation from `Match` belongs in `/app/app/src/commonMain/kotlin/dev/jvmname/accord/network/models_ext.kt`, not inlined in presenters. Key extensions: `Match.winner(roundIndex)`, `Match.winnerCompetitor`, `Match.roundScore()`, `Match.toMatchResult()`.

7. **`MatchResult` is shared across screens**: Defined in `JudgeSessionScreen.kt` but imported by `MasterSessionScreen.kt` as well. `winner` field is `Pair<User, Competitor>` (not just `Competitor`).

8. **Judge vs Master role separation**: Judges only vote on control time — they do NOT handle meta-round actions (submission, stoppage, manual score edits are master-only). `JudgeSessionEvent.EndRound` is a simple `data object` that ends the round with no params. All structured end-round actions (submission name, who submitted/stopped, stoppage vs submission choice) belong exclusively in the master session.

9. **Master session overlay pattern**: The master uses Circuit's `OverlayEffect` + `BottomSheetOverlay` for dialogs (not `AlertDialog`). The end-round dialog is `SubmissionDialog` in `/app/.../ui/session/master/overlay.kt`, which returns a `SubmissionResult` sealed class. `SubmissionResult.Confirmed` carries both submission and stoppage paths. The content maps the result to `MasterSessionEvent.EndRound` which carries `submission`, `submitter`, `stoppage`, and `stopper` fields.

10. **End-round method routing**: `RoundController.endRound(winner, submission, stoppage)` — `winner` doubles as submitter (submission path) or stopper (stoppage path). `MasterSession` routes to the correct `MatchManager.endRound` overload based on the `stoppage` flag. The server API uses `{ submission, submitter }` for submissions and `{ stoppage: true, stopper }` for stoppages.

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

1. Create screen directory in `/app/app/src/commonMain/kotlin/dev/jvmname/accord/ui/<screen-name>/`
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

## Plans

All plans will always be written into `.ai/plans/<name-of-feature>`. Never put any plans in any folder within `/app` or `/server`