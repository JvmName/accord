/**
 * The LIVE route table of the running application while the legacy
 * controllers and the typed route registry serve the API together.
 *
 * Reads the Express router stack of a real `ApplicationServer` after
 * `registerControllers()` and asserts that:
 *   - no (method, path) is registered twice, by either system;
 *   - the full live table equals the baseline (the non-DEV routes);
 *   - every route that replaces a controller in `PORTED_CONTROLLERS` is served by
 *     the registry and every other route by a legacy controller;
 *   - the registry-served table is exactly the baseline's rows for the ported
 *     controllers.
 * It also checks that the ported routes and the Sequelize models use the same
 * database file.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { createDb, migrateDb, type Db } from '../../src/db';
import { portedRoutes, ROUTES_BY_LEGACY_CONTROLLER } from '../../src/http/mountPorted';

/* eslint-disable @typescript-eslint/no-require-imports */
const Http = require('../helpers/httpServer');
// Before anything opens a database connection.
const databaseFile: string = Http.useTemporaryDatabase('accord-live-routes');
const { ApplicationServer } = require('../../lib/server/applicationServer');
/* eslint-enable @typescript-eslint/no-require-imports */

const FIXTURE = path.join(__dirname, '..', 'characterization', 'fixtures', 'routeTable.txt');

interface LiveRoute { key: string; servedBy: 'registry' | 'legacy'; owner: string }

/** Every (method, path) the Express app answers, in stack order, with who serves it. */
function liveRoutes(app: { router: { stack: any[] } }): LiveRoute[] {
    const rows: LiveRoute[] = [];
    for (const layer of app.router.stack) {
        if (!layer.route) continue;
        const handlers = layer.route.stack.map((l: { handle: { name: string } }) => l.handle.name);
        // The registry's chain always starts with its request-state resolver.
        const servedBy = handlers[0] === 'resolveState' ? 'registry' : 'legacy';
        for (const method of Object.keys(layer.route.methods)) {
            rows.push({ key: `${method.toUpperCase()} ${layer.route.path}`, servedBy, owner: handlers.join(',') });
        }
    }
    return rows;
}

function baseline(): Array<{ key: string; owner: string; dev: boolean }> {
    return fs.readFileSync(FIXTURE, 'utf8')
        .split('\n')
        .map(l => l.trimEnd())
        .filter(l => l && !l.startsWith('#'))
        .map(l => {
            const [key, owner, flag] = l.split('\t');
            return { key, owner, dev: flag === 'DEV' };
        });
}

/** `MatsController#getMat` -> the PORTED_CONTROLLERS key of the class that owned the row. */
function controllerKeyOf(owner: string, routeKey: string): string {
    const cls = owner.split('#')[0];
    // The two UsersControllers are told apart by their paths.
    if (cls === 'UsersController') return routeKey.startsWith('POST /users') ? 'UsersController' : 'mat/UsersController';
    // The round and riding-time controllers live in controllers/match/.
    if (cls === 'RoundsController' || cls === 'RidingTimeVoteController') return `match/${cls}`;
    return cls;
}

describe('live route table (legacy controllers + typed registry)', () => {
    let db: Db;
    let server: any;
    let live: LiveRoute[];

    beforeAll(() => {
        db = createDb({ path: ':memory:' });
        migrateDb(db);
        server = new ApplicationServer({ db });
        server.registerControllers();
        live = liveRoutes(server.expressApp);
    });

    afterAll(() => db.$client.close());

    it('lists at least one ported controller, each with a route group', () => {
        expect(server.portedControllers.length).toBeGreaterThan(0);
        for (const key of server.portedControllers) expect(Object.keys(ROUTES_BY_LEGACY_CONTROLLER)).toContain(key);
    });

    it('serves no (method, path) from two places', () => {
        const keys = live.map(r => r.key);
        const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
        expect(duplicates).toEqual([]);
    });

    it('serves exactly the baseline routes (the non-DEV ones outside development)', () => {
        const expected = baseline().filter(r => !r.dev).map(r => r.key).sort();
        expect(live.map(r => r.key).sort()).toEqual(expected);
    });

    it('serves each ported controller\'s routes from the registry and every other route from a legacy controller', () => {
        const ported = new Set<string>(server.portedControllers);
        const expected = baseline()
            .filter(r => !r.dev)
            .map(r => ({ key: r.key, servedBy: ported.has(controllerKeyOf(r.owner, r.key)) ? 'registry' as const : 'legacy' as const }))
            .sort((a, b) => a.key.localeCompare(b.key));
        const actual = live.map(r => ({ key: r.key, servedBy: r.servedBy })).sort((a, b) => a.key.localeCompare(b.key));
        expect(actual).toEqual(expected);
    });

    it('registry-served routes are exactly the baseline rows of the ported controllers', () => {
        const ported = new Set<string>(server.portedControllers);
        const expected = baseline()
            .filter(r => ported.has(controllerKeyOf(r.owner, r.key)))
            .map(r => r.key)
            .sort();
        expect(live.filter(r => r.servedBy === 'registry').map(r => r.key).sort()).toEqual(expected);
        expect(portedRoutes(server.portedControllers).map(r => `${r.method.toUpperCase()} ${r.path}`).sort()).toEqual(expected);
    });

    it('gives every registry route its own error handler as the last handler', () => {
        for (const layer of server.expressApp.router.stack) {
            if (!layer.route || layer.route.stack[0].handle.name !== 'resolveState') continue;
            const last = layer.route.stack[layer.route.stack.length - 1].handle;
            expect({ path: layer.route.path, name: last.name, arity: last.length })
                .toEqual({ path: layer.route.path, name: 'routeErrorHandler', arity: 4 });
        }
    });
});

describe('one database file for both stacks', () => {
    let booted: any;

    beforeAll(async () => {
        await Http.migrate();
        booted = await Http.startServer();
    }, 30000);

    afterAll(() => booted?.server.close());

    it('opens the Drizzle database lazily, at the same path Sequelize uses', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Connection } = require('../../lib/activeRecord/db/connection');
        const request = Http.makeClient(booted.origin);

        const created = await request('POST', '/users', { body: { name: 'same file' } });
        expect(created.status).toBe(200);

        expect(booted.server.db.$client.filename).toBe(databaseFile);
        expect(new Connection().sequelizeOptions.storage).toBe(databaseFile);

        // A row the registry wrote is visible to the legacy models, and the reverse.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { User } = require('../../models/user');
        const legacyView = await User.findByApiToken(created.body.data.api_token);
        expect(legacyView?.id).toBe(created.body.data.user.id);

        const legacyUser = await User.create({ name: 'from sequelize' });
        const viaRegistry = await request('POST', '/mats', { token: legacyUser.api_token, body: { name: 'Mat' } });
        expect(viaRegistry.status).toBe(200);
        expect(viaRegistry.body.data.mat.creator_id).toBe(legacyUser.id);
    });
});
