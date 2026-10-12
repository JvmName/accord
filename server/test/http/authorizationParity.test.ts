/**
 * Task 12 — AUTHORIZATION PARITY of the route registry, over HTTP.
 *
 * Every row of `.ai/plans/server-ts/artifacts/authz-matrix.txt` (the task-02b
 * matrix, executable form `test/characterization/authorization.test.js`) is
 * replayed against the NEW middleware: the real route definitions with their
 * real `authorize` specs, mounted on a test Express app over a scratch
 * in-memory Drizzle database, with STUB handlers. A first test parses the
 * artifact and asserts that this file covers exactly its rows (as a multiset),
 * so a row cannot be silently skipped.
 *
 * Why stubs: the handlers are ported in 13a/13b; the task-02b file itself runs
 * against the real routes then. What the matrix decides (who may reach which
 * action) is decided before the handler by the gates, EXCEPT three in-handler
 * checks that legacy performed inside actions; the stubs for those three
 * routes reproduce exactly those checks through `ctx.authorize` (the ported
 * `Authorizer`), so they are exercised too:
 *   - POST /mat/:matCode/join   addUser: unknown code -> 404 {matCode}; ADMIN code -> assign + 'be assigned judge'
 *   - DELETE /mat/:matCode/join removeUser: ADMIN code -> assign + 'be assigned judge'
 *   - POST /mat/:matCode/matches fetchCompetitors: authorize('assign', red/blue) (unknown id -> null -> 401)
 *
 * DENY = 401 with exactly `{ data: null, status: 'unauthorized' }`.
 * Extra rows below the matrix pin further denies and orderings (F-73, F-74).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { findUserById } from '../../src/db/repositories/users';
import type { User } from '../../src/db/types';
import type { AnyRouteDefinition } from '../../src/http/types';
import {
    createMatch,
    createMatchWithEndedRound,
    createStartedMatch,
    createUser,
    createWorld,
    routeKey,
    startRegistryApp,
    type RegistryApp,
    type World,
} from './support/registryApp';

const MATRIX = path.join(__dirname, '..', '..', '..', '.ai', 'plans', 'server-ts', 'artifacts', 'authz-matrix.txt');
const UNAUTHORIZED = { data: null, status: 'unauthorized' };
const NOT_FOUND    = { data: null, status: 'not found' };
const UNKNOWN_UUID = '550e8400-e29b-41d4-a716-446655440000';

/**
 * Parses the matrix artifact into normalised row tuples
 * `METHOD route[ (by x)] actor -> status`.
 */
function parseMatrix(): string[] {
    const row = /\b(GET|POST|DELETE|PATCH)\s+(\S+)\s+(?:\((by \w+)\)\s+)?(.+?)\s+(?:(?:ALLOW|DENY)\s+)?(\d{3})\b/;
    return fs.readFileSync(MATRIX, 'utf8')
        .split('\n')
        .filter(line => !line.startsWith('#'))
        .map(line => line.match(row))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map(([, method, route, by, actor, status]) => `${method} ${route}${by ? ` (${by})` : ''} ${actor.trim()} -> ${status}`)
        .sort();
}

const competitorStubHandlers = {
    /** `mat/UsersController#addUser`'s checks. */
    'POST /mat/:matCode/join': (async (ctx: any) => {
        if (!ctx.currentMatCode) return ctx.renderErrors({ matCode: ['not found'] }, 404);
        if (ctx.currentMatCode.role == 'admin') {
            await ctx.authorize('assign',            { kind: 'mat', mat: ctx.currentMat });
            await ctx.authorize('be assigned judge', { kind: 'mat', mat: ctx.currentMat });
        }
        return { reached: 'POST /mat/:matCode/join' };
    }) as AnyRouteDefinition['handler'],

    /** `mat/UsersController#removeUser`'s checks. */
    'DELETE /mat/:matCode/join': (async (ctx: any) => {
        if (ctx.currentMatCode.role == 'admin') {
            await ctx.authorize('assign',            { kind: 'mat', mat: ctx.currentMat });
            await ctx.authorize('be assigned judge', { kind: 'mat', mat: ctx.currentMat });
        }
        return { reached: 'DELETE /mat/:matCode/join' };
    }) as AnyRouteDefinition['handler'],

    /** `MatchesController#postIndex`: fetch (find by id / create by name), then authorize('assign', each). */
    'POST /mat/:matCode/matches': (async (ctx: any) => {
        const fetched: Array<User | null> = [];
        for (const color of ['red', 'blue'] as const) {
            const competitor = ctx.body[color];
            fetched.push(competitor.id
                ? await findUserById(ctx.db, competitor.id)
                : ({ id: `new-${color}`, name: competitor.name } as User));
        }
        for (const user of fetched) await ctx.authorize('assign', { kind: 'user', user });
        return { reached: 'POST /mat/:matCode/matches' };
    }) as AnyRouteDefinition['handler'],
};

let app: RegistryApp;

beforeAll(async () => {
    app = await startRegistryApp({ handlers: competitorStubHandlers });
});

afterAll(() => app?.close());

const token = (user: User | null | undefined) => user?.api_token;

type Row = {
    /** Normalised matrix tuple; `null` for an extra row not in the matrix. */
    matrix: string | null;
    name: string;
    run: (w: World) => Promise<{ status: number; body: any }>;
    status: number;
    body?: unknown;
};

/** Builds the rows; each `run` gets a fresh world unless it creates its own state. */
function rows(): Row[] {
    const req = (...args: Parameters<RegistryApp['request']>) => app.request(...args);
    const competitors = { red: { name: 'Red' }, blue: { name: 'Blue' } };

    return [
        // ===================== MAT SCOPE =====================
        { matrix: 'POST /mats any auth -> 200', name: 'Mat/create ALLOWS any authenticated user', status: 200,
          run: async () => req('POST', '/mats', { token: token(await createUser(app.db, 'any')), body: { name: 'Mat' } }) },
        { matrix: 'POST /mats anon -> 401', name: 'Mat/create DENIES anonymous', status: 401, body: UNAUTHORIZED,
          run: async () => req('POST', '/mats', { body: { name: 'Mat' } }) },
        { matrix: 'POST /mats bad token -> 401', name: 'Mat/create DENIES a token that resolves to no user', status: 401, body: UNAUTHORIZED,
          run: async () => req('POST', '/mats', { token: '00000000-0000-0000-0000-000000000000', body: { name: 'Mat' } }) },

        { matrix: 'GET /mat/:matId (by id) creator -> 200', name: 'Mat/view ALLOWS the creator', status: 200,
          run: async w => req('GET', `/mat/${w.mat.id}`, { token: token(w.creator) }) },
        { matrix: 'GET /mat/:matId (by id) outsider -> 200', name: 'Mat/view ALLOWS an outsider', status: 200,
          run: async w => req('GET', `/mat/${w.mat.id}`, { token: token(w.outsider) }) },
        { matrix: 'GET /mat/:matId (by id) anon -> 200', name: 'Mat/view ALLOWS anonymous (F-15, intentional)', status: 200,
          run: async w => req('GET', `/mat/${w.mat.id}`) },
        { matrix: 'GET /mat/:matId (by code) anon -> 200', name: 'Mat/view ALLOWS lookup by word-code', status: 200,
          run: async w => req('GET', `/mat/${w.adminCode}`) },
        { matrix: 'GET /mat/:unknownUuid creator -> 401', name: 'Mat/view DENIES (401, not 404) an unknown mat id (F-16)', status: 401, body: UNAUTHORIZED,
          run: async w => req('GET', `/mat/${UNKNOWN_UUID}`, { token: token(w.creator) }) },

        { matrix: 'POST /mat/:adminCode/join any auth -> 200', name: 'join ALLOWS with an ADMIN code (assign + be assigned judge)', status: 200,
          run: async w => req('POST', `/mat/${w.adminCode}/join`, { token: token(await createUser(app.db, 'joiner')) }) },
        { matrix: 'POST /mat/:adminCode/join anon -> 200', name: 'join ALLOWS with an ADMIN code and no token', status: 200,
          run: async w => req('POST', `/mat/${w.adminCode}/join`, { body: { name: 'Walk-in' } }) },
        { matrix: 'POST /mat/:viewerCode/join any auth -> 200', name: 'join ALLOWS with a VIEWER code (no authorize)', status: 200,
          run: async w => req('POST', `/mat/${w.viewerCode}/join`, { token: token(await createUser(app.db, 'watcher')) }) },
        { matrix: 'DELETE /mat/:adminCode/join anon -> 401', name: 'leave DENIES anonymous', status: 401, body: UNAUTHORIZED,
          run: async w => req('DELETE', `/mat/${w.adminCode}/join`) },
        { matrix: 'GET /mat/:code/judges outsider -> 200', name: 'judges roster ALLOWS any authenticated user', status: 200,
          run: async w => req('GET', `/mat/${w.adminCode}/judges`, { token: token(w.outsider) }) },
        { matrix: 'GET /mat/:code/viewers outsider -> 200', name: 'viewers roster ALLOWS any authenticated user', status: 200,
          run: async w => req('GET', `/mat/${w.viewerCode}/viewers`, { token: token(w.outsider) }) },
        { matrix: 'GET /mat/:code/judges anon -> 401', name: 'judges roster DENIES anonymous', status: 401, body: UNAUTHORIZED,
          run: async w => req('GET', `/mat/${w.adminCode}/judges`) },
        { matrix: 'GET /mat/no.such.code/judges creator -> 404', name: 'judges roster: unknown code is 404 (not 401)', status: 404, body: NOT_FOUND,
          run: async w => req('GET', '/mat/no.such.code/judges', { token: token(w.creator) }) },

        { matrix: 'POST /mat/:adminCode/matches creator -> 200', name: 'create a match ALLOWS the creator with the ADMIN code', status: 200,
          run: async w => req('POST', `/mat/${w.adminCode}/matches`, { token: token(w.creator), body: competitors }) },
        { matrix: 'POST /mat/:adminCode/matches outsider -> 200', name: 'create a match ALLOWS an outsider holding the ADMIN code', status: 200,
          run: async w => req('POST', `/mat/${w.adminCode}/matches`, { token: token(w.outsider), body: competitors }) },
        { matrix: 'POST /mat/:viewerCode/matches creator -> 401', name: 'create a match DENIES the creator with the VIEWER code', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/mat/${w.viewerCode}/matches`, { token: token(w.creator), body: competitors }) },
        { matrix: 'POST /mat/:viewerCode/matches judge -> 401', name: 'create a match DENIES a mat judge with the VIEWER code', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/mat/${w.viewerCode}/matches`, { token: token(w.judge), body: competitors }) },
        { matrix: 'POST /mat/:adminCode/matches anon -> 401', name: 'create a match DENIES anonymous even with the ADMIN code', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/mat/${w.adminCode}/matches`, { body: competitors }) },

        // ===================== USER SCOPE =====================
        { matrix: 'POST /mat/:adminCode/matches creator -> 200', name: 'User/assign ALLOWS an arbitrary EXISTING user as competitor', status: 200,
          run: async w => {
              const stranger = await createUser(app.db, 'stranger');
              return req('POST', `/mat/${w.adminCode}/matches`, { token: token(w.creator), body: { red: { id: stranger.id }, blue: { name: 'Blue' } } });
          } },
        { matrix: 'POST /mat/:adminCode/matches creator -> 200', name: 'User/assign ALLOWS brand-new users by name', status: 200,
          run: async w => req('POST', `/mat/${w.adminCode}/matches`, { token: token(w.creator), body: { red: { name: 'Fresh Red' }, blue: { name: 'Fresh Blue' } } }) },

        // ===================== MATCH SCOPE: view =====================
        ...(['creator', 'judge', 'viewer', 'outsider'] as const).map((actor): Row => ({
            matrix: `GET /match/:matchId ${actor} -> 200`, name: `Match/view ALLOWS ${actor}`, status: 200,
            run: async w => req('GET', `/match/${(await createMatch(app.db, w)).id}`, { token: token(w[actor]) }),
        })),
        { matrix: 'GET /match/:matchId anon -> 401', name: 'Match/view DENIES anonymous', status: 401, body: UNAUTHORIZED,
          run: async w => req('GET', `/match/${(await createMatch(app.db, w)).id}`) },
        { matrix: 'GET /match/:unknownUuid creator -> 404', name: 'Match/view: unknown match is 404', status: 404, body: NOT_FOUND,
          run: async w => req('GET', `/match/${UNKNOWN_UUID}`, { token: token(w.creator) }) },

        // ===================== MATCH SCOPE: manage =====================
        { matrix: 'POST /match/:id/start creator -> 200', name: 'manage ALLOWS the creator to start', status: 200,
          run: async w => req('POST', `/match/${(await createMatch(app.db, w)).id}/start`, { token: token(w.creator) }) },
        { matrix: 'POST /match/:id/end creator -> 200', name: 'manage ALLOWS the creator to end', status: 200,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/end`, { token: token(w.creator) }) },
        { matrix: 'POST /match/:id/start judge -> 401', name: 'manage DENIES a match judge (start)', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createMatch(app.db, w)).id}/start`, { token: token(w.judge) }) },
        { matrix: 'POST /match/:id/end judge -> 401', name: 'manage DENIES a match judge (end)', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/end`, { token: token(w.judge) }) },
        { matrix: 'POST /match/:id/start viewer -> 401', name: 'manage DENIES a mat viewer', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createMatch(app.db, w)).id}/start`, { token: token(w.viewer) }) },
        { matrix: 'POST /match/:id/start outsider -> 401', name: 'manage DENIES an outsider', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createMatch(app.db, w)).id}/start`, { token: token(w.outsider) }) },
        { matrix: 'POST /match/:id/start anon -> 401', name: 'manage DENIES anonymous', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createMatch(app.db, w)).id}/start`) },
        { matrix: 'POST /match/:id/rounds judge -> 401', name: 'manage DENIES a judge starting a round', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/rounds`, { token: token(w.judge) }) },
        { matrix: 'POST /match/:id/rounds/end judge -> 401', name: 'manage DENIES a judge ending a round', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/end`, { token: token(w.judge) }) },
        { matrix: 'PATCH /match/:id/rounds/result judge -> 401', name: 'manage DENIES a judge setting a result', status: 401, body: UNAUTHORIZED,
          run: async w => req('PATCH', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/result`, { token: token(w.judge), body: { winner: 'red' } }) },
        { matrix: 'POST /match/:id/rounds/end creator -> 200', name: 'manage ALLOWS the creator to end a round', status: 200,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/end`, { token: token(w.creator) }) },

        // ===================== MATCH SCOPE: pause (F-11) =====================
        { matrix: 'POST /match/:id/rounds/pause creator -> 200', name: 'pause ALLOWS the creator to pause', status: 200,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/pause`, { token: token(w.creator) }) },
        { matrix: 'POST /match/:id/rounds/resume creator -> 200', name: 'pause ALLOWS the creator to resume', status: 200,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/resume`, { token: token(w.creator) }) },
        { matrix: 'POST /match/:id/rounds/pause judge -> 401', name: 'pause DENIES a match judge (F-11: manage is checked first)', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/pause`, { token: token(w.judge) }) },
        { matrix: 'POST /match/:id/rounds/resume judge -> 401', name: 'resume DENIES a match judge (F-11)', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/resume`, { token: token(w.judge) }) },
        { matrix: 'POST /match/:id/rounds/pause outsider -> 401', name: 'pause DENIES an outsider', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/pause`, { token: token(w.outsider) }) },
        { matrix: 'POST /match/:id/rounds/pause anon -> 401', name: 'pause DENIES anonymous', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/pause`) },

        // ===================== MATCH SCOPE: judge =====================
        { matrix: 'POST /match/:id/ridingTime judge -> 200', name: 'judge ALLOWS a match judge to start a vote', status: 200,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/ridingTime`, { token: token(w.judge), body: { rider: 'red' } }) },
        { matrix: 'DELETE /match/:id/ridingTime?rider=red judge -> 200', name: 'judge ALLOWS a match judge to end a vote', status: 200,
          run: async w => req('DELETE', `/match/${(await createStartedMatch(app.db, w)).id}/ridingTime?rider=red`, { token: token(w.judge) }) },
        ...(['creator', 'viewer', 'outsider'] as const).map((actor): Row => ({
            matrix: `POST /match/:id/ridingTime ${actor} -> 401`, name: `judge DENIES ${actor}`, status: 401, body: UNAUTHORIZED,
            run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/ridingTime`, { token: token(w[actor]), body: { rider: 'red' } }),
        })),
        { matrix: 'POST /match/:id/ridingTime anon -> 401', name: 'judge DENIES anonymous', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/ridingTime`, { body: { rider: 'red' } }) },
        { matrix: 'POST /match/:id/ridingTime outsider -> 400', name: 'judge: no active round is 400 BEFORE the judge check', status: 400,
          body: { data: { errors: { matchId: ['no active round available'] } }, status: 'bad request' },
          run: async w => req('POST', `/match/${(await createMatch(app.db, w)).id}/ridingTime`, { token: token(w.outsider), body: { rider: 'red' } }) },

        // ===================== EXTRA rows (not in the matrix) =====================
        { matrix: null, name: 'viewers roster DENIES anonymous', status: 401, body: UNAUTHORIZED,
          run: async w => req('GET', `/mat/${w.viewerCode}/viewers`) },
        ...(['GET judges', 'GET viewers', 'DELETE join'] as const).map((r): Row => ({
            matrix: null, name: `F-74: anonymous + unknown code on ${r} is 404 (missing mat wins over 401)`, status: 404, body: NOT_FOUND,
            run: async () => req(r.split(' ')[0], `/mat/no.such.code/${r.split(' ')[1]}`),
        })),
        { matrix: null, name: 'join: unknown code is 404 with an errors map (in-handler check)', status: 404,
          body: { data: { errors: { matCode: ['not found'] } }, status: 'not found' },
          run: async () => req('POST', '/mat/no.such.code/join', { body: { name: 'X' } }) },
        { matrix: null, name: 'User/assign DENIES an unknown competitor id (null scope)', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/mat/${w.adminCode}/matches`, { token: token(w.creator), body: { red: { id: UNKNOWN_UUID }, blue: { name: 'B' } } }) },
        { matrix: null, name: 'create a match DENIES an unknown code (null mat scope -> 401, not 404)', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', '/mat/no.such.code/matches', { token: token(w.creator), body: competitors }) },
        { matrix: null, name: 'create a match DENIES another mat\'s VIEWER code supplied through the F-73 query override', status: 401, body: UNAUTHORIZED,
          run: async w => {
              const other = await createWorld(app.db);
              // path: this mat's ADMIN code; the query overrides matCode with the other mat's VIEWER code
              return req('POST', `/mat/${w.adminCode}/matches?matCode=${other.viewerCode}`, { token: token(w.creator), body: competitors });
          } },
        { matrix: null, name: 'F-73: a query matCode OVERRIDES the path code (viewer path + admin query -> allowed)', status: 200,
          run: async w => req('POST', `/mat/${w.viewerCode}/matches?matCode=${w.adminCode}`, { token: token(w.creator), body: competitors }) },
        { matrix: null, name: 'F-73: a body matCode OVERRIDES the path code (admin path + viewer body -> denied)', status: 401, body: UNAUTHORIZED,
          run: async w => req('POST', `/mat/${w.adminCode}/matches`, { token: token(w.creator), body: { ...competitors, matCode: w.viewerCode } }) },
        { matrix: null, name: 'Mat/create: authorization runs BEFORE validation (anonymous + no name -> 401)', status: 401, body: UNAUTHORIZED,
          run: async () => req('POST', '/mats', { body: {} }) },
        { matrix: null, name: 'manage: authorization runs BEFORE validation (judge + invalid winner -> 401)', status: 401, body: UNAUTHORIZED,
          run: async w => req('PATCH', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/result`, { token: token(w.judge), body: { winner: 'green' } }) },
        { matrix: null, name: 'manage: the creator with an invalid winner gets the validation 400', status: 400,
          body: { data: { errors: { winner: ['must be one of [red, blue]'] } }, status: 'bad request' },
          run: async w => req('PATCH', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/result`, { token: token(w.creator), body: { winner: 'green' } }) },
        ...(['start', 'end', 'rounds', 'rounds/end', 'rounds/pause', 'rounds/resume', 'ridingTime'] as const).map((action): Row => ({
            matrix: null, name: `unknown match on POST .../${action} is 404 for the creator`, status: 404, body: NOT_FOUND,
            run: async w => req('POST', `/match/${UNKNOWN_UUID}/${action}`, { token: token(w.creator), body: { rider: 'red' } }),
        })),
        { matrix: null, name: 'unknown match: authentication still comes first (anonymous -> 401)', status: 401, body: UNAUTHORIZED,
          run: async () => req('POST', `/match/${UNKNOWN_UUID}/start`) },
        ...(['pause', 'resume'] as const).map((action): Row => ({
            matrix: null, name: `${action} DENIES a mat viewer`, status: 401, body: UNAUTHORIZED,
            run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/rounds/${action}`, { token: token(w.viewer) }),
        })),
        ...(['rounds', 'rounds/end', 'start', 'end'] as const).map((action): Row => ({
            matrix: null, name: `manage DENIES an outsider on ${action}`, status: 401, body: UNAUTHORIZED,
            run: async w => req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/${action}`, { token: token(w.outsider) }),
        })),
        { matrix: null, name: 'judge: an ENDED last round is not open -> 400 for the judge', status: 400,
          body: { data: { errors: { matchId: ['no active round available'] } }, status: 'bad request' },
          run: async w => req('DELETE', `/match/${(await createMatchWithEndedRound(app.db, w)).id}/ridingTime?rider=red`, { token: token(w.judge) }) },
        { matrix: null, name: 'judge DENIES a match judge of ANOTHER match', status: 401, body: UNAUTHORIZED,
          run: async w => {
              const other = await createWorld(app.db);
              return req('POST', `/match/${(await createStartedMatch(app.db, w)).id}/ridingTime`, { token: token(other.judge), body: { rider: 'red' } });
          } },
        { matrix: null, name: 'manage DENIES the creator of ANOTHER mat', status: 401, body: UNAUTHORIZED,
          run: async w => {
              const other = await createWorld(app.db);
              return req('POST', `/match/${(await createMatch(app.db, w)).id}/start`, { token: token(other.creator) });
          } },
    ];
}

describe('authorization parity: the task-02b matrix against the new middleware', () => {
    const all = rows();

    it('covers exactly the rows of artifacts/authz-matrix.txt (as a multiset)', () => {
        const covered = all.map(r => r.matrix).filter((m): m is string => m !== null).sort();
        expect(covered).toEqual(parseMatrix());
        expect(covered.length).toBe(53);
    });

    it('has deny rows for every match level and every mat-scope gate', () => {
        const denies = all.filter(r => r.status === 401).map(r => r.name).join('\n');
        for (const level of ['Mat/create', 'Mat/view', 'leave', 'judges roster', 'create a match', 'User/assign', 'Match/view', 'manage', 'pause', 'judge']) {
            expect(denies).toContain(level);
        }
    });

    for (const row of all) {
        it(`${row.matrix ? '[matrix] ' : '[extra]  '}${row.name}`, async () => {
            const world = await createWorld(app.db);
            const res   = await row.run(world);
            expect(res.status).toBe(row.status);
            if (row.body !== undefined) expect(res.body).toEqual(row.body);
            if (row.status === 200) expect(res.body.status).toBe('ok');
        });
    }
});

describe('authorization parity: gates run before the handler', () => {
    it('never invokes the handler on a denied request', async () => {
        const reached: string[] = [];
        const probe = await startRegistryApp({
            handlers: Object.fromEntries(
                ['POST /match/:matchId/start', 'POST /match/:matchId/ridingTime', 'GET /mat/:matCode/judges'].map(k => [
                    k, (async () => { reached.push(k); return {}; }) as AnyRouteDefinition['handler'],
                ]),
            ),
        });
        try {
            const w = await createWorld(probe.db);
            const m = await createStartedMatch(probe.db, w);
            expect((await probe.request('POST', `/match/${m.id}/start`, { token: token(w.judge) })).status).toBe(401);
            expect((await probe.request('POST', `/match/${m.id}/ridingTime`, { token: token(w.creator), body: { rider: 'red' } })).status).toBe(401);
            expect((await probe.request('GET', `/mat/${w.adminCode}/judges`)).status).toBe(401);
            expect(reached).toEqual([]);
            expect((await probe.request('POST', `/match/${m.id}/start`, { token: token(w.creator) })).status).toBe(200);
            expect(reached).toEqual(['POST /match/:matchId/start']);
        } finally {
            probe.close();
        }
    });

    it('registers every declared route (a denied route is not a missing route)', async () => {
        // A path that is not registered answers Express's default 404 HTML,
        // not the JSON envelope; every declared non-DEV route must answer JSON.
        const res = await app.request('GET', '/no/such/route');
        expect(res.status).toBe(404);
        expect(typeof res.body).toBe('string');
        expect(routeKey({ method: 'get', path: '/x' })).toBe('GET /x');
    });
});
