# Coverage map (task 15a, step 2): retired legacy test -> where its protected behavior lives now

Every category (i) file, every behavior group, the covering test(s). "subject deleted" = the behavior is a property of
the legacy class itself (reflection, the Sequelize ORM, the custom migrator), with no counterpart in the new stack; the
behaviors the new stack inherited are listed with their tests. Rows marked NEW were written in 15a to close a gap
(they run against the current code and pass). Test names are as of the end of 15a.

## test/server/authorizer.test.js (39) -> frozen grid + restated rules + matrix
| behavior group | now covered by |
|---|---|
| classForScope (3: class, instance, string) | subject deleted: dispatch on `constructor.name` replaced by an explicit scope `kind`. Every kind (string, matClass, mat, match, user, nulls) is a row of the frozen grid: `test/http/permissions.test.ts` "agrees on every (subject x scope x action) cell" (fixture `permissions.jsonl`, 4,050 cells, 1,190 G / 2,800 d / 60 throws) |
| String permissions (2) | grid rows `string '...'`; restated "string scopes: `test` grants, anything unknown denies" |
| Mat assign / create a match (8: admin code, other mat's admin code, viewer code, no code) | grid rows mat1/mat2 x codes mat1Admin/mat2Admin/mat1Viewer/none; restated "mat assign / create a match: only the ADMIN code OF THIS MAT"; HTTP: `characterization/authorization.test.js` (unmodified) |
| Mat create (3) | grid `Mat class` row; restated "mat create: any user, no code needed; anonymous denied" |
| Mat be assigned judge / view (7) | grid; restated "mat be assigned judge / view: unconditional for a mat; null mat denied" |
| Match judge (4: judge, red, blue, other) | grid `matchA` x `judge` (judge G; creator/other/creator2/anonymous d); restated "match judge: only a judge of the match" |
| Match manage (3) | grid `matchA`/`matchB`/`matchOrphan` x `manage`; restated "match manage: only the mat creator" |
| Match pause (3, incl. judge allowed) | grid `pause` column; restated "match pause PERMISSION: creator or judge (the route never reaches the judge branch)"; route-level deny of judges: `authorization.test.js` (unmodified) |
| Match view (4: names say "does not allow", asserts are truthy) | grid `matchA` x `view` = G for every subject; restated "match view: unconditional for a match; null match denied" |
| User assign (2: self, other) | grid `user other` scope (subject `other` = self, others = other user) and `user null`; restated "user assign: any existing user; a null user (unknown id) denied" |

## test/server/serverController.test.js (35)
| behavior group | now covered by |
|---|---|
| actionNames, _constructAction (4) | subject deleted (reflection). The route set is pinned by `test/http/routeTable.test.ts` (baseline, characterization fixture with owners, no duplicates) and `test/characterization/routeTable.test.js` |
| validateParameters (4: runs checkers, nothing on success, ValidationError for one / several errors) | `test/http/registry.test.ts` "throws ValidationError with legacy keys and messages", "validates the body from the merged bag..."; goldens `http.matches.create.missingCompetitors.400` (two keys), `http.users.create.missingName.400` via `contract.test.js` and `envelope.test.ts` |
| validatePresence (2) | registry "rejects a falsy name with the legacy presence message"; goldens `*.missingName.400` |
| validateIsEnum (2) | goldens `http.rounds.result.invalidWinner.400`, `.explicitNull.400`, `http.ridingTime.start.invalidRider.400` (contract + envelope replays) |
| validateIsInteger (7), validateIsDateTime (6), validateIsEmail (3), validateFunction (2) | subject deleted: no controller ever used them (grep: only `presence` and `isEnum` appear in controllers/); no route validates with them |
| authorize (4: authorized, no user needed, not authorized, no user) | `test/http/authorizationParity.test.ts` (matrix rows + extra deny rows; "never invokes the handler on a denied request"); `characterization/authorization.test.js` (unmodified) |

## test/server/legacyControllerDispatch.test.js (5)
| behavior group | now covered by |
|---|---|
| callbacks run in order; per-action inclusion/exclusion; a `false` stops later callbacks and the action | subject deleted (callback mechanism). The registry's fixed chain replaces it: `test/http/liveRoutes.test.ts` "serves every route through the registry chain, which ends in its own error handler"; `authorizationParity.test.ts` "gates run before the handler / never invokes the handler on a denied request"; per-route gate order in the matrix rows (401 before 404 before 401/400) |

## test/server/webSocket.test.js (6), webSocketServer.test.js (5), workerWebSocket.test.js (3)
All 14 assertions PORTED onto src/ws (NEW `test/ws/units.test.js`, 15 tests): init looks the user up, closes the socket
without a user, registers the 5 handlers, `on` binds, `apiToken`, `id`; WorkerWebSocket registers its handlers and relays
each event into `match:<id>` (+ break.ended); WebSocketServer#listen (one `use`, one `connection`), `_initWebSocket`
creates a client WebSocket with this host and continues / fails the handshake with the error, `on` binds, `emit` goes
through `to(room).emit`. Observable behavior over real sockets: frozen `test/ws/webSocketTier.test.js` (25 transcripts,
7 handler outcomes, 24 token lookups, 12 match lookups).

## test/workerQueue/matchUpdateWorker.test.js (6) -> frozen emission scenarios (`test/workers/emissionDifferential.test.js`)
| assertion | scenario / assertion |
|---|---|
| fetches open rounds | "round in progress: ..." (an open round is broadcast) and "idle ticks" (nothing open, nothing emitted) |
| broadcasts one update per open round | "all at once: concurrent matches ..." (one `match.update` per room per broadcast tick; per-room fixture lists), claim "rooms.size == 9" |
| sends a final update for a match that just left the active set | "tech fall in the final round ends the match (one final match.update)" and "round timer expiry in the final round ..." (claim: exactly one final matchUpdate after the end, with mat/judges/rounds) |
| does not send a final update for a match that is still active | "round in progress": exactly 4 emissions at 0/1/2/3 s, no extra update |
| throttles to ~1 s but still emits the final update immediately | cadence claim [0,1000,2000,3000]; NEW claim in "the scenarios exercise what they claim": in "all at once, with the match-update job running FIRST", tf3 and timer3 get their final update at 2.25 s, inside the throttle window, and nothing else is broadcast then |
| render options (mat, judges, rounds) | NEW claim: every regular update in the cadence scenario has mat/judges/rounds; finals checked the same way; payload bytes frozen |

## test/models/round.test.js (26) -> lifecycle snapshot + serializers
| assertion | now covered by |
|---|---|
| pause creates a pause row (paused_at set, resumed_at null) | lifecycleParity "pause an active round" (fixture row change `+ round_pauses` with resumed_at null) |
| pause does not end open votes | NEW scenario `pause.withOpenVotes`: lifecycleParity "pause leaves open riding-time votes open" |
| pause throws "Round has not started" | NEW `test/services/roundLifecycle.test.js` "throws "Round has not started" ..." (unreachable through stored rows) |
| pause throws already ended / already paused | lifecycleParity "pause %s: throws "%s"" (match:break, match:paused) |
| paused true/false/false | NEW `test/services/roundLifecycle.test.js` isRoundPaused x3; wire `paused`: `test/serialize/round.test.js` "paused: an OPEN pause freezes ..." |
| resume sets resumed_at / throws when not paused | lifecycleParity "resume a paused round", "resume a round that is not paused" |
| end: resume before ended_at when paused / no resume when not paused | lifecycleParity "open pause is resumed before the round ends" (write order), "mid-match round 1, no votes" |
| end sets ended_at; leaves declared_winner_id/stoppage null | lifecycleParity "mid-match round 1, no votes" (row changes: only ended_at/updated_at on the round) |
| match transition x2 (describe duplicated): ends after round 3; not after round 1/2 even with wins; break after round 1 | lifecycleParity "FINAL round: ...", "NO EARLY EXIT ...", "mid-match round 1 ... 60s break" |
| setResult: throws if not ended; sets winner+stoppage; clears; overwrite | lifecycleParity "a round that has not ended ...", setResult.write cases (incl. `match:done` red->blue overwrite and the clear cases), no-op saves |

## test/activeRecord/** (58) -> subject deleted
| file | verdict; inherited behaviors and their tests |
|---|---|
| baseRecord.test.js (15) | subject deleted (BaseRecord, Sequelize init, tableName inflection, find/where wrappers). Inherited: `apiSafeKeys`/`toApiResponse` (no created_at/updated_at on the wire) -> `test/serialize/*.test.js` + golden equivalence; lookups -> `test/db/repositories/*.test.js` and the frozen `repositories` suite |
| db/connection.test.js (8) | subject deleted (Sequelize connection cache/settings). Inherited: one DB file per process -> `test/http/liveRoutes.test.ts` "opens the database lazily, at DATABASE_PATH ..."; busy timeout -> `test/db/busyTimeout.test.ts` |
| db/connectionConfiguration.test.js (14) | subject deleted for the new stack, BUT `src/db/index.ts#resolveDatabasePath` still delegates to this class (see F-107): `DATABASE_PATH` resolution is covered by liveRoutes; the `config/db/database.<env>.sqlite` fallback has no new-stack test (it is legacy code until 15b re-homes it) |
| db/migrator.test.js (17), db/queryInterface.test.js (4) | subject deleted (custom migrator). Schema creation is the Drizzle baseline: `test/db/schema.test.js`; transactions: `test/db/repositories/transaction.test.js`; ISO datetime codec: `test/db/datetime.test.js`; constraint-error mapping: `test/http/envelope.test.ts` "a REAL SQLite unique violation through Drizzle" |

## Not retired, trimmed
- `test/workers/modules.test.js`: control no longer requires `lib/workerQueue/worker`; it now proves the cache is observable
  (requires an unloaded src module) and that the patterns match a sample of forbidden paths. Same 3 tests.

No open gap.
