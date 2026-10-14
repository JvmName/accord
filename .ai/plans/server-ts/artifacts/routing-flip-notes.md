# Task 13c — complete the routing flip: working notes

`run_task` MCP was unavailable in this session (agent-task-queue failed to
connect), so every `bun` command ran through Bash with explicit timeouts, as
the protocol allows when it says so.

## 0. Step-4 verification (2026-10-12)

| Plan / orchestrator assumption | Reality |
|---|---|
| `src/http/server.ts` "modify" | does not exist; created here (decision A). |
| plan step 2 removal list | all present in `lib/server/applicationServer.js` (`controllerClasses`, `#importControllers`, `#importControllersFromFile`, `controllerDirectories`, `registerControllers`, `#registerController`, `#registerAction`, `#registerDefaultControllers`, `PORTED_CONTROLLERS`, `_get`..`_patch`). Also `portedControllers`, `controllerKey`, `#mountPortedRoutes` (13a seam). |
| plan line refs 208-211 / 356-359 | drifted (default controllers now 267-270, `#httpServer` 415-418). |
| `requestHandler` / `performRequest` / `handleError` / `buildController` | NOT in the plan's removal list. They are the legacy controller dispatch. **Conflict:** `test/characterization/errorMapping.test.js` (protected, must stay untouched) requires `../../lib/server/applicationServer` and calls `new ApplicationServer().requestHandler('getProbe', ThrowingController)`. `test/http/envelope.test.ts` uses the same path as the differential oracle for the new error middleware. See section 2 for the resolution. |
| `test/characterization/routeTable.test.js` | reads `server.controllerClasses`; retarget approved (decision E). |
| `test/contract/capture.ts` | does not require the server directly; boots it through `test/helpers/httpServer.js#startServer`. Only the helper's require path changes. |
| DEV validator | `listen()` installs it before `registerControllers()`; hand-written spec `servers: [{url:'/api'}]` (F-89). |
| `/async-docs.json` | legacy reads `getAsyncApiSpec()`, the object cached by `generateDocs(controllerClasses)`; `asyncApiGenerator.generate()` itself takes no controllers. |

Baseline before any change: `bun run test` 947 pass / 0 fail / 59 files.
Pre-change tree copied to `scratchpad/legacy/server` (node_modules symlinked) for the differential.

## 1. Exhaustiveness (plan step 1, decision B)

`grep -rhoE "class [A-Za-z]+Controller" controllers/`: MatchesController, MatsController, RidingTimeVoteController,
RoundsController, UsersController x2. Qualified by directory: `UsersController` (controllers/usersController.js),
`mat/UsersController`, `match/RidingTimeVoteController`, `match/RoundsController`, `MatchesController`, `MatsController`.

Runtime check against the autoloader itself (`new ApplicationServer().controllerClasses` mapped through
`ApplicationServer.controllerKey`) vs `PORTED_CONTROLLERS`:
discovered == listed == the six keys above; missing from list: none; listed but not discovered: none.
Every `extends ServerController` outside test/: the six controllers + `lib/server/systemController.js` and
`lib/server/docsController.js` (the default controllers, handled in step D). **No gap.**

## 2. Design as built

### `src/http/server.ts` (new, the one home of `ApplicationServer`)
- Constructor `{ port, db, workerToken, dev, openApiValidation }`, all optional. `port || PORT || 3000` (0 still means
  "unset", as before). `workerToken` injected or a lazy `randomUUID()` (unchanged default). `dev` defaults to
  `CONSTANTS.DEV`; it gates the docs routes and 500 logging (the former DEV hooks).
- Owns: the global middleware, verbatim and in the same order (cors, json for application/json + text/plain,
  urlencoded, response-time, static `public`, pino-http, `/static`, ECONNABORTED handler); the Express app and the
  `http.Server` built from it in the constructor (Socket.IO attaches to it, topology unchanged); `listen()`
  (mountRoutes -> startWebSocketServer -> on('error') -> listen), `close()`, `onError()` (verbatim),
  `startWebSocketServer()` (legacy `lib/server/webSocketServer.js`, untouched), `corsOrigin`, `db` (lazy Drizzle).
- `mountRoutes()`: once; `assertImplemented(routes)` (throws on any `notImplemented()` placeholder), then the OpenAPI
  validator when enabled, then `registerRoutes(app, routes, { db, dev, logger })` for the WHOLE table (devOnly routes
  skipped unless dev). Same stack order as before: middleware, (validator), routes.
- pino-http `customLogLevel`: legacy wrote `(res, err)` but pino-http passes `(req, res, err)`, so it read
  `req.statusCode` (null) and always logged `info`. Reproduced, commented (F-94).
- Removed with the autoloader: `controllerClasses`, `#importControllers*`, `controllerDirectories`,
  `registerControllers`, `#registerController`, `#registerAction`, `#registerDefaultControllers`, `PORTED_CONTROLLERS`,
  `portedControllers`, `controllerKey`, `_get/_post/_put/_delete/_patch`, `set()`, and `src/http/mountPorted.ts`
  (`ROUTES_BY_LEGACY_CONTROLLER`, `portedRoutes`, `mountPortedRoutes`). `assertImplemented` moved to `router.ts`.

### `lib/server/applicationServer.js` (conflict resolution, see section 0)
Now only `LegacyControllerDispatch` (requestHandler/performRequest/_performRequest/handleError/buildController,
verbatim). Not a server, never mounted, never loaded by the server. Exported under its own name AND under the old
name `ApplicationServer`, solely because the protected, unmodified `test/characterization/errorMapping.test.js`
destructures `ApplicationServer` from that path and calls `.requestHandler(...)`. One server class exists; the alias
has no `listen()`. `lib/server/index.js` no longer exports `ApplicationServer` (keeps `ServerController`,
`ValidationError` for the dead controllers). Delete both with the controllers (task 15), after retargeting
errorMapping to `src/http/middleware/errors.ts` (F-95).

### Consumers (path-only edits)
`bin/www` (`../lib/server` -> `../src/http/server`), `test/helpers/httpServer.js` (same, used by capture.ts, the
characterization matrix, contract tests). `test/contract/capture.ts` needs no edit (boots through the helper).

## 3. The 5 legacy routes (decision D)

Real handlers in `src/http/routes/system.ts`: `GET /` -> `Hello World v<package.json version>`, `GET
/system/healthCheck` -> `{}` (kept, identical), DEV `GET /docs` (HTML, verbatim template), `GET /docs.json` (the
GENERATED document, `generateOpenApiDocument()`, required lazily: avoids the routes<->openapi import cycle and keeps
the dev-only zod-to-openapi out of production), `GET /async-docs.json` (`lib/openapi/asyncApiGenerator.generate()`,
cached; it never depended on controllers). Dropped with `generateDocs(controllerClasses)`: the DEV startup
`[docs]` warnings of `lib/openapi/validator.js` (undocumented actions, WS events not referenced in webSocket.js).

Differential (scratchpad `sysProbe.js`, `flip-matchProbe.js`, `flip-matProbe.js`; pre-change tree copied to
`scratchpad/legacy/server`; status + selected headers (content-type, content-length, CORS, vary, etag, allow) + full
body text/md5):
- system probe, 62 requests (/, health: plain, token, bad token, matId/matCode/matchId query, JSON body, HEAD, POST,
  PUT, DELETE, CORS preflight, allowed/foreign Origin, trailing slash, junk query; uppercase/encoded health path,
  static paths, unknown path; the 3 docs routes x 7 variants):
  test mode 62/62 identical; development mode identical except the 6 `/docs.json` responses (intended: generated
  spec, 23,719 bytes vs the hand-written 20,080). `/docs` HTML and `/async-docs.json` byte-identical.
- broad sample: 272-request match probe (responses + full row dump) and 173-request mat probe, test AND development
  mode (validator off for the routing comparison): byte-identical, legacy vs new.
- development mode WITH the validator on: system probe identical except /docs.json (after allowing unknown query
  params, see section 4).

## 4. Validator rollout (decision F)

- `src/contract/openapi.ts`: `servers: [{ url: '/' }]`. `openapi.json` regenerated; diff is exactly one line
  (`"url": "/api"` -> `"url": "/"`); two consecutive runs byte-identical (md5 5077a418...).
- Config: `ACCORD_OPENAPI_VALIDATION=0` off, `=1` on outside development (tests); constructor option
  `openApiValidation` wins over the env; never on when `NODE_ENV=production`; default = DEV.
  Options: `validateRequests: { allowUnknownQueryParameters: true }`, `validateResponses: true`,
  `ignoreUndocumented: true` (docs pages, unknown URLs left to Express as before), spec = structuredClone of the
  generated document (the validator rewrites it; /docs.json keeps the original).
- Permanent test `test/contract/openapiValidation.test.js` (4 tests): document has paths and server '/'; full capture
  plan replayed with validation on, all 43 success goldens (39 HTTP < 400 + 4 WS) byte-identical; validator provably
  active (`http.users.create.missingName.400` answered by the validator's text/html page); DEV boot with validation:
  `/`, `/docs`, `/docs.json` (== generated document), `/async-docs.json` all 200.
- Non-vacuity (mutations, each reverted, md5 checked): M1 `CreateUserRequest.name` z.string -> z.number: fails
  (`http.users.create.success` rejected). M2 `User.name` (response) -> z.number: fails, 35 success goldens. M3
  servers back to `/api`: 2 fail (document check + "actually running"), i.e. the old vacuous state is caught.
- Golden replay, validator on: success 43/43 identical. Error goldens 32/42 identical; the 10 others are answered by
  the validator itself (text/html):

  | golden | app | validator |
  |---|---|---|
  | http.users.create.missingName.400 | 400 envelope | 400 `request/body must have required property 'name'` |
  | http.users.create.objectName.500 | 500 envelope | 400 `request/body/name must be string` |
  | http.mats.create.unauthenticated.401 | 401 envelope | 401 `'X-Api-Token' header required` |
  | http.mats.create.missingName.400 | 400 | 400 `required property 'name'` |
  | http.mat.judges.unauthenticated.401 | 401 | 401 `'X-Api-Token' header required` |
  | http.matches.create.missingCompetitors.400 | 400 | 400 `required property 'red'` |
  | http.match.get.unauthenticated.401 | 401 | 401 `'X-Api-Token' header required` |
  | http.rounds.result.explicitNull.400 | 400 | 400 `request/body/winner must be string` |
  | http.rounds.result.invalidWinner.400 | 400 | 400 `must be equal to one of the allowed values: red, blue` |
  | http.ridingTime.start.invalidRider.400 | 400 | 400 `must be equal to one of the allowed values: red, blue` |

  Same status everywhere except objectName (500 -> 400); every one is a request the server itself refuses.
- Divergences triaged and fixed:
  1. The four 422 goldens became 500 `/response must NOT have additional properties`: the envelope object held
     `status: undefined` (dropped by JSON.stringify, so the WIRE never had it; the validator inspects the object).
     Fixed in `src/http/envelope.ts#envelopeFor` by leaving the key out; bytes identical (envelope tests + goldens).
  2. Unknown query parameters (`/?x=1`, `/system/healthCheck?matId=...`) were rejected (400) although every route
     ignores them: `allowUnknownQueryParameters: true` (validator option; the spec diff must stay the servers line).
- Remaining DEV-only strictness, NOT on any client path (all goldens pass), recorded as F-96, not fixed:
  text/plain and form-urlencoded bodies -> 415 (server parses both); `POST /mats` without `judge_count` -> 500
  response validation (F-82 string "1"); non-contract inputs the server tolerates (F-75 leniency, e.g. `name: 5`) ->
  400; missing token -> validator 401 even where the app would answer 404 (F-74 unknown code). Off switch available.

## 5. WebSocket / worker (decision G)

- ws goldens (real workers via performJob) pass in every suite run (contract.test.js) and in the validator replay.
- Real boot (scratchpad `wsBoot.js`, NODE_ENV=test, temp DB): `new ApplicationServer({port}).listen()`, worker
  spawned like bin/www (token in argv, PORT + PROC_NAME env) but `bun ./bin/worker` (bin/www's `npm run worker` is
  not runnable here: npm is banned and node cannot load the .ts leaves, F-32). socket.io-client (websocket transport,
  apiToken auth) joins the match. Observed: match.update x3 within 2.5 s of joining; vote back-dated 300 s ->
  `round.tech-fall` (worker log "Tech fall threshold reached"); break back-dated -> `break.ended` ("Break expired");
  open round back-dated -> "Round timer expired" + match.update with both rounds ended. Worker debug log shows all
  four loops ticking (tech fall 10, break expiry 6, timer expiry 6, broadcast 12 in ~10 s). Event counts:
  match.update 8, round.tech-fall 1, break.ended 1.
- Side observation (my first back-dating attempt created an invalid state): one rejected performJob printed bun's
  crash banner and the whole worker PROCESS exited (all four jobs), not just one loop. F-98.

## 6. Route table evidence

Live Express stack, `:param` -> `{param}`, sorted, vs `artifacts/route-table.txt`: development 23 routes, diff EMPTY,
0 duplicates; non-DEV 20 routes, diff = exactly the 3 DEV docs routes. Every route's chain starts with
`resolveState` and ends with `routeErrorHandler` (liveRoutes test).

## 7. No controllers loaded (runtime)

`scratchpad/loadcheck.js`: boot + listen + a health request, then `require.cache`: controllers/ 0 (prod and dev);
control: requiring one controller afterwards makes it 1. lib/server modules loaded: webSocketServer, webSocket,
abstractWebSocket, authorizer, workerWebSocket only (the WebSocket tier, ported later) — NOT serverController,
applicationServer, systemController, docsController. Models (7) come only through that WebSocket tier. Requiring the
route table alone loads 0 modules from controllers/, models/, lib/activeRecord, sequelize. Static grep of src/: no
import of models/, lib/activeRecord (except the pre-existing lazy path resolver in src/db/index.ts), sequelize or
controllers/. Also pinned permanently by the retargeted characterization test (with a control assertion).

## 8. Tests removed / rewritten / added

- `test/characterization/routeTable.test.js` (approved retarget, 6 -> 6): live table from the Express stack of two
  booted servers (dev / non-dev, free ports), compared to the UNCHANGED fixture as sorted sets of `METHOD /path`.
  Tests 1-4 and 6 same assertions; test 5 "autoloads exactly the six controller classes" (subject gone) ->
  "loads no controller class from controllers/" (with a control that the cache is observable). Mutations: requiring a
  controller from server.ts -> test 5 fails; registering userRoutes twice -> 5 of 6 fail.
- `test/server/applicationServer.test.js` (10 -> 21): REMOVED (subject gone): "searches directories and
  subdirectories", "initializes controllers with the correct path", "configures routes on underlying express server"
  (its fixture-controller version). MOVED verbatim to `test/server/legacyControllerDispatch.test.js` (5): the five
  `requestHandler` callback-order cases, now against `LegacyControllerDispatch`. KEPT: "starts the web socket
  server", "starts the http server" (+ asserts the port). ADDED: mountRoutes (route counts by method incl. the
  system routes; docs only in DEV; middleware -> validator -> routes order; no validator when off); Socket.IO
  attaches to the same http.Server (upgrade listener, idempotent); close; onError (non-listen rethrow, EACCES,
  EADDRINUSE, other); workerToken (generated UUID, stable; injected); port/PORT/3000; CORS + WEB_ORIGIN; dev default;
  `openApiValidationEnabled` matrix incl. production.
- Fixtures: deleted `test/server/helpers/server.js` (TestServer overriding controllerDirectories) and
  `helpers/controllers/sub/bazController.js` (only the discovery test used it). `fooController.js` kept (dispatch
  test, serverController test); `barController.js` kept (serverController.test.js uses it).
- `test/http/liveRoutes.test.ts` (7 -> 5): dropped "lists at least one ported controller" and the two
  served-by-registry-vs-legacy tests (seam gone); now: no duplicates (dev + non-dev), table == baseline (both), every
  route = registry chain ending in its error handler, mountRoutes idempotent; DB-file test unchanged.
- `test/http/routeTable.test.ts` (13 -> 13): legacy oracle now built from the six controller files + System/Docs
  directly (autoloader gone); placeholder test -> "has a real handler on every route, and refuses to mount a
  placeholder" (assertImplemented).
- `test/http/registry.test.ts`: the "placeholder fails loudly" case used the health check as its placeholder; now a
  synthetic placeholder copy of it.
- `test/http/envelope.test.ts`: name-only switch to `LegacyControllerDispatch`.
- `test/contract/openapiValidation.test.js` (new, 4).
- `test/helpers/httpServer.js`: path edit, `serverOptions` pass-through, exports `freePort`.
- comments only: test/setup.js, test/helpers/express.js (file that now holds the 8 toHaveBeenCalledBefore uses).

## 9. Verification (2026-10-12, Bash; run_task unavailable)

- `bun run typecheck`: exit 0.
- `bun run test`: 965 pass / 0 fail / 61 files, 3 consecutive runs (plus 3 earlier runs before the last validator
  option change: same counts). No flake. Baseline 947/59: +11 applicationServer (10 -> 21), +5
  legacyControllerDispatch (moved), +4 openapiValidation, -2 liveRoutes (7 -> 5); characterization routeTable 6 -> 6,
  http routeTable 13 -> 13.
- `git status`: test/contract/goldens, other characterization files and the fixture untouched; only the approved
  `test/characterization/routeTable.test.js` changed. lib/workerQueue, models/, controllers/, app/ untouched.
- `bun run generate:openapi` x2 byte-identical; diff vs HEAD is the single servers line.
- `bunx --bun drizzle-kit generate`: "No schema changes, nothing to migrate".
- real sqlite files untouched (development md5 aef3d070..., Apr 24; test Apr 20; server/database.sqlite Jan 15).
- server/README.md: short section on the DEV validator and `ACCORD_OPENAPI_VALIDATION`.
- A pre-existing `npm run worker` / nodemon process (started Sep 14, PID 34586/34605) was found running on the
  machine; not started by this task, left alone.
