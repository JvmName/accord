/**
 * Task 15a check (no fixture written): the table the legacy reflection router
 * registered (System + Docs + the six controllers, computed exactly as the
 * pre-15a test/http/routeTable.test.ts#legacyLiveTable did) equals the
 * protected test/characterization/fixtures/routeTable.txt, keys AND owners.
 * That is what lets routeTable.test.ts read the owners from that fixture.
 *
 *   cd server && bun ../.ai/plans/server-ts/artifacts/freeze/checkRouteTable.js
 */
const X = require('./legacyHarness');
const fs = require('fs');
const path = require('path');

const { SystemController } = X.req('lib/server/systemController');
const { DocsController }   = X.req('lib/server/docsController');
const controllers = [
    ['usersController', ''], ['matsController', ''], ['matchesController', ''],
    ['mat/usersController', '/mat'], ['match/roundsController', '/match'], ['match/ridingTimeVoteController', '/match'],
];
const classes = [SystemController, DocsController];
for (const [file, directoryPrefix] of controllers) {
    for (const exported of Object.values(X.req(`controllers/${file}`))) {
        exported.directoryPrefix = directoryPrefix;
        classes.push(exported);
    }
}
const live = [];
for (const cls of classes) for (const action of cls.actions) live.push(`${action.method} ${action.path}\t${cls.name}#${action.action}`);

const fixture = fs.readFileSync(path.join(X.SERVER, 'test/characterization/fixtures/routeTable.txt'), 'utf8')
    .split('\n').map((l) => l.trimEnd()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t').slice(0, 2).join('\t'));

const a = live.sort().join('\n');
const b = fixture.sort().join('\n');
console.log(a === b ? `IDENTICAL (${live.length} routes, keys and owners)` : `DIFFERENT\n--- live\n${a}\n--- fixture\n${b}`);
process.exit(a === b ? 0 : 1);
