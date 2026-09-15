/**
 * CHARACTERIZATION — the complete route table.
 *
 * Pins the exact SET of (method, path) pairs the server registers, plus the
 * count, against a committed fixture. Asserting the full set (rather than a
 * subset) is the point: a subset check would not notice a route disappearing.
 *
 * Registration ORDER is deliberately not asserted. `#importControllers` walks
 * `fs.readdirSync`, which Node sorts and bun does not (FINDINGS.md F-04), so
 * order is filesystem-dependent under bun. Both sides are sorted before
 * comparison.
 *
 * Consumed by tasks 13a / 13b / 13c / 15.
 */
const { describe, expect, it } = require('bun:test');
const   fs                     = require('fs');
const   path                   = require('path');

const { ApplicationServer } = require('../../lib/server/applicationServer');
const { SystemController }  = require('../../lib/server/systemController');
const { DocsController }    = require('../../lib/server/docsController');


const FIXTURE_PATH  = path.join(__dirname, 'fixtures', 'routeTable.txt');
const ARTIFACT_PATH = path.join(__dirname, '..', '..', '..',
                                '.ai', 'plans', 'server-ts', 'artifacts', 'route-table.txt');


function parseFixture() {
    const entries = [];
    for (const rawLine of fs.readFileSync(FIXTURE_PATH, 'utf8').split('\n')) {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith('#')) continue;

        const [methodAndPath, owner, flag] = line.split('\t');
        const spaceIdx = methodAndPath.indexOf(' ');
        entries.push({
            method: methodAndPath.slice(0, spaceIdx),
            path:   methodAndPath.slice(spaceIdx + 1),
            owner,
            dev:    flag === 'DEV',
            line:   `${methodAndPath}\t${owner}`,
        });
    }
    return entries;
}


/**
 * Reproduces exactly what `ApplicationServer#registerControllers` registers:
 * the default controllers first (SystemController always, DocsController only
 * when CONSTANTS.DEV), then every autoloaded controller class.
 *
 * `includeDev` makes the DEV-only half explicit instead of leaving the result
 * dependent on NODE_ENV, so this test asserts the same 23 routes regardless of
 * the environment it runs in.
 */
function collectRoutes({ includeDev }) {
    const server  = new ApplicationServer();
    const classes = [
        SystemController,
        ...(includeDev ? [DocsController] : []),
        ...server.controllerClasses,
    ];

    const rows = [];
    for (const controllerCls of classes) {
        for (const action of controllerCls.actions) {
            rows.push(`${action.method} ${action.path}\t${controllerCls.name}#${action.action}`);
        }
    }
    return rows.sort();
}


describe('CHARACTERIZATION: route table', () => {
    const fixture = parseFixture();

    it('registers exactly the routes in the committed fixture (development: all 23)', () => {
        const expected = fixture.map(e => e.line).sort();
        expect(collectRoutes({ includeDev: true })).toEqual(expected);
    });


    it('registers exactly the non-DEV routes when CONSTANTS.DEV is false (20)', () => {
        const expected = fixture.filter(e => !e.dev).map(e => e.line).sort();
        expect(collectRoutes({ includeDev: false })).toEqual(expected);
    });


    it('registers exactly 23 routes in development and 20 outside it', () => {
        expect(collectRoutes({ includeDev: true  })).toHaveLength(23);
        expect(collectRoutes({ includeDev: false })).toHaveLength(20);
        expect(fixture).toHaveLength(23);
        expect(fixture.filter(e => e.dev)).toHaveLength(3);
    });


    it('exposes no duplicate (method, path) pairs', () => {
        const pairs = collectRoutes({ includeDev: true }).map(row => row.split('\t')[0]);
        expect(new Set(pairs).size).toBe(pairs.length);
    });


    it('autoloads exactly the six controller classes under controllers/', () => {
        const names = new ApplicationServer().controllerClasses.map(c => c.name).sort();
        // NOTE: `UsersController` appears twice — controllers/usersController.js
        // and controllers/mat/usersController.js are distinct classes that share
        // a name and are disambiguated only by `directoryPrefix`.
        expect(names).toEqual([
            'MatchesController',
            'MatsController',
            'RidingTimeVoteController',
            'RoundsController',
            'UsersController',
            'UsersController',
        ]);
    });


    it('matches the task-01 route-table artifact once paths are OpenAPI-normalised', () => {
        // The artifact that tasks 13a/13b/13c/15 diff against writes `{param}`
        // where Express registers `:param`. Asserting the two agree makes the
        // artifact itself a gate rather than a stale text file.
        const normalised = collectRoutes({ includeDev: true })
            .map(row => row.split('\t')[0].replace(/:(\w+)/g, '{$1}'))
            .sort();

        const artifact = fs.readFileSync(ARTIFACT_PATH, 'utf8')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('TOTAL:'))
            .sort();

        expect(normalised).toEqual(artifact);

        const total = fs.readFileSync(ARTIFACT_PATH, 'utf8').match(/^TOTAL:\s*(\d+)$/m);
        expect(total).not.toBeNull();
        expect(Number(total[1])).toBe(23);
    });
});
