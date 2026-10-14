# Task 12 — typed route registry: working notes

Progress notes written while executing task 12 (`12-typed-route-registry.md`).
`run_task` MCP was unavailable in this session (agent-task-queue failed to
connect), so every `bun` command was run through Bash, as the protocol allows
when it says so explicitly.

## 0. Step-4 verification of the plan against the code (2026-10-11)

| Plan assumption | Reality |
|---|---|
| `serverController.js:427-431` prototype scanning, `applicationServer.js:224` `this['_'+method]` | still there (`actionNames` 427-431, `#registerAction` 225-229) |
| `applicationServer.js:321-342` `readdirSync` autoloader | 325-346 |
| `applicationServer.js:268-292` handleError | 272-296 |
| `serverController.js:149-162` statusText | unchanged, 149-162 |
| `serverController.js:315` CODE_REGEXP discrimination | 315 |
| `src/contract/*` Zod schemas, `routeResponses` table | present; `routeResponses` already keys every route's SUCCESS envelope |
| repositories for user/mat/matCode/match/round | present (`src/db/repositories/*`) |
| task-02b matrix "must pass unchanged against the new middleware" while "do not register the routes" | CONFLICT, resolved by the orchestrator: parity is proven in `test/http/` over a TEST Express app mounting the new registry (stub handlers, real repositories, scratch Drizzle DB). The characterization file stays untouched and runs over real HTTP in 13a/13b. |
| `test/contract/openapi.test.ts` "defers paths to task 12" asserts `paths: {}` | this task makes paths non-empty, so that one assertion (written to be flipped by task 12) had to change. Reported. |

## 1. Legacy behaviour established by reading + probing (scratch probe on a temp DB)

Probe: `scratchpad/probe1.js` (not committed) boots the legacy `ApplicationServer`
on a throwaway DB (`test/helpers/httpServer.js`) and records:

```
anonUnknownJudges       404 {"data":null,"status":"not found"}     <- NOT 401 (see F-74)
anonUnknownViewers      404 {"data":null,"status":"not found"}
anonUnknownLeave        404 {"data":null,"status":"not found"}
badTokenKnownJudges     401 {"data":null,"status":"unauthorized"}
queryOverrideMatches    200   POST /mat/<viewerCode>/matches?matCode=<adminCode>  (F-73)
bodyOverrideMatches     200   POST /mat/<viewerCode>/matches  body.matCode=<adminCode>  (F-73)
jsonStringName          500 {"error":"string violation: name cannot be an array or an object"} (body name '{"a":1}' is JSON-decoded)
queryName               200   POST /users?name=fromQuery with {} body -> user named fromQuery
emptyName               400 {"name":["required"]}
numberName              200   user.name === 5 on the wire
joinNumberMatCode       404 {"matCode":["not found"]}   (body matCode:5 overrides the path code)
competitorString        400 red.id/red.name errors        (red: "abc")
competitorUnknownId     401                               (red.id unknown -> User.find null -> authorize('assign', null))
competitorEmptyName     400 red.id/red.name errors        (presence, not type)
anonMatchesUnknownCode  401 ; userMatchesUnknownCode 401 ; anonMatsMissingName 401 (authorize BEFORE validate)
```

(Notes continue below as the work proceeds.)

## 2. Design (as built)

Files (all new): `src/http/{types,route,router,errors,envelope,legacyInput,permissions}.ts`,
`src/http/middleware/{requestState,authorize,validate,errors}.ts`,
`src/http/routes/{index,system,users,mats,matUsers,matches,rounds,ridingTimeVotes,requests}.ts`.
File names under `routes/` follow what 13a/13b list as their "Affected Files".

- `defineRoute({ method, path, authorize, request: {params, query, body}, response, render?, tags, devOnly?, openapi?, handler })`.
  `ctx` is inferred: `params/query/body` = `z.output` of the schemas; `currentUser/currentMat/currentMatCode/currentMatch/currentRound`
  present exactly where the `authorize` spec guarantees them (`StateFor<A>`); success return type = the response envelope's `data`.
  Compile-time check: the `params` schema must declare exactly the path's `:params` as strings.
  (strict is off until task 18, so `X | null` vs `X` is documentation only; property PRESENCE is enforced. F-46.)
- Chain per route (router.ts, explicit `switch` on the method, no `app[method]`):
  `resolveState -> authorize gates -> validate -> handler -> route error handler`.
  Errors during state resolution go to Express's default handler (legacy `setupRequestState` ran outside `handleError`).
- `AuthorizeSpec` (F-53 resolution): a tagged union with the scope kind EXPLICIT:
  `none/public`, `newMat/create`, `mat/view`, `matCode/{public,view,create a match}`, `match/{view,manage,pause}`, `match/judge + round:'open'`.
  `middleware/authorize.ts#runGates` expands each to the legacy check order. `permissions.ts#can(subject, action, scope, loaders)` is the
  line-for-line port of `authorizer.js` with `Scope = string | matClass | mat | match | user` tagged; relationship reads via repositories.
- Runtime request schemas (`routes/requests.ts`) are LEGACY-FAITHFUL (F-75), the task-05 contract schemas are used for OpenAPI via
  `openapi.body/query` overrides. Reason: golden `http.users.create.objectName.500` needs an object `name` to pass validation.
- Validation reads the legacy merged bag (F-73); `ctx.params` comes from the path only.
- Envelope: `statusText` verbatim (422 -> no `status`, F-21); `_formatJSONBody` walk verbatim (undefined -> null, Date -> ISO), minus `toApiResponse`.
- Error handler: unique violation (bun:sqlite `SQLITE_CONSTRAINT*` behind `DrizzleQueryError.cause`, Sequelize's field extraction, `"<f> must be unique"`,
  `"null": "SQLITE_CONSTRAINT: <msg>"`, F-14) -> 400; `constructor === AuthorizationError` -> 401; `=== ValidationError` -> 400; else 500 `{error: message}` (F-13).

## 3. Per-route authorization table (SECURITY BOUNDARY; asserted by test/http/routeTable.test.ts)

| route | legacy owner | spec | effective sequence |
|---|---|---|---|
| GET / , GET /system/healthCheck | SystemController | none/public | nothing |
| GET /docs, /docs.json, /async-docs.json (DEV) | DocsController | none/public | nothing |
| POST /users | UsersController#postIndex | none/public | validate |
| POST /mats | MatsController#postIndex | newMat/create | user? else 401 -> validate |
| GET /mat/:matId | MatsController#getMat | mat/view | mat? else 401 (F-16); NO authn (F-15, intended) |
| POST /mat/:matCode/join | mat/UsersController#postJoin | matCode/public | nothing; handler: unknown code 404, admin code -> assign + be assigned judge |
| DELETE /mat/:matCode/join | mat/UsersController#deleteJoin | matCode/view | mat? else 404 -> user? else 401 (F-74); handler: admin -> assign + be assigned judge |
| GET /mat/:matCode/judges, /viewers | mat/UsersController | matCode/view | mat? 404 -> user? 401 |
| POST /mat/:matCode/matches | MatchesController#postIndex | matCode/create a match | user? 401 -> create a match + assign (admin code of THIS mat) 401 -> validate; handler: assign(red/blue user; null -> 401) |
| GET /match/:matchId | MatchesController#getMatch | match/view | user? 401 -> match? 404 |
| POST /match/:matchId/start, /end | MatchesController | match/manage | user? 401 -> match? 404 -> manage 401 |
| POST /match/:matchId/rounds, /rounds/end; PATCH /rounds/result | RoundsController | match/manage | user 401 -> match 404 -> manage 401 (-> validate for PATCH) |
| POST /match/:matchId/rounds/pause, /resume | RoundsController | match/pause | user 401 -> match 404 -> manage 401 -> pause (= manage or judge, judge branch dead: F-11) |
| POST, DELETE /match/:matchId/ridingTime | RidingTimeVoteController | match/judge + round open | user 401 -> match 404 -> open round? else 400 -> judge 401 (-> validate for POST) |

## 4. Mutation proofs (non-vacuity), each reverted and verified byte-identical with `cmp`

| id | mutation | gate | result |
|---|---|---|---|
| A | `runGates` returns `null` first (permit everything) | test/http/authorizationParity.test.ts | 32 pass / **55 fail**: every matrix deny/404/400 row + every extra deny + "handler never reached" |
| B | `POST /match/:matchId/start` declared `match/view` instead of `match/manage` | routeTable + authorizationParity | **7 fail**: per-route authorization table, 4 matrix/extra deny rows on start, handler-not-reached |
| C | `pause` gate drops the leading `manage` check (widens to judges) | authorizationParity | **2 fail**: exactly the F-11 judge rows |
| D | `permissions.ts` drops `matCode.mat_id != scope.id` | test/http/permissions.test.ts (differential) | **fail**, mismatches listed (e.g. `mat2Admin assign on mat1: legacy=deny new=GRANT`) |

## 5. OpenAPI paths: generated vs hand-written (`lib/openapi`, `getOpenApiSpec()` after `generateDocs(controllers)`)

Method: throwaway diff script (scratchpad, not committed) over every operation; classification as in task 06.
Components: the 26 existing schema components are byte-identical (asserted); new: 5 error-envelope schemas
(`BadRequestEnvelope`, `UnauthorizedEnvelope`, `NotFoundEnvelope`, `UnprocessableEntityEnvelope`, `ServerErrorEnvelope`)
and `components.responses` (`BadRequest`, `Unauthorized`, `NotFound`, `ServerError` = hand-written names, + `UnprocessableEntity`).
`bun run generate:openapi` twice: byte-identical (`cmp`), sha1 8384b649819e34d5b8c43203b75a45500d31a70b. No `allOf` anywhere.

Operations: hand-written 18, generated 20. Only in generated: `GET /`, `GET /system/healthCheck`. Only in hand-written: none.

SUMMARY
  (a) generated more accurate ........ 9 items
  (b) generated wrong ................ 0 (the F-30 nullable-$ref bug was avoided: success `data` is rebuilt with `nullableRef`)
  (c) genuine contract change ........ 0  -> nothing to stop on; the spec is documentation, the wire is unchanged
  Documentation-level notes .......... 3

(a)-1 `GET /` and `GET /system/healthCheck` documented (real, public routes; the hand-written generator skipped unannotated actions).
(a)-2 operation `security`: `[]` on `POST /users`, `GET /mat/{matId}` (F-15, intended public), `GET /`, health check;
      `[{}, {ApiToken: []}]` (optional) on `POST /mat/{matCode}/join`. Hand-written inherited the global token requirement everywhere.
(a)-3 path parameter schemas: hand-written put `required: true` INSIDE the JSON Schema (not a valid use of the keyword); generated `{type: string}`.
(a)-4 `DELETE /match/{matchId}/ridingTime` `rider` query: hand-written had `required: true` inside the schema; generated optional
      `$ref CompetitorColor` (F-55: accepted and ignored).
(a)-5 `requestBody.required`: false for `POST /mat/{matCode}/join` (empty body valid: golden `...noName.anonymous`) and
      `PATCH /rounds/result` (no field required: golden `http.rounds.result.clear`); true elsewhere (as before).
(a)-6 request bodies `$ref` the task-05 contract components (CreateUserRequest, CreateMatRequest, JoinMatRequest, CreateMatchRequest,
      EndRoundRequest, StartRidingTimeVoteRequest) instead of inline copies.
(a)-7 per-route error statuses derived from the authorization spec + validation + declared handler statuses, instead of a blanket
      400/401/404/500 on every operation: e.g. `POST /users` no 401/404; `GET /mat/{matId}` 401 but no 404 (F-16); matches create no 404;
      roster/leave no 400; 422 (F-21, envelope WITHOUT `status`) added on `rounds/result`, `rounds/pause`, `rounds/resume`.
      Asserted complete against the wire: every one of the 78 non-DEV HTTP goldens validates (ajv) against the response its operation
      documents for its status (`test/http/openapiPaths.test.ts`).
(a)-8 200 envelopes: `data` = `anyOf [$ref <Payload>Response, null]`, `status` enum ok, `additionalProperties: false`; hand-written inlined
      untyped `data` objects with no `required`.
(a)-9 error envelopes typed exactly (errors map of string arrays; `Unauthorized.data` is `null`; `NotFound.data` is `errors | null`).

Documentation-level (not wrong w.r.t. the hand-written spec, recorded for task 18):
  D-1 `CreateMatchRequest` (task-05 component) cannot express "id OR name required" (a Zod refine); the hand-written oneOf could.
  D-2 `ServerErrorEnvelope.data.error` is a string, but a thrown non-Error renders `error: null` (pinned in errorMapping.test.js); same in
      the hand-written spec and in the task-05 `serverErrorDataSchema`.
  D-3 `BadRequestEnvelope` does not admit the F-14 bare-string `"null"` key (deliberately, as `envelope.ts` documents).
  Also: documented request bodies are the CONTRACT schemas, which are narrower than the legacy-faithful runtime validation (F-75).

## 6. Verification (2026-10-11, Bash; run_task unavailable)

- `bun run typecheck`: exit 0.
- `bun run test`: **926 pass / 0 fail, 56 files** (baseline 674 / 45; includes the concurrent task-11 agent's test/serialize files).
  Task-12 files alone (+ test/contract/openapi.test.ts): 192 pass / 0 fail across 7 files.
- `git status`: nothing under `test/contract/goldens`, `test/characterization`, `lib/`, `controllers/`, `models/`, `bin/`, `config/` changed.
  Modified: `src/contract/openapi.ts`, `openapi.json` (regenerated), `test/contract/openapi.test.ts` (the one "defers paths to task 12" assertion; F-76).
- `bun run generate:openapi` x2: byte-identical. 26 pre-existing schema components byte-identical. `openapiGoldens.test.ts` green.
- No pg/postgres references in the new code; real sqlite files (`config/db/*.sqlite`) untouched (April mtimes); tests use `:memory:` Drizzle DBs.
- `src/http` contains no readdirSync / prototype scanning / string-keyed dispatch (only comments naming them); asserted by routeTable.test.ts.

## 7. Open points for 13a/13b/13c

- Handlers are placeholders (`notImplemented('13a'|'13b'|'13c')`, throw -> 500). Nothing is registered in the running app.
- 13a `POST /users`: the runtime schema lets an object `name` through (presence only); to keep `http.users.create.objectName.500`
  the handler must produce `string violation: name cannot be an array or an object` (bun:sqlite fails differently on an object binding). F-75.
- In-handler checks that stay in handlers (the registry gives `ctx.authorize(action, scope, subject?)`): join/leave admin-code
  `assign` + `be assigned judge`; matches create `assign` on each competitor (unknown id -> null -> 401). For join, pass the NEWLY
  created anonymous user as `subject` if the check should see it (legacy built the Authorizer lazily, after creating the user).
- Serializers/handlers must OMIT absent keys, never set them to `undefined` (renders `null`; F-79).
- Legacy DEV mode also runs `express-openapi-validator` against the HAND-WRITTEN spec, app-wide; the registry does no response
  validation. Whoever re-homes the docs routes (13c) decides whether DEV validation moves to the generated spec.
- Run `test/characterization/authorization.test.js` UNCHANGED against the registered routes (F-76).
