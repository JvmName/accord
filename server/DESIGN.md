# Server design notes

Decisions and constraints that are not obvious from the code. `CLAUDE.md` has the commands and the layout; `README.md` has the API summary; `openapi.json` is the full API reference.

## Consistency: two processes write the same rows

The web process and the worker (`bin/worker.ts`) each open their own SQLite connection to one file. An in-process lock cannot cover that, so correctness lives in the database.

- **Claims.** Ending a round, ending a match and starting a match each run `UPDATE ... WHERE <not yet done>` and continue only if a row changed (`claimRoundEnd`, `claimMatchEnd`, `claimMatchStart`). The loser writes nothing. A tech fall in the same second as the round timer, or a master tap as the timer fires, ends the round once.
- **Callers.** Routes call `endRound` (the loser gets "No available round to end", a 400) and `startMatch` / `endMatch` (the loser gets `CommandRefused`, a 400). Workers call `tryEndRound` and emit a WebSocket event only if they ended the round.
- **Unique indexes** back the same idea for rows that are inserted: one open vote per judge per round, one open pause per round. The service turns the violation into the usual 400 message.
- **Ending a round** claims `ended_at` first, then closes the round's open votes and pauses at that same instant, then starts the break or ends the match. Scores stop at `ended_at`, so a reader in the other process between those writes sees a consistent round.
- **Transactions** are for all-or-nothing routes only: `POST /mats` and `POST /match/:id/start` (`transaction()` in `src/db/transaction.ts`, `BEGIN IMMEDIATE`). bun-sqlite is synchronous, so Drizzle's own `db.transaction()` commits at the first `await`; the helper drives BEGIN/COMMIT itself. Keep a callback to database work: another query on the same connection while one is open joins the transaction.
- **Busy timeout** is 1000 ms (`PRAGMA busy_timeout`). A wait blocks the event loop of the waiting process.
- **The worker is supervised.** `bin/www.ts` restarts it with a doubling delay (1 s to 30 s, reset after a minute of uptime). A job that throws is logged and re-queued.

## Wire contract the Kotlin client depends on

The client (`app/shared/.../network/`) decodes these bytes exactly; `test/contract/goldens` pin them.

- **Envelope.** `{ data, status }`. `status` is always present: `ApiResultSerializer` throws on a response without it, and treats any status other than `"ok"` as an error. Errors are `{ field: [messages] }`; every value is an array.
- **Absent is not null.** `Match.merge()` keeps the cached value for an absent key and takes `null` as genuinely empty. Some payloads are partial on purpose: round and riding-time responses omit `judges`; `round.tech-fall` omits `mat` and `judges`; matches nested in a mat omit all three. A serializer must omit a key by not setting it, never by setting it to `undefined` (the envelope renders that as `null`).
- **`break_remaining`** is computed on every render, HTTP and WebSocket, and is `null` outside a break. The client clears it when `break_started_at` is null.
- **A null `winner` on an ended match is a draw.** Scores are computed from votes (`red_score` / `blue_score` are never sent). A match winner exists only after all three rounds have ended.
- **Never sent:** `api_token` of anyone but the user it was issued to, `created_at`, `updated_at`, `stoppage`.
- **Ids are plain strings on the wire**, not validated as UUIDs by the response schemas; mat routes take a mat id or a mat code in the same position.
- **`DELETE /match/:id/ridingTime?rider=`:** installed clients still send `rider`; the route accepts and ignores it. The judge's open vote is ended whatever its competitor.
- **Join and competitor names.** The join screen can send `name: ""`, and the new-match screen can send a blank competitor name, so the join name stays optional (default "Anonymous") and a blank one is allowed. `judge_count` is an integer 1 to 3 and defaults to 1.
- **Request bodies** are validated per part (path, query, body) by Zod. A body or query key never replaces a path parameter.

### Client behaviors worth knowing

- Only `MatManager.createMat` branches on a status string: it retries with a new user when the error contains `unauthorized`.
- A socket `connect_error` is only logged, and a rejected handshake is not retried; only a new `socket.connect()` retries. Nothing is shown to the user. A small client change could expose connect errors and route them to the sign-in-again path.
- `MatchManager.startRound` calls `startMatch` first when the match has not started, but the server's `startMatch` already opens round 1, so the following `startRound` gets a 400 ("active round"). The match still starts; the extra call is a client bug.
- `EndMatch` shows the error message on failure and exits on success; `StartRound` ignores its result.

## Authorization

- **Only the master pauses or resumes.** The `pause` permission grants judges as well as the match creator, but every route that uses it checks `manage` first.
- **A mat's page is public:** `GET /mat/:matId` takes no token. `POST /mat/:matCode/join` takes none either; it creates the user and returns its token. `GET /match/:id` needs a token.
- **Gate order is observable.** 401 comes before 404 comes before 400, and `test/http/authorizationParity.test.ts` replays the whole matrix (`test/fixtures/authz-matrix.txt`) with grants and denies.
- **WebSockets.** A client authenticates with `auth.apiToken`; the worker with `query.workerToken`, which must equal the server's worker token (compared in constant time). Anything else gets a `connect_error` (`unauthorized`). Clients can only `match.join` and `match.leave`; a join needs a user and a string id. Payloads are the same safe `Match` shape the HTTP routes render.

## Data

- **SQLite everywhere**, through `bun:sqlite` and Drizzle. The schema is `src/db/schema.ts`; migrations are generated into `drizzle/` and applied by `bin/migrate.ts`.
- **Datetimes are ISO 8601 UTC text, typed `Date`** (`isoDateTime` in `src/db/columns.ts`). It is the only supported format.
- **Ids are text UUIDs** generated in the app. There are **no foreign keys** and no database defaults for ids or timestamps; repositories set `created_at` and `updated_at`.
- **Ordering is explicit:** judges by user id, rounds by `created_at` then insertion, a mat's current match by `created_at`. Nothing relies on an index happening to return rows in some order.
- **One query loads a match** (`findMatchGraph`), so a render or a worker tick costs a few queries instead of dozens.

## Tests

- **Goldens and frozen fixtures are protected.** `test/contract/goldens` (every HTTP and WebSocket payload) and `test/fixtures/frozen` (lifecycle writes, worker emissions, repository reads, permissions, error rendering) record behavior. A diff is a behavior change: read it entry by entry. Regenerate deliberately (`bun run test:update-fixtures`, `CAPTURE_GOLDENS=1 ...`).
- **Race tests** run commands on two connections to one file, advancing in step, so both read the same state before either writes (`test/services/concurrentCommands.test.ts`).
- **bun quirks** (`--isolate`, `mock.module` not hoisting, `require()` for mocked packages) are in `CLAUDE.md`.

## Known limits and open items

- **Scale.** Sized for about 2 mats with 3 judges each. At that size the default rollback journal and the 1 s busy timeout are enough; WAL is not enabled and `rounds.match_id` has no index. Revisit both if the load changes.
- **Development validator.** In development the server checks requests and responses against `openapi.json` (`ACCORD_OPENAPI_VALIDATION`); it never runs in production.
- **Production hosting and cutover** are not decided here; see the deployment section of `CLAUDE.md`.
