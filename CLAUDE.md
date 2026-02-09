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
Rounds (sequential sub-matches with RidingTimeVotes)
  ↓
RidingTimeVotes (individual judge votes with started_at/ended_at timestamps)
```

### Real-Time Updates (WebSocket)

- **Server**: Socket.IO with room-based broadcasting (`/server/lib/server/webSocketServer.js`)
  - Each match has its own room: `match:${matchId}`
  - Updates sent every 1 second to all clients in room
  - Authentication via `socket.handshake.auth.apiToken`

- **Client**: Flow-based observation (`/app/app/src/commonMain/kotlin/dev/jvmname/accord/network/SocketClient.kt`)
  - `observeMatch(matchId): Flow<Match>` auto-joins room on collection
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
- `User`: `id`, `name`, `email`, `api_token`
- `Mat`: `id`, `name`, `judge_count`, `creator_id`
- `Match`: `id`, `mat_id`, `red_competitor_id`, `blue_competitor_id`, `started_at`, `ended_at`
- `Round`: `id`, `match_id`, `started_at`, `ended_at`, `submission`, `submission_by`
- `RidingTimeVote`: `id`, `round_id`, `judge_id`, `competitor_id`, `started_at`, `ended_at`

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