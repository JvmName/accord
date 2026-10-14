const { afterAll, beforeAll, describe, expect, it } = require('bun:test');
/**
 * DIFFERENTIAL: the Socket.IO tier in src/ws against the legacy one in
 * lib/server, over real sockets. Both servers run side by side on their own
 * http.Server and read the same legacy-migrated scratch database (the legacy
 * tier through the models, the new one through Drizzle); neither writes.
 *
 * The same client scripts (handshake auth/query, then events) run against
 * both, and what each client observes must be identical: whether it
 * connected, the connect_error message, and which room broadcasts reached it.
 * Handler calls that throw (and so end the web process with an unhandled
 * rejection when a socket triggers them) are compared directly instead.
 */
const http = require('http');
const Http = require('../helpers/httpServer');

const previousDatabasePath = process.env.DATABASE_PATH;
const file = Http.useTemporaryDatabase('accord-ws-differential');

const { io } = require('socket.io-client');
const { createDb } = require('../../src/db');
const NewTier = {
    WebSocketServer: require('../../src/ws/webSocketServer').WebSocketServer,
    WebSocket:       require('../../src/ws/webSocket').WebSocket,
    ...require('../../src/ws/webSocket'),
};

let Legacy;
let db;
let servers;
let tokens;
let matchId;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(WebSocketServer, extraArgs) {
    const httpServer = http.createServer();
    const port = await Http.freePort();
    const wss = new WebSocketServer(httpServer, ['http://localhost:8080'], ...extraArgs);
    wss.listen();
    await new Promise((resolve) => httpServer.listen(port, '127.0.0.1', resolve));
    return { httpServer, wss, origin: `http://127.0.0.1:${port}` };
}

beforeAll(async () => {
    await Http.migrate();
    const { User }  = require('../../models/user');
    const { Mat }   = require('../../models/mat');
    const { Match } = require('../../models/match');
    Legacy = {
        User, Match,
        WebSocketServer: require('../../lib/server/webSocketServer').WebSocketServer,
        WebSocket:       require('../../lib/server/webSocket').WebSocket,
    };
    const creator = await User.create({ name: 'creator' });
    const other   = await User.create({ name: 'other' });
    const red     = await User.create({ name: 'red' });
    const blue    = await User.create({ name: 'blue' });
    const mat     = await Mat.create({ name: 'mat', judge_count: 1, creator_id: creator.id });
    const match   = await Match.create({ mat_id: mat.id, creator_id: creator.id, red_competitor_id: red.id, blue_competitor_id: blue.id });
    tokens  = { creator: creator.api_token, other: other.api_token };
    matchId = match.id;

    db = createDb({ path: file });
    servers = {
        legacy: await boot(Legacy.WebSocketServer, []),
        modern: await boot(NewTier.WebSocketServer, [db]),
    };
}, 30000);

afterAll(() => {
    for (const s of Object.values(servers || {})) {
        s.wss.close();
        s.httpServer.close();
    }
    if (db) db.$client.close();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
});

/** One client script: connect with `auth`/`query`, emit `actions`, then a fake worker broadcasts into the match room. */
async function observe(origin, { auth, query, actions = [] }) {
    const opts = { transports: ['websocket'], forceNew: true, reconnection: false };
    if (auth !== undefined) opts.auth = auth;
    if (query !== undefined) opts.query = query;
    const client = io(origin, opts);
    const seen = { connected: false, connectError: null, received: [] };
    client.on('connect', () => { seen.connected = true; });
    client.on('connect_error', (err) => { seen.connectError = err.message; });
    for (const event of ['match.update', 'round.tech-fall', 'break.ended']) {
        client.on(event, (payload) => seen.received.push(`${event}:${payload?.id === matchId ? 'the match' : JSON.stringify(payload)}`));
    }
    await sleep(150);
    for (const [event, arg] of actions) {
        client.emit(event, arg);
        await sleep(80);
    }
    const worker = io(origin, { transports: ['websocket'], forceNew: true, reconnection: false, query: { workerToken: 'any' } });
    await sleep(120);
    for (const event of ['match.update', 'round.tech-fall', 'break.ended']) worker.emit(event, { id: matchId });
    await sleep(150);
    worker.close();
    client.close();
    return seen;
}

const room = () => `match:${matchId}`;

const SCRIPTS = () => [
    ['a judge joins the match', { auth: { apiToken: tokens.creator }, actions: [['match.join', matchId]] }],
    ['any user may view (join) any match', { auth: { apiToken: tokens.other }, actions: [['match.join', matchId]] }],
    ['connected but not joined', { auth: { apiToken: tokens.creator } }],
    ['join then leave', { auth: { apiToken: tokens.creator }, actions: [['match.join', matchId], ['match.leave', matchId]] }],
    ['join an unknown match', { auth: { apiToken: tokens.creator }, actions: [['match.join', '00000000-0000-4000-8000-000000000000']] }],
    ['join with a number', { auth: { apiToken: tokens.creator }, actions: [['match.join', 5]] }],
    ['join with nothing', { auth: { apiToken: tokens.creator }, actions: [['match.join', undefined]] }],
    ['join with null', { auth: { apiToken: tokens.creator }, actions: [['match.join', null]] }],
    ['room.join by name, no authorization', { auth: { apiToken: tokens.creator }, actions: [['room.join', room()]] }],
    ['room.join then room.leave', { auth: { apiToken: tokens.creator }, actions: [['room.join', room()], ['room.leave', room()]] }],
    ['unknown token still connects; room.join works', { auth: { apiToken: 'not-a-token' }, actions: [['room.join', room()]] }],
    ['unknown token, connected only', { auth: { apiToken: 'not-a-token' } }],
    ['no token: connects, has no handlers', { actions: [['room.join', room()], ['match.join', matchId]] }],
    ['empty-string token is no token', { auth: { apiToken: '' }, actions: [['room.join', room()]] }],
    ['array token [token]', { auth: { apiToken: [tokens.creator] }, actions: [['match.join', matchId]] }],
    ['array token [junk, token]', { auth: { apiToken: ['x', tokens.other] }, actions: [['match.join', matchId]] }],
    ['array token [] (truthy, matches nobody)', { auth: { apiToken: [] }, actions: [['room.join', room()]] }],
    ['object token: connect_error', { auth: { apiToken: {} }, actions: [['room.join', room()]] }],
    ['object token with keys: connect_error', { auth: { apiToken: { $ne: 'x' } } }],
    ['array holding an object: connect_error', { auth: { apiToken: [{}] } }],
    ['true token: connects with no user', { auth: { apiToken: true }, actions: [['room.join', room()]] }],
    ['client token AND worker token: treated as a client', { auth: { apiToken: tokens.creator }, query: { workerToken: 'w' }, actions: [['match.join', matchId]] }],
    ['worker socket: no match.join handler', { query: { workerToken: 'w' }, actions: [['match.join', matchId]] }],
    ['worker socket: room.join works', { query: { workerToken: 'w' }, actions: [['room.join', room()]] }],
    ['a client relaying a worker event reaches nobody', { auth: { apiToken: tokens.creator }, actions: [['match.join', matchId], ['match.update', { id: matchId, forged: true }]] }],
];

describe('DIFFERENTIAL: src/ws behaves exactly like lib/server/*WebSocket*', () => {
    it('every client script observes the same thing on both tiers', async () => {
        const rows = [];
        for (const [name, script] of SCRIPTS()) {
            const legacy = await observe(servers.legacy.origin, script);
            const modern = await observe(servers.modern.origin, script);
            rows.push({ name, legacy, modern });
        }
        expect(rows.map((r) => ({ name: r.name, seen: r.modern }))).toEqual(rows.map((r) => ({ name: r.name, seen: r.legacy })));

        // Not vacuous: the scripts reach every outcome.
        const byName = Object.fromEntries(rows.map((r) => [r.name, r.legacy]));
        expect(byName['a judge joins the match'].received).toEqual(['match.update:the match', 'round.tech-fall:the match', 'break.ended:the match']);
        expect(byName['connected but not joined'].received).toEqual([]);
        expect(byName['join then leave'].received).toEqual([]);
        expect(byName['unknown token still connects; room.join works'].received).toHaveLength(3);
        expect(byName['no token: connects, has no handlers']).toEqual({ connected: true, connectError: null, received: [] });
        expect(byName['object token: connect_error']).toEqual({ connected: false, connectError: 'Invalid value {}', received: [] });
        expect(byName['array token [junk, token]'].received).toHaveLength(3);
    }, 60000);

    it('handler calls that throw do so identically (each would be an unhandled rejection in the web process)', async () => {
        const fakeSocket = (apiToken) => ({
            adapter: { on() {}, eventNames: () => [], removeAllListeners() {}, rooms: new Map() },
            eventNames: () => [], removeAllListeners() {}, on() {}, join() {}, leave() {}, disconnect() {},
            id: 'socket', handshake: { auth: { apiToken }, query: {} },
        });
        const host = { emit() {}, db };
        const outcome = async (fn) => { try { await fn(); return { ok: true }; } catch (err) { return { error: err.constructor.name, message: err.message }; } };

        const cases = [
            ['unknown token, existing match', 'not-a-token', matchId],
            ['valid token, true',             tokens.creator, true],
            ['valid token, object',           tokens.creator, {}],
            ['valid token, array',            tokens.creator, [1, 2]],
            ['valid token, empty array',      tokens.creator, []],
            ['valid token, existing match',   tokens.creator, matchId],
            ['valid token, unknown string',   tokens.creator, 'nope'],
        ];
        const rows = [];
        for (const [name, token, arg] of cases) {
            const legacySocket = new Legacy.WebSocket(fakeSocket(token), host);
            const modernSocket = new NewTier.WebSocket(fakeSocket(token), host);
            await legacySocket.init();
            await modernSocket.init();
            rows.push({
                name,
                legacy: await outcome(() => legacySocket.handleMatchJoined(arg)),
                modern: await outcome(() => modernSocket.handleMatchJoined(arg)),
            });
        }
        expect(rows.map((r) => ({ name: r.name, outcome: r.modern }))).toEqual(rows.map((r) => ({ name: r.name, outcome: r.legacy })));
        expect(rows.filter((r) => !r.legacy.ok).map((r) => r.name)).toEqual([
            'unknown token, existing match', 'valid token, true', 'valid token, object', 'valid token, array', 'valid token, empty array',
        ]);
    });

    it('token lookups: findUserForToken answers like User.findByApiToken for every JSON type', async () => {
        const settle = async (fn) => { try { const u = await fn(); return u ? u.id : u; } catch (err) { return `throws: ${err.message}`; } };
        const values = [
            tokens.creator, tokens.other, 'nope', 5, 0, true, false, null, 1.5,
            [], [tokens.creator], [tokens.other, tokens.creator], [tokens.creator, tokens.other], ['x', tokens.other],
            [null], [5], [true], [[tokens.creator]], [tokens.creator, null],
            {}, { id: 1 }, { $ne: 'x' }, [{}], [tokens.creator, { a: 1 }],
        ];
        const rows = [];
        for (const value of values) {
            rows.push({
                value: JSON.stringify(value),
                legacy: await settle(() => Legacy.User.findByApiToken(value)),
                modern: await settle(() => NewTier.findUserForToken(db, value)),
            });
        }
        expect(rows.map((r) => ({ value: r.value, user: r.modern }))).toEqual(rows.map((r) => ({ value: r.value, user: r.legacy })));
    });

    it('match lookups: findMatchForId answers like Match.find for every JSON type', async () => {
        const settle = async (fn) => { try { const m = await fn(); return m ? m.id : m; } catch (err) { return `throws: ${err.message}`; } };
        const values = [matchId, 'nope', 5, 0, true, false, null, undefined, [], [matchId], {}, { id: matchId }];
        const rows = [];
        for (const value of values) {
            rows.push({
                value: String(JSON.stringify(value)),
                legacy: await settle(() => Legacy.Match.find(value)),
                modern: await settle(() => NewTier.findMatchForId(db, value)),
            });
        }
        expect(rows.map((r) => ({ value: r.value, match: r.modern }))).toEqual(rows.map((r) => ({ value: r.value, match: r.legacy })));
    });
});
