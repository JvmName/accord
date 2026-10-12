const { afterAll, beforeAll, describe, expect, it, setSystemTime } = require('bun:test');
/**
 * GOLDEN EQUIVALENCE (server-ts task 11): the new mappers, fed by Drizzle reads,
 * reproduce every captured HTTP/WS payload that renders a User, Mat, Match or
 * Round, field for field, absent-vs-null included.
 *
 * How: this file REPLAYS the task-04 capture plan against the real legacy
 * server, on a temp DB created by the LEGACY migrations and seeded through
 * `test/contract/seed.ts` (exactly as `contract.test.js` does), with the clock
 * frozen at the capture instant (`NOW`). The plan order is read from
 * `capture.ts` itself and each request is rebuilt from its golden. Right
 * after each response, the same rows are read back through the task-10
 * repositories (Drizzle, a second connection to the same file) and rendered
 * by `src/serialize` with the route's legacy render options. The result is
 * normalised with a copy of the capture normaliser and compared,
 * byte-for-byte as canonical JSON, to the committed golden. Legacy writes
 * every mutation; the mappers only ever see the resulting rows.
 *
 * The WebSocket goldens are replayed the same way by running the four real
 * workers' `performJob()` in capture order, with `notifyServer` captured
 * instead of emitted, and rendering with the F-22 `serializeLeaked*` mappers.
 *
 * The Sequelize stack is never pointed at a Drizzle-baseline DB (F-47); no
 * real sqlite file is touched (`DATABASE_PATH` is a temp file).
 */
const fs   = require('fs');
const path = require('path');
const Http = require('../helpers/httpServer');

// Must happen before any model module opens a connection.
const previousDatabasePath = process.env.DATABASE_PATH;
const file = Http.useTemporaryDatabase('accord-serialize-golden');

const { createDb }  = require('../../src/db');
const Users         = require('../../src/db/repositories/users');
const Mats          = require('../../src/db/repositories/mats');
const Matches       = require('../../src/db/repositories/matches');
const S             = require('../../src/serialize');
const { routeResponses, socketPayloads } = require('../../src/contract');
const N             = require('./goldenNormalize');

const GOLDENS_DIR = path.join(__dirname, '../contract/goldens');
const CAPTURE_TS  = path.join(__dirname, '../contract/capture.ts');

const readGolden = (name) => JSON.parse(fs.readFileSync(path.join(GOLDENS_DIR, `${name}.json`), 'utf8'));

/** Every `await http('<name>', ...)` in capture.ts, in plan order. */
function capturePlanOrder() {
    const src = fs.readFileSync(CAPTURE_TS, 'utf8');
    return [...src.matchAll(/await http\('([^']+)'/g)].map((m) => m[1]);
}

/** Throws if any value in the tree is `undefined` (res.json would silently drop the key). */
function assertNoUndefined(value, at = '$') {
    if (value === undefined) throw new Error(`undefined value at ${at}`);
    if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) assertNoUndefined(v, `${at}.${k}`);
    }
}

let db;
let seedModule;
let server;
let statics;
let NOW;
const results = { http: [], ws: [] };

async function matchGraph(id) {
    const graph = await Matches.findMatchGraph(db, id);
    if (!graph) throw new Error(`no match ${id}`);
    return graph;
}

async function matGraph(id) {
    const graph = await Mats.findMatGraph(db, id);
    if (!graph) throw new Error(`no mat ${id}`);
    return graph;
}

/**
 * The route's success payload, rendered by the NEW mappers from Drizzle rows.
 * `live` is the legacy response body; only entity ids are taken from it (and
 * the mat code from the request path). Render options are the controllers'.
 */
const MATCH_ALL   = { includeMat: true, includeMatchJudges: true, includeRounds: true };
const MATCH_ROUND = { includeMat: true, includeRounds: true }; // `includeJudges` is not an option
const RENDERERS = {
    'POST /users': async (live) => {
        const user = await Users.findUserById(db, live.data.user.id);
        return { user: S.serializeUser(user), api_token: user.api_token };
    },
    'POST /mats': async (live) => {
        const g = await matGraph(live.data.mat.id);
        return { mat: S.serializeMat(g, { codes: g.matCodes, judges: g.judges, now: NOW }) };
    },
    'GET /mat/{matId}': async (live) => {
        const g = await matGraph(live.data.mat.id);
        const graphs = await Matches.findMatchGraphsByIds(db, g.incompleteMatches.map((m) => m.id));
        const incompleteMatches = g.incompleteMatches.map((m) => graphs.get(m.id));
        return { mat: S.serializeMat(g, { judges: g.judges, incompleteMatches, now: NOW }) };
    },
    'POST /mat/{matCode}/join': async (live) => {
        const g    = await matGraph(live.data.mat.id);
        const user = await Users.findUserById(db, live.data.user.id);
        return { mat: S.serializeMat(g, { judges: g.judges, now: NOW }), user: S.serializeUser(user), api_token: user.api_token };
    },
    'DELETE /mat/{matCode}/join': async (live) => {
        const g = await matGraph(live.data.mat.id);
        return { mat: S.serializeMat(g, { judges: g.judges, now: NOW }) };
    },
    'GET /mat/{matCode}/judges': async (_live, code) => {
        const mat = await Mats.findMatByCode(db, code);
        return { judges: S.serializeUsers(await Mats.findMatJudges(db, mat.id)) };
    },
    'GET /mat/{matCode}/viewers': async (_live, code) => {
        const mat = await Mats.findMatByCode(db, code);
        return { viewers: S.serializeUsers(await Mats.findMatViewers(db, mat.id)) };
    },
    'POST /mat/{matCode}/matches': async (live) =>
        ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { includeMat: true, now: NOW }) }),
    'GET /match/{matchId}':                async (live) => ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { ...MATCH_ALL, now: NOW }) }),
    'POST /match/{matchId}/start':         async (live) => ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { ...MATCH_ALL, now: NOW }) }),
    'POST /match/{matchId}/end':           async (live) => ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { ...MATCH_ALL, now: NOW }) }),
    'POST /match/{matchId}/rounds':        async (live) => ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { ...MATCH_ROUND, now: NOW }) }),
    'POST /match/{matchId}/rounds/end':    async (live) => ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { ...MATCH_ROUND, now: NOW }) }),
    'PATCH /match/{matchId}/rounds/result': async (live) => ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { ...MATCH_ROUND, now: NOW }) }),
    'POST /match/{matchId}/rounds/pause':  async (live) => ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { ...MATCH_ROUND, now: NOW }) }),
    'POST /match/{matchId}/rounds/resume': async (live) => ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { ...MATCH_ROUND, now: NOW }) }),
    'POST /match/{matchId}/ridingTime':    async (live) => ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { ...MATCH_ROUND, now: NOW }) }),
    'DELETE /match/{matchId}/ridingTime':  async (live) => ({ match: S.serializeMatch(await matchGraph(live.data.match.id), { ...MATCH_ROUND, now: NOW }) }),
};

/** Normalises `body` exactly as capture.ts's `http()` does (path, request body, then response, one allocator). */
function normalizeHttp(routePath, requestBody, body) {
    const dyn = new N.DynamicNames();
    N.replaceInPath(routePath, statics, dyn);
    if (requestBody !== undefined) N.normalizeValue(requestBody, statics, dyn);
    return N.normalizeValue(body, statics, dyn);
}

const canonical = (v) => JSON.stringify(v);

async function replayHttp(origin) {
    const { IDS, CODES } = seedModule;
    for (const name of capturePlanOrder()) {
        const golden = readGolden(name);
        const { method, as } = golden.request;
        const routePath   = N.denormalizePath(golden.request.path, IDS, CODES);
        const requestBody = golden.request.body === null ? undefined : N.denormalizeValue(golden.request.body, IDS, CODES);

        const headers = {};
        if (as) headers['x-api-token'] = IDS[`token:${as}`];
        if (requestBody !== undefined) headers['content-type'] = 'application/json';
        const res  = await fetch(`${origin}${routePath}`, { method, headers, body: requestBody === undefined ? undefined : JSON.stringify(requestBody) });
        const text = await res.text();
        let live; // exactly as capture.ts parses
        try { live = text === '' ? null : JSON.parse(text); } catch { live = { '<non-json-text>': text.length }; }

        const entry = {
            name,
            route:       golden.route,
            status:      res.status,
            goldenStatus: golden.response.status,
            // Replay fidelity: legacy's live body, normalised by the copied normaliser, IS the golden.
            liveMatchesGolden: canonical(normalizeHttp(routePath, requestBody, live)) === canonical(golden.response.body),
            rendered: null,
        };

        const render = RENDERERS[golden.route];
        if (render && res.status === 200) {
            const code = routePath.split('/')[2];
            const data = await render(live, code);
            assertNoUndefined(data);
            const envelope = { data, status: 'ok' };
            const schema   = routeResponses[golden.route].safeParse(envelope);
            entry.rendered = {
                schemaOk:  schema.success,
                schemaErr: schema.success ? null : schema.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
                actual:    canonical(normalizeHttp(routePath, requestBody, JSON.parse(JSON.stringify(envelope)))),
                expected:  canonical(golden.response.body),
            };
        }
        results.http.push(entry);
    }
}

async function replayWebSocket(port) {
    const { IDS } = seedModule;
    const { MatchUpdateWorker }     = require('../../lib/workerQueue/matchUpdateWorker');
    const { TechFallTrackerWorker } = require('../../lib/workerQueue/techFallTrackerWorker');
    const { BreakTransitionWorker } = require('../../lib/workerQueue/breakTransitionWorker');

    // capture.ts's observe() order, one fresh worker each. notifyServer is
    // captured instead of emitted; socket.io JSON-encodes, hence the round trip.
    const plan = [
        ['ws.match.update.openRound', 'match:open',         MatchUpdateWorker,     'match.update',    MATCH_ALL],
        ['ws.match.update.inBreak',   'match:break',        MatchUpdateWorker,     'match.update',    MATCH_ALL],
        ['ws.round.techFall',         'match:wsTechFall',   TechFallTrackerWorker, 'round.tech-fall', { includeRounds: true }],
        ['ws.break.ended',            'match:wsBreakEnded', BreakTransitionWorker, 'break.ended',     MATCH_ALL],
    ];
    for (const [name, key, WorkerCls, event, options] of plan) {
        const matchId = IDS[key];
        const emitted = [];
        const worker  = new WorkerCls('contract-capture-worker', { port, host: '127.0.0.1' });
        worker.notifyServer = (ev, payload) => emitted.push({ event: ev, payload: JSON.parse(JSON.stringify(payload)) });
        await worker.performJob();
        worker.close();

        const golden = readGolden(name);
        const legacyEvent = emitted.find((e) => e.event === event && e.payload && e.payload.id === matchId);

        const normalizeWs = (payload) => {
            const dyn = new N.DynamicNames();
            N.replaceString(matchId, statics, dyn);
            return N.normalizeValue(payload, statics, dyn);
        };

        const payload = S.serializeLeakedMatch(await matchGraph(matchId), { ...options, now: NOW });
        assertNoUndefined(payload);
        const schema = socketPayloads[event].safeParse(payload);
        results.ws.push({
            name,
            legacyEmitted:     Boolean(legacyEvent),
            liveMatchesGolden: Boolean(legacyEvent) && canonical(normalizeWs(legacyEvent.payload)) === canonical(golden.payload),
            schemaOk:          schema.success,
            actual:            canonical(normalizeWs(JSON.parse(JSON.stringify(payload)))),
            expected:          canonical(golden.payload),
        });
    }
}

beforeAll(async () => {
    await Http.migrate();
    seedModule = require('../contract/seed.ts');
    statics    = N.buildStaticNames(seedModule.IDS, seedModule.CODES);
    NOW        = new Date(seedModule.NOW);
    await seedModule.seed({ set: (ms) => setSystemTime(new Date(ms)) }); // leaves the clock frozen at NOW
    db = createDb({ path: file });

    const started = await Http.startServer();
    server = started.server;
    await replayHttp(started.origin);
    await replayWebSocket(started.port);
}, 120000);

afterAll(() => {
    setSystemTime();
    if (server) server.close();
    if (db) db.$client.close();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
});

describe('GOLDEN EQUIVALENCE: src/serialize over Drizzle rows == the committed goldens', () => {
    it('replays the WHOLE capture plan (every http.* golden on disk, in capture order)', () => {
        const onDisk = fs.readdirSync(GOLDENS_DIR).filter((f) => f.startsWith('http.')).map((f) => f.replace(/\.json$/, '')).sort();
        expect(results.http.map((r) => r.name).sort()).toEqual(onDisk);
    });

    it('the replay is faithful: legacy answers every request exactly as captured (status and normalised body)', () => {
        const drift = results.http.filter((r) => r.status !== r.goldenStatus || !r.liveMatchesGolden).map((r) => r.name);
        expect(drift).toEqual([]);
    });

    it('covers every success golden that renders a User / Mat / Match / Round (non-vacuity)', () => {
        const rendered = results.http.filter((r) => r.rendered).map((r) => r.name).sort();
        const entitySuccess = results.http
            .filter((r) => r.goldenStatus === 200 && !['GET /', 'GET /system/healthCheck'].includes(r.route))
            .map((r) => r.name).sort();
        expect(rendered).toEqual(entitySuccess);
        expect(rendered.length).toBe(37);
    });

    it('every rendered payload parses through its route envelope schema', () => {
        const bad = results.http.filter((r) => r.rendered && !r.rendered.schemaOk).map((r) => ({ name: r.name, issues: r.rendered.schemaErr }));
        expect(bad).toEqual([]);
    });

    it('every rendered payload equals its golden byte-for-byte (canonical JSON, absent vs null included)', () => {
        const mismatched = results.http
            .filter((r) => r.rendered && r.rendered.actual !== r.rendered.expected)
            .map((r) => ({ name: r.name, actual: JSON.parse(r.rendered.actual), expected: JSON.parse(r.rendered.expected) }));
        expect(mismatched).toEqual([]);
    });

    it('WebSocket: the legacy workers emitted what was captured, and serializeLeakedMatch reproduces all four ws.* goldens', () => {
        expect(results.ws.map((r) => r.name)).toEqual(['ws.match.update.openRound', 'ws.match.update.inBreak', 'ws.round.techFall', 'ws.break.ended']);
        for (const r of results.ws) {
            expect({ name: r.name, emitted: r.legacyEmitted, live: r.liveMatchesGolden, schema: r.schemaOk })
                .toEqual({ name: r.name, emitted: true, live: true, schema: true });
            expect({ name: r.name, payload: JSON.parse(r.actual) }).toEqual({ name: r.name, payload: JSON.parse(r.expected) });
            expect(r.actual).toBe(r.expected);
        }
    });
});
