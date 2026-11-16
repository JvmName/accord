import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
/**
 * The web process and the worker jobs load no ORM models, controllers or old
 * worker / socket modules. Checked on the require cache after booting
 * the server, connecting a client socket, and running one tick of every job
 * against a real (Drizzle-baseline) database. This file runs in its own module
 * registry (`--isolate`), so the cache holds only what happened here.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as Http from '../helpers/httpServer';

const previousDatabasePath = process.env.DATABASE_PATH;
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'accord-worker-modules-')), 'database.sqlite');
process.env.DATABASE_PATH = file;

const ROOT = path.resolve(__dirname, '../..');
const FORBIDDEN = [
    /^models\//,
    /^controllers\//,
    /^lib\/workerQueue\//,
    /^lib\/server\/(abstractWebSocket|webSocket|webSocketServer|workerWebSocket|authorizer)\.js$/,
];

let server;
let workers;

beforeAll(async () => {
    const { createDb, migrateDb } = require('../../src/db');
    const db = createDb({ path: file });
    migrateDb(db);
    db.$client.close();

    const started = await Http.startServer({ serverOptions: { workerToken: 'modules-test' } });
    server = started.server;

    const { io } = require('socket.io-client');
    // The database has no users, so the handshake is refused; that still runs the client path of the tier.
    const client = io(started.origin, { auth: { apiToken: 'whatever' }, transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise((resolve) => client.on('connect_error', resolve));
    client.close();

    const W = require('../../src/workers');
    workers = [W.TechFallTrackerWorker, W.MatchUpdateWorker, W.BreakTransitionWorker, W.RoundTimerWorker]
        .map((Cls) => new Cls('modules-test', { port: started.port, host: '127.0.0.1' }));
    for (const worker of workers) await worker.performJob();
}, 30000);

afterAll(() => {
    for (const worker of workers || []) worker.close();
    if (server) server.close();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
});

const loaded = () => Object.keys(require.cache)
    .filter((f) => f.startsWith(ROOT + path.sep) && !f.includes(`${path.sep}node_modules${path.sep}`))
    .map((f) => path.relative(ROOT, f));

describe('module boundaries of the web and worker processes', () => {
    it('loads the new socket tier and workers', () => {
        expect(loaded()).toEqual(expect.arrayContaining([
            'src/ws/webSocketServer.ts', 'src/ws/webSocket.ts', 'src/ws/workerWebSocket.ts', 'src/ws/abstractWebSocket.ts',
            'src/workers/worker.ts', 'src/workers/matchUpdateWorker.ts', 'src/workers/techFallTrackerWorker.ts',
            'src/workers/roundTimerWorker.ts', 'src/workers/breakTransitionWorker.ts',
        ]));
    });

    it('loads nothing from models/, controllers/, lib/workerQueue or the legacy socket modules', () => {
        expect(loaded().filter((f) => FORBIDDEN.some((re) => re.test(f)))).toEqual([]);
    });

    it('would notice if it did (control)', () => {
        // the cache is observable: a module required now shows up
        const probe = 'src/contract/openapi.ts';
        expect(loaded()).not.toContain(probe);
        require('../../src/contract/openapi');
        expect(loaded()).toContain(probe);
        // and the patterns catch every kind of forbidden path
        const sample = ['models/match.js', 'controllers/matsController.js', 'lib/workerQueue/worker.js', 'lib/server/webSocket.js',
            'lib/server/authorizer.js', 'src/ws/webSocket.ts', 'lib/logger.ts'];
        expect(sample.filter((f) => FORBIDDEN.some((re) => re.test(f))))
            .toEqual(['models/match.js', 'controllers/matsController.js', 'lib/workerQueue/worker.js', 'lib/server/webSocket.js', 'lib/server/authorizer.js']);
    });
});
