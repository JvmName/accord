# Protected-instrument changes in task 15a (user approval 2026-10-12)

The assertion-by-assertion mapping (old target -> new target, every old assertion -> its new form) is in
`../freeze-notes.md`, section "Protected-instrument rewrites". Summary and the mutations that prove each new assertion can fail
(results in `mutation-results.md`):

| file | old target | new target | tests | mutations killed |
|---|---|---|---|---|
| test/characterization/errorMapping.test.js | lib/server/applicationServer.js (ApplicationServer alias of the legacy dispatch) | src/http/middleware/errors.ts via a registry route over HTTP | 17 -> 17 | X1, X2, X3 |
| test/characterization/matCode.test.js | models/matCode + ServerController#setupRequestState (mocked models) | src/domain/matCode + src/http/middleware/requestState.ts on a real DB with decoys | 11 -> 11 | C1, C2, C3 |
| test/characterization/workers/techFallTracker.test.js | lib/workerQueue (fake models) | src/workers on a scratch Drizzle DB | 11 -> 11 | C4..C7 |
| test/characterization/workers/breakTransition.test.js | lib/workerQueue (fake models) | src/workers on a scratch Drizzle DB | 13 -> 13 | C8..C11 |
| test/characterization/workers/roundTimer.test.js | lib/workerQueue (fake models) | src/workers on a scratch Drizzle DB | 20 -> 20 | C12..C16 |
| test/characterization/workers/tickIntervals.test.js | src/workers (unchanged) | removed two inert mock.module lines (models/round, models/match), header reworded | 9 -> 9 | n/a (assertions untouched) |

`test/characterization/authorization.test.js`, `test/characterization/fixtures/routeTable.txt` and every file in
`test/contract/goldens/` are byte-identical to HEAD (git status / git diff empty).
