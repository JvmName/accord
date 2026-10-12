/**
 * The LIVE route table of the running application.
 *
 * Reads the Express router stack of a real `ApplicationServer` after its
 * routes are mounted and asserts that:
 *   - no (method, path) is registered twice;
 *   - the full live table equals the baseline (the non-DEV routes outside
 *     development, all of them in development);
 *   - every route is served by the route registry's chain, ending in its own
 *     error handler.
 * It also checks that the routes and the Sequelize models use the same
 * database file.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { createDb, migrateDb, type Db } from '../../src/db';

/* eslint-disable @typescript-eslint/no-require-imports */
const Http = require('../helpers/httpServer');
// Before anything opens a database connection.
const databaseFile: string = Http.useTemporaryDatabase('accord-live-routes');
const { ApplicationServer } = require('../../src/http/server');
/* eslint-enable @typescript-eslint/no-require-imports */

const FIXTURE = path.join(__dirname, '..', 'characterization', 'fixtures', 'routeTable.txt');

interface LiveRoute { key: string; handlers: string[] }

/** Every (method, path) the Express app answers, in stack order, with its handler names. */
function liveRoutes(app: { router: { stack: any[] } }): LiveRoute[] {
    const rows: LiveRoute[] = [];
    for (const layer of app.router.stack) {
        if (!layer.route) continue;
        const handlers = layer.route.stack.map((l: { handle: { name: string } }) => l.handle.name);
        for (const method of Object.keys(layer.route.methods)) {
            rows.push({ key: `${method.toUpperCase()} ${layer.route.path}`, handlers });
        }
    }
    return rows;
}

function baseline(): Array<{ key: string; dev: boolean }> {
    return fs.readFileSync(FIXTURE, 'utf8')
        .split('\n')
        .map(l => l.trimEnd())
        .filter(l => l && !l.startsWith('#'))
        .map(l => {
            const [key, , flag] = l.split('\t');
            return { key, dev: flag === 'DEV' };
        });
}

describe('live route table', () => {
    let db: Db;
    let live: LiveRoute[];
    let liveDev: LiveRoute[];

    beforeAll(() => {
        db = createDb({ path: ':memory:' });
        migrateDb(db);
        const server = new ApplicationServer({ db, dev: false });
        server.mountRoutes();
        live = liveRoutes(server.expressApp);
        const devServer = new ApplicationServer({ db, dev: true, openApiValidation: false });
        devServer.mountRoutes();
        liveDev = liveRoutes(devServer.expressApp);
    });

    afterAll(() => db.$client.close());

    it('serves no (method, path) twice', () => {
        for (const table of [live, liveDev]) {
            const keys = table.map(r => r.key);
            const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
            expect(duplicates).toEqual([]);
        }
    });

    it('serves exactly the baseline routes: the non-DEV ones outside development, all in development', () => {
        expect(live.map(r => r.key).sort()).toEqual(baseline().filter(r => !r.dev).map(r => r.key).sort());
        expect(liveDev.map(r => r.key).sort()).toEqual(baseline().map(r => r.key).sort());
    });

    it('serves every route through the registry chain, which ends in its own error handler', () => {
        for (const route of liveDev) {
            expect({ route: route.key, first: route.handlers[0], last: route.handlers[route.handlers.length - 1] })
                .toEqual({ route: route.key, first: 'resolveState', last: 'routeErrorHandler' });
        }
    });

    it('mounts the routes only once, however often it is asked', () => {
        const server = new ApplicationServer({ db, dev: false });
        server.mountRoutes();
        server.mountRoutes();
        expect(liveRoutes(server.expressApp)).toHaveLength(live.length);
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
