/**
 * The response envelope and error rendering of the route registry.
 *
 *   1. Unit: `statusText` and the `formatJSONBody` walk.
 *   2. GOLDENS: contract goldens whose bodies the registry itself produces
 *      (validation 400s, gate 401/404/400s) are replayed over HTTP against the
 *      registry and must match status, content type and body exactly. Goldens
 *      whose bodies come from a handler (422s, 500, success envelopes) are
 *      replayed with a stub handler returning that golden's payload, which
 *      proves the envelope/status machinery (e.g. the status-less 422).
 *   3. ERRORS: every error case in ./errorCases.ts, thrown from a route
 *      handler, must render the status and body of the `errorRendering`
 *      snapshot fixture, plus a REAL SQLite unique violation raised through
 *      Drizzle.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { insertMatCode } from '../../src/db/repositories/matCodes';
import { envelopeFor, formatJSONBody, statusText } from '../../src/http/envelope';
import {
    AuthorizationError as NewAuthorizationError,
    ValidationError as NewValidationError,
    uniqueViolationErrors,
} from '../../src/http/errors';
import { defineRoute } from '../../src/http/route';
import type { AnyRouteDefinition } from '../../src/http/types';
import { routeResponses } from '../../src/contract/responses';
import {
    createMatch,
    createStartedMatch,
    createWorld,
    startRegistryApp,
    type RegistryApp,
    type World,
} from './support/registryApp';

/* eslint-disable @typescript-eslint/no-require-imports */
import { ERROR_CASES } from './errorCases';
import * as F from '../support/frozen';
/* eslint-enable @typescript-eslint/no-require-imports */

const GOLDENS = path.join(__dirname, '..', 'contract', 'goldens');
const golden = (name: string) => JSON.parse(fs.readFileSync(path.join(GOLDENS, `${name}.json`), 'utf8'));

// ---------------------------------------------------------------------------
// 1. Unit
// ---------------------------------------------------------------------------

describe('envelope: statusText', () => {
    it('maps exactly 200/400/401/404/500 and nothing else', () => {
        expect([200, 400, 401, 404, 500].map(statusText)).toEqual(['ok', 'bad request', 'unauthorized', 'not found', 'server error']);
        for (const code of [201, 204, 403, 409, 422, 503]) expect(statusText(code)).toBeUndefined();
    });

    it('a 422 envelope serialises WITHOUT a status key', () => {
        expect(JSON.stringify(envelopeFor(422, { errors: { matchId: ['x'] } }))).toBe('{"data":{"errors":{"matchId":["x"]}}}');
    });
});

describe('envelope: the formatJSONBody walk', () => {
    it('renders undefined as null at the top level, in objects and in arrays', () => {
        expect(formatJSONBody(undefined)).toBeNull();
        expect(formatJSONBody({ a: undefined, b: { c: undefined } })).toEqual({ a: null, b: { c: null } });
        expect(formatJSONBody([1, undefined])).toEqual([1, null]);
    });

    it('renders Dates as ISO strings, anywhere', () => {
        const d = new Date('2026-01-02T03:04:05.678Z');
        expect(formatJSONBody(d)).toBe('2026-01-02T03:04:05.678Z');
        expect(formatJSONBody({ at: d, list: [d] })).toEqual({ at: '2026-01-02T03:04:05.678Z', list: ['2026-01-02T03:04:05.678Z'] });
    });

    it('passes primitives and null through, and mutates objects in place', () => {
        expect([null, 0, '', false, 'x', 5].map(formatJSONBody)).toEqual([null, 0, '', false, 'x', 5]);
        const body = { a: undefined as unknown };
        expect(formatJSONBody(body)).toBe(body);
        expect(body.a).toBeNull();
    });

    it('keeps an ABSENT key absent (only an undefined VALUE becomes null)', () => {
        expect(JSON.stringify(formatJSONBody({ id: 'm', judges: [] }))).toBe('{"id":"m","judges":[]}');
    });
});

// ---------------------------------------------------------------------------
// 2. Goldens over HTTP
// ---------------------------------------------------------------------------

let app: RegistryApp;

/** Stub handlers for goldens whose body is produced by a handler. */
const handlerGoldens: Record<string, { routeKey: string; handler: AnyRouteDefinition['handler'] }> = {};
function stubFromGolden(name: string, routeKey: string, handler: AnyRouteDefinition['handler']) {
    handlerGoldens[name] = { routeKey, handler };
}

stubFromGolden('http.healthCheck', 'GET /system/healthCheck', (async () => ({})) as AnyRouteDefinition['handler']);
stubFromGolden('http.root', 'GET /', (async () => 'Hello World v1.0.0-rc08') as AnyRouteDefinition['handler']);
stubFromGolden('http.rounds.pause.noActiveRound.422', 'POST /match/:matchId/rounds/pause',
    (async (ctx: any) => ctx.renderErrors({ matchId: ['No active round to pause'] }, 422)) as AnyRouteDefinition['handler']);
stubFromGolden('http.rounds.result.windowClosed.422', 'PATCH /match/:matchId/rounds/result',
    (async (ctx: any) => ctx.renderErrors({ matchId: ['Round result can only be set during the break or at match end'] }, 422)) as AnyRouteDefinition['handler']);
stubFromGolden('http.match.end.alreadyEnded.400', 'POST /match/:matchId/end',
    (async (ctx: any) => ctx.renderErrors({ matchId: ['this match has already ended'] })) as AnyRouteDefinition['handler']);
stubFromGolden('http.users.create.objectName.500', 'POST /users',
    // The handler is reached ONLY because the runtime schema lets an object
    // `name` through (presence check only); the insert then fails.
    (async (ctx: any) => {
        if (typeof ctx.body.name === 'object') throw new Error('string violation: name cannot be an array or an object');
        return {};
    }) as AnyRouteDefinition['handler']);
stubFromGolden('http.mat.join.unknownCode.404', 'POST /mat/:matCode/join',
    (async (ctx: any) => (ctx.currentMatCode ? {} : ctx.renderErrors({ matCode: ['not found'] }, 404))) as AnyRouteDefinition['handler']);
stubFromGolden('http.match.get.openRound', 'GET /match/:matchId',
    (async () => golden('http.match.get.openRound').response.body.data) as AnyRouteDefinition['handler']);

beforeAll(async () => {
    app = await startRegistryApp({
        handlers: Object.fromEntries(Object.values(handlerGoldens).map(g => [g.routeKey, g.handler])),
    });
});

afterAll(() => app?.close());

async function fetchRaw(method: string, urlPath: string, options: { token?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = {};
    if (options.token) headers['x-api-token'] = options.token;
    let body: string | undefined;
    if (options.body !== undefined && options.body !== null) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(options.body);
    }
    const res = await fetch(`${app.origin}${urlPath}`, { method, headers, body });
    const text = await res.text();
    return { status: res.status, content_type: res.headers.get('content-type'), body: JSON.parse(text) };
}

type GoldenCase = { golden: string; request: (w: World) => Promise<{ method: string; path: string; token?: string; body?: unknown }> };

const UNKNOWN = '550e8400-e29b-41d4-a716-446655440000';

const GOLDEN_CASES: GoldenCase[] = [
    // --- produced by the registry's validation ---
    { golden: 'http.users.create.missingName.400', request: async () => ({ method: 'POST', path: '/users', body: {} }) },
    { golden: 'http.mats.create.missingName.400', request: async w => ({ method: 'POST', path: '/mats', token: w.creator.api_token, body: {} }) },
    { golden: 'http.matches.create.missingCompetitors.400', request: async w => ({ method: 'POST', path: `/mat/${w.adminCode}/matches`, token: w.creator.api_token, body: {} }) },
    { golden: 'http.ridingTime.start.invalidRider.400', request: async w => ({ method: 'POST', path: `/match/${(await createStartedMatch(app.db, w)).id}/ridingTime`, token: w.judge.api_token, body: { rider: 'purple' } }) },
    { golden: 'http.rounds.result.explicitNull.400', request: async w => ({ method: 'PATCH', path: `/match/${(await createStartedMatch(app.db, w)).id}/rounds/result`, token: w.creator.api_token, body: { stoppage: false, winner: null } }) },
    { golden: 'http.rounds.result.invalidWinner.400', request: async w => ({ method: 'PATCH', path: `/match/${(await createStartedMatch(app.db, w)).id}/rounds/result`, token: w.creator.api_token, body: { winner: 'green' } }) },
    // --- produced by the registry's gates ---
    { golden: 'http.mat.get.unknownId.401', request: async w => ({ method: 'GET', path: `/mat/${UNKNOWN}`, token: w.creator.api_token }) },
    { golden: 'http.match.get.unknownId.404', request: async w => ({ method: 'GET', path: `/match/${UNKNOWN}`, token: w.creator.api_token }) },
    { golden: 'http.match.get.unauthenticated.401', request: async w => ({ method: 'GET', path: `/match/${(await createMatch(app.db, w)).id}` }) },
    { golden: 'http.mat.judges.unauthenticated.401', request: async w => ({ method: 'GET', path: `/mat/${w.adminCode}/judges` }) },
    { golden: 'http.mat.judges.unknownCode.404', request: async w => ({ method: 'GET', path: '/mat/no.such.code/judges', token: w.creator.api_token }) },
    { golden: 'http.mat.viewers.unknownCode.404', request: async w => ({ method: 'GET', path: '/mat/no.such.code/viewers', token: w.creator.api_token }) },
    { golden: 'http.mats.create.unauthenticated.401', request: async () => ({ method: 'POST', path: '/mats', body: { name: 'Nope' } }) },
    { golden: 'http.matches.create.viewerCode.401', request: async w => ({ method: 'POST', path: `/mat/${w.viewerCode}/matches`, token: w.creator.api_token, body: { blue: { name: 'b' }, red: { name: 'a' } } }) },
    { golden: 'http.match.start.asJudge.401', request: async w => ({ method: 'POST', path: `/match/${(await createMatch(app.db, w)).id}/start`, token: w.judge.api_token }) },
    { golden: 'http.rounds.start.asJudge.401', request: async w => ({ method: 'POST', path: `/match/${(await createStartedMatch(app.db, w)).id}/rounds`, token: w.judge.api_token }) },
    { golden: 'http.rounds.pause.asJudge.401', request: async w => ({ method: 'POST', path: `/match/${(await createStartedMatch(app.db, w)).id}/rounds/pause`, token: w.judge.api_token }) },
    { golden: 'http.rounds.start.unknownMatch.404', request: async w => ({ method: 'POST', path: `/match/${UNKNOWN}/rounds`, token: w.creator.api_token }) },
    { golden: 'http.ridingTime.start.asNonJudge.401', request: async w => ({ method: 'POST', path: `/match/${(await createStartedMatch(app.db, w)).id}/ridingTime`, token: w.outsider.api_token, body: { rider: 'red' } }) },
    { golden: 'http.ridingTime.start.unknownMatch.404', request: async w => ({ method: 'POST', path: `/match/${UNKNOWN}/ridingTime`, token: w.judge.api_token, body: { rider: 'red' } }) },
    { golden: 'http.ridingTime.end.unknownMatch.404', request: async w => ({ method: 'DELETE', path: `/match/${UNKNOWN}/ridingTime?rider=red`, token: w.judge.api_token }) },
    { golden: 'http.ridingTime.end.noOpenRound.400', request: async w => ({ method: 'DELETE', path: `/match/${(await createMatch(app.db, w)).id}/ridingTime?rider=red`, token: w.judge.api_token }) },
    // --- produced by (stub) handlers through the envelope machinery ---
    { golden: 'http.healthCheck', request: async () => ({ method: 'GET', path: '/system/healthCheck' }) },
    { golden: 'http.root', request: async () => ({ method: 'GET', path: '/' }) },
    { golden: 'http.rounds.pause.noActiveRound.422', request: async w => ({ method: 'POST', path: `/match/${(await createMatch(app.db, w)).id}/rounds/pause`, token: w.creator.api_token }) },
    { golden: 'http.rounds.result.windowClosed.422', request: async w => ({ method: 'PATCH', path: `/match/${(await createStartedMatch(app.db, w)).id}/rounds/result`, token: w.creator.api_token, body: { stoppage: false, winner: 'red' } }) },
    { golden: 'http.match.end.alreadyEnded.400', request: async w => ({ method: 'POST', path: `/match/${(await createStartedMatch(app.db, w)).id}/end`, token: w.creator.api_token }) },
    { golden: 'http.users.create.objectName.500', request: async () => ({ method: 'POST', path: '/users', body: { name: { nested: true } } }) },
    { golden: 'http.mat.join.unknownCode.404', request: async () => ({ method: 'POST', path: '/mat/no.such.code/join', body: { name: 'X' } }) },
    { golden: 'http.match.get.openRound', request: async w => ({ method: 'GET', path: `/match/${(await createStartedMatch(app.db, w)).id}`, token: w.creator.api_token }) },
];

describe('envelope: contract goldens replayed through the registry', () => {
    for (const c of GOLDEN_CASES) {
        it(`${c.golden}`, async () => {
            const g     = golden(c.golden);
            const world = await createWorld(app.db);
            const req   = await c.request(world);
            expect(req.method).toBe(g.request.method);
            const res = await fetchRaw(req.method, req.path, { token: req.token, body: req.body });
            expect(res).toEqual({ status: g.response.status, content_type: g.response.content_type, body: g.response.body });
        });
    }

    it('replays the request bodies the goldens sent (not look-alikes)', () => {
        // Bodies that matter to validation must be the golden's own request body.
        const sent = (name: string) => golden(name).request.body;
        expect(sent('http.users.create.objectName.500')).toEqual({ name: { nested: true } });
        expect(sent('http.rounds.result.explicitNull.400')).toEqual({ stoppage: false, winner: null });
        expect(sent('http.ridingTime.start.invalidRider.400')).toEqual({ rider: 'purple' });
        expect(sent('http.matches.create.missingCompetitors.400')).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// 3. Errors thrown from a handler, against the snapshot
// ---------------------------------------------------------------------------

const PROBE_PATH = '/__probe';
let probeApp: RegistryApp;
let thrown: unknown;

beforeAll(async () => {
    const probe = defineRoute({
        method:    'get',
        path:      PROBE_PATH,
        authorize: { scope: 'none', level: 'public' },
        response:  routeResponses['GET /system/healthCheck'],
        tags:      ['test'],
        handler:   async () => { throw thrown; },
    });
    probeApp = await startRegistryApp({ routes: [probe] });
});

afterAll(() => probeApp?.close());

async function registryRender(err: unknown): Promise<{ status: number; body: unknown }> {
    thrown = err;
    const res = await fetch(`${probeApp.origin}${PROBE_PATH}`);
    return { status: res.status, body: await res.json() };
}

const CLASSES = { AuthorizationError: NewAuthorizationError, ValidationError: NewValidationError };
const recorded = () => F.readFixture('errorRendering').records;

describe('errors: rendering of a thrown error (snapshot)', () => {
    it('the fixture holds exactly the error cases defined', () => {
        expect([...recorded().keys()]).toEqual(ERROR_CASES.map((c: { label: string }) => c.label));
    });

    for (const c of ERROR_CASES as Array<{ label: string; status: number; make: (k: typeof CLASSES) => unknown }>) {
        it(`renders ${c.label} as recorded`, async () => {
            const { key, ...expected } = recorded().get(c.label);
            expect(key).toBe(c.label);
            const after = await registryRender(c.make(CLASSES));
            expect(after).toEqual(expected);
            expect(after.status).toBe(c.status);
        });
    }

    it('records the exact pinned bodies, not merely agreement', async () => {
        expect(await registryRender(new Error('boom'))).toEqual({ status: 500, body: { data: { error: 'boom' }, status: 'server error' } });
        expect(recorded().get('generic Error')).toEqual({ key: 'generic Error', status: 500, body: { data: { error: 'boom' }, status: 'server error' } });
        expect(await registryRender({ name: 'NotAnError' })).toEqual({ status: 500, body: { data: { error: null }, status: 'server error' } });
        expect(await registryRender(new NewAuthorizationError())).toEqual({ status: 401, body: { data: null, status: 'unauthorized' } });
        expect(await registryRender(new NewValidationError({ name: ['required'] })))
            .toEqual({ status: 400, body: { data: { errors: { name: ['required'] } }, status: 'bad request' } });
        expect(recorded().get('Sequelize-shaped unique error with short messages').body)
            .toEqual({ data: { errors: { code: ['m'], 'null': 'p' } }, status: 'bad request' });
    });

    it('does not leak an AuthorizationError message', async () => {
        expect(JSON.stringify((await registryRender(new NewAuthorizationError('super secret detail'))).body)).not.toContain('secret');
    });
});

describe('errors: a REAL SQLite unique violation through Drizzle', () => {
    it('is detected behind DrizzleQueryError and rendered like the Sequelize branch', async () => {
        const world = await createWorld(probeApp.db);
        let err: unknown;
        try {
            await insertMatCode(probeApp.db, { mat_id: world.mat.id, code: world.adminCode, role: 'other' });
        } catch (e) {
            err = e;
        }
        expect(err).toBeDefined();
        expect(uniqueViolationErrors(err)).toEqual({
            code:   ['code must be unique'],
            'null': 'SQLITE_CONSTRAINT: UNIQUE constraint failed: mat_codes.code',
        });

        const rendered = await registryRender(err);
        expect(rendered).toEqual({
            status: 400,
            body: { data: { errors: { code: ['code must be unique'], 'null': 'SQLITE_CONSTRAINT: UNIQUE constraint failed: mat_codes.code' } }, status: 'bad request' },
        });
    });

    it('extracts every column of a composite unique index', async () => {
        const world = await createWorld(probeApp.db);
        let err: unknown;
        try {
            await insertMatCode(probeApp.db, { mat_id: world.mat.id, code: `fresh.code.${Date.now()}`, role: 'admin' });
        } catch (e) {
            err = e;
        }
        expect(uniqueViolationErrors(err)).toEqual({
            mat_id: ['mat_id must be unique'],
            role:   ['role must be unique'],
            'null': 'SQLITE_CONSTRAINT: UNIQUE constraint failed: mat_codes.mat_id, mat_codes.role',
        });
    });

    it('does not treat a non-constraint error as a unique violation', () => {
        expect(uniqueViolationErrors(new Error('UNIQUE constraint failed: x.y'))).toBeNull();
        expect(uniqueViolationErrors(null)).toBeNull();
    });
});
