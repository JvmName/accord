/**
 * The Socket.IO client scripts behind test/ws/webSocketTier.test.js and the
 * `webSocketTier` snapshot fixture. Not a test file.
 *
 * A tier is a WebSocketServer listening on its own http.Server. Each client
 * script connects with some handshake `auth` / `query`, emits its events, and
 * then a worker socket broadcasts into the match room; what the client saw
 * (connected or not, the connect_error message, the broadcasts that reached
 * it) is its transcript. Handler calls that throw (a socket triggering them
 * would end the web process with an unhandled rejection) are called directly.
 *
 * Users and the match have fixed ids and tokens; transcripts name them
 * (`<user:creator>`, `the match`) instead of printing ids.
 */
const http = require('http');
const { freePort } = require('../helpers/httpServer');

const X = (suffix) => `00000000-0000-4000-9000-${suffix.padStart(12, '0')}`;
const STAMP = '2026-01-01T12:00:00.000Z';

const IDS = {
    creator: X('c0'), other: X('c1'), red: X('d0'), blue: X('d1'),
    mat: X('e0'), match: X('f0'),
    creatorToken: X('a1c0'), otherToken: X('a1c1'), redToken: X('a1d0'), blueToken: X('a1d1'),
};
const tokens = { creator: IDS.creatorToken, other: IDS.otherToken };
const matchId = IDS.match;
const room = `match:${matchId}`;

const NAMES = new Map([[IDS.creator, '<user:creator>'], [IDS.other, '<user:other>'], [IDS.red, '<user:red>'], [IDS.blue, '<user:blue>'], [IDS.match, 'the match']]);
const nameOf = (id) => (id == null ? id : NAMES.get(id) ?? id);

/** Rows for a raw bun:sqlite handle (`insertRaw(table, rows)`). */
function seedRows(insertRaw) {
    const stamps = { created_at: STAMP, updated_at: STAMP };
    insertRaw('users', [
        { id: IDS.creator, name: 'creator', api_token: IDS.creatorToken, ...stamps },
        { id: IDS.other,   name: 'other',   api_token: IDS.otherToken,   ...stamps },
        { id: IDS.red,     name: 'red',     api_token: IDS.redToken,     ...stamps },
        { id: IDS.blue,    name: 'blue',    api_token: IDS.blueToken,    ...stamps },
    ]);
    insertRaw('mats', [{ id: IDS.mat, name: 'mat', judge_count: 1, creator_id: IDS.creator, ...stamps }]);
    insertRaw('matches', [{
        id: IDS.match, mat_id: IDS.mat, creator_id: IDS.creator, red_competitor_id: IDS.red, blue_competitor_id: IDS.blue,
        red_score: 0, blue_score: 0, started_at: null, ended_at: null, break_started_at: null, break_duration: null, ...stamps,
    }]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(WebSocketServer, extraArgs) {
    const httpServer = http.createServer();
    const port = await freePort();
    const wss = new WebSocketServer(httpServer, ['http://localhost:8080'], ...extraArgs);
    wss.listen();
    await new Promise((resolve) => httpServer.listen(port, '127.0.0.1', resolve));
    return { httpServer, wss, origin: `http://127.0.0.1:${port}`, close() { wss.close(); httpServer.close(); } };
}

/** One client script: connect with `auth`/`query`, emit `actions`, then a fake worker broadcasts into the match room. */
async function observe(origin, { auth, query, actions = [] }) {
    const { io } = require('socket.io-client'); // eslint-disable-line global-require
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

const SCRIPTS = [
    ['a judge joins the match', { auth: { apiToken: tokens.creator }, actions: [['match.join', matchId]] }],
    ['any user may view (join) any match', { auth: { apiToken: tokens.other }, actions: [['match.join', matchId]] }],
    ['connected but not joined', { auth: { apiToken: tokens.creator } }],
    ['join then leave', { auth: { apiToken: tokens.creator }, actions: [['match.join', matchId], ['match.leave', matchId]] }],
    ['join an unknown match', { auth: { apiToken: tokens.creator }, actions: [['match.join', '00000000-0000-4000-8000-000000000000']] }],
    ['join with a number', { auth: { apiToken: tokens.creator }, actions: [['match.join', 5]] }],
    ['join with nothing', { auth: { apiToken: tokens.creator }, actions: [['match.join', undefined]] }],
    ['join with null', { auth: { apiToken: tokens.creator }, actions: [['match.join', null]] }],
    ['room.join by name, no authorization', { auth: { apiToken: tokens.creator }, actions: [['room.join', room]] }],
    ['room.join then room.leave', { auth: { apiToken: tokens.creator }, actions: [['room.join', room], ['room.leave', room]] }],
    ['unknown token still connects; room.join works', { auth: { apiToken: 'not-a-token' }, actions: [['room.join', room]] }],
    ['unknown token, connected only', { auth: { apiToken: 'not-a-token' } }],
    ['no token: connects, has no handlers', { actions: [['room.join', room], ['match.join', matchId]] }],
    ['empty-string token is no token', { auth: { apiToken: '' }, actions: [['room.join', room]] }],
    ['array token [token]', { auth: { apiToken: [tokens.creator] }, actions: [['match.join', matchId]] }],
    ['array token [junk, token]', { auth: { apiToken: ['x', tokens.other] }, actions: [['match.join', matchId]] }],
    ['array token [] (truthy, matches nobody)', { auth: { apiToken: [] }, actions: [['room.join', room]] }],
    ['object token: connect_error', { auth: { apiToken: {} }, actions: [['room.join', room]] }],
    ['object token with keys: connect_error', { auth: { apiToken: { $ne: 'x' } } }],
    ['array holding an object: connect_error', { auth: { apiToken: [{}] } }],
    ['true token: connects with no user', { auth: { apiToken: true }, actions: [['room.join', room]] }],
    ['client token AND worker token: treated as a client', { auth: { apiToken: tokens.creator }, query: { workerToken: 'w' }, actions: [['match.join', matchId]] }],
    ['worker socket: no match.join handler', { query: { workerToken: 'w' }, actions: [['match.join', matchId]] }],
    ['worker socket: room.join works', { query: { workerToken: 'w' }, actions: [['room.join', room]] }],
    ['a client relaying a worker event reaches nobody', { auth: { apiToken: tokens.creator }, actions: [['match.join', matchId], ['match.update', { id: matchId, forged: true }]] }],
];

const HANDLER_CASES = [
    ['unknown token, existing match', 'not-a-token', matchId],
    ['valid token, true',             tokens.creator, true],
    ['valid token, object',           tokens.creator, {}],
    ['valid token, array',            tokens.creator, [1, 2]],
    ['valid token, empty array',      tokens.creator, []],
    ['valid token, existing match',   tokens.creator, matchId],
    ['valid token, unknown string',   tokens.creator, 'nope'],
];

const TOKEN_VALUES = [
    tokens.creator, tokens.other, 'nope', 5, 0, true, false, null, 1.5,
    [], [tokens.creator], [tokens.other, tokens.creator], [tokens.creator, tokens.other], ['x', tokens.other],
    [null], [5], [true], [[tokens.creator]], [tokens.creator, null],
    {}, { id: 1 }, { $ne: 'x' }, [{}], [tokens.creator, { a: 1 }],
];

const MATCH_VALUES = [matchId, 'nope', 5, 0, true, false, null, undefined, [], [matchId], {}, { id: matchId }];

/** Replaces the fixed ids in a JSON text with their names. */
const named = (text) => [...NAMES].reduce((t, [id, name]) => t.split(id).join(name), text);

/**
 * Every record for one tier. `tier` supplies `origin`, `WebSocket` (class),
 * `host` (for the handler calls), `findUser(value)` and `findMatch(value)`.
 */
async function recordTier(tier) {
    const records = [];
    for (const [name, script] of SCRIPTS) records.push({ key: `script ${name}`, ...(await observe(tier.origin, script)) });

    const fakeSocket = (apiToken) => ({
        adapter: { on() {}, eventNames: () => [], removeAllListeners() {}, rooms: new Map() },
        eventNames: () => [], removeAllListeners() {}, on() {}, join() {}, leave() {}, disconnect() {},
        id: 'socket', handshake: { auth: { apiToken }, query: {} },
    });
    for (const [name, token, arg] of HANDLER_CASES) {
        const socket = new tier.WebSocket(fakeSocket(token), tier.host);
        await socket.init();
        let outcome;
        try { await socket.handleMatchJoined(arg); outcome = { ok: true }; } catch (err) { outcome = { error: err.constructor.name, message: err.message }; }
        records.push({ key: `handler ${name}`, outcome });
    }

    const lookup = async (fn) => { try { const r = await fn(); return r ? nameOf(r.id) : r === undefined ? '(undefined)' : r; } catch (err) { return `throws: ${err.message}`; } };
    for (const value of TOKEN_VALUES) records.push({ key: `token ${named(JSON.stringify(value))}`, user: await lookup(() => tier.findUser(value)) });
    for (const value of MATCH_VALUES) records.push({ key: `match ${named(String(JSON.stringify(value)))}`, match: await lookup(() => tier.findMatch(value)) });
    return records;
}

/** The current tier (src/ws) on `db`. */
async function modernTier(db) {
    /* eslint-disable global-require */
    const { WebSocketServer } = require('../../src/ws/webSocketServer');
    const WS = require('../../src/ws/webSocket');
    /* eslint-enable global-require */
    const server = await boot(WebSocketServer, [db]);
    return {
        ...server,
        WebSocket: WS.WebSocket,
        host: { emit() {}, db },
        findUser: (value) => WS.findUserForToken(db, value),
        findMatch: (value) => WS.findMatchForId(db, value),
    };
}

module.exports = { HANDLER_CASES, IDS, MATCH_VALUES, SCRIPTS, TOKEN_VALUES, boot, modernTier, recordTier, seedRows, tokens };
