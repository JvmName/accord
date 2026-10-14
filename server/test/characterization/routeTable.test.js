/**
 * CHARACTERIZATION — the complete route table.
 *
 * Pins the exact SET of (method, path) pairs the running server answers, plus
 * the count, against a committed fixture. Asserting the full set (rather than
 * a subset) is the point: a subset check would not notice a route
 * disappearing.
 *
 * The live table is read from the Express router stack of a booted
 * `ApplicationServer`. The fixture's third column names the controller action
 * that originally served each route; those controllers are no longer loaded,
 * so only method and path are compared.
 *
 * Registration ORDER is deliberately not asserted (the original table came
 * from an unsorted directory walk). Both sides are sorted before comparison.
 */
const { afterAll, beforeAll, describe, expect, it } = require('bun:test');
const   fs                     = require('fs');
const   path                   = require('path');

const { ApplicationServer } = require('../../src/http/server');
const { freePort }          = require('../helpers/httpServer');


const FIXTURE_PATH    = path.join(__dirname, 'fixtures', 'routeTable.txt');
const ARTIFACT_PATH   = path.join(__dirname, '..', '..', '..',
                                  '.ai', 'plans', 'server-ts', 'artifacts', 'route-table.txt');
const CONTROLLERS_DIR = path.join(__dirname, '..', '..', 'controllers') + path.sep;


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
            key:    methodAndPath,
        });
    }
    return entries;
}


/** Boots a server (DEV routes on or off) and returns it once its routes are mounted. */
async function bootServer({ dev }) {
    const server = new ApplicationServer({ port: await freePort(), dev });
    await server.listen();
    return server;
}


/** Every `METHOD /path` the server's Express app answers, sorted. Duplicates are kept. */
function liveRoutes(server) {
    const rows = [];
    for (const layer of server.expressApp.router.stack) {
        if (!layer.route) continue;
        for (const method of Object.keys(layer.route.methods)) {
            rows.push(`${method.toUpperCase()} ${layer.route.path}`);
        }
    }
    return rows.sort();
}


describe('CHARACTERIZATION: route table', () => {
    const fixture = parseFixture();
    let devServer;
    let prodServer;

    beforeAll(async () => {
        devServer  = await bootServer({ dev: true });
        prodServer = await bootServer({ dev: false });
    });

    afterAll(() => {
        devServer?.close();
        prodServer?.close();
    });


    it('registers exactly the routes in the committed fixture (development: all 23)', () => {
        const expected = fixture.map(e => e.key).sort();
        expect(liveRoutes(devServer)).toEqual(expected);
    });


    it('registers exactly the non-DEV routes outside development (20)', () => {
        const expected = fixture.filter(e => !e.dev).map(e => e.key).sort();
        expect(liveRoutes(prodServer)).toEqual(expected);
    });


    it('registers exactly 23 routes in development and 20 outside it', () => {
        expect(liveRoutes(devServer)).toHaveLength(23);
        expect(liveRoutes(prodServer)).toHaveLength(20);
        expect(fixture).toHaveLength(23);
        expect(fixture.filter(e => e.dev)).toHaveLength(3);
    });


    it('exposes no duplicate (method, path) pairs', () => {
        for (const server of [devServer, prodServer]) {
            const pairs = liveRoutes(server);
            expect(new Set(pairs).size).toBe(pairs.length);
        }
    });


    it('loads no controller class from controllers/ to serve them', () => {
        const loaded = Object.keys(require.cache);
        // The check can see the server's own CommonJS dependencies...
        expect(loaded).toContain(require.resolve('../../src/ws/webSocketServer'));
        // ...and none of the old controllers is among them.
        expect(loaded.filter(file => file.startsWith(CONTROLLERS_DIR))).toEqual([]);
    });


    it('matches the route-table artifact once paths are OpenAPI-normalised', () => {
        // The artifact writes `{param}` where Express registers `:param`.
        // Asserting the two agree makes the artifact itself a gate rather
        // than a stale text file.
        const normalised = liveRoutes(devServer)
            .map(row => row.replace(/:(\w+)/g, '{$1}'))
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
