/**
 * Task 12 — route registry mechanics, legacy input/validation semantics, and
 * TYPE INFERENCE.
 *
 * The type-inference section is checked by `bun run typecheck` (tsc includes
 * test/**): the sample routes below carry NO annotations, and each
 * `@ts-expect-error` line is a negative case that must keep failing to
 * compile. If inference regressed to `any`, the `@ts-expect-error` lines would
 * become unused and tsc would fail.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { routeResponses } from '../../src/contract/responses';
import type { matchSchema } from '../../src/contract/match';
import type { Mat, MatCode, Match, Round, User } from '../../src/db/types';
import { defineRoute, noInput } from '../../src/http/route';
import { createUserBody, matchIdParams, startRidingTimeBody } from '../../src/http/routes/requests';
import { buildLegacyInput, processedRequestDataValue } from '../../src/http/legacyInput';
import { validateRequest } from '../../src/http/middleware/validate';
import { ValidationError } from '../../src/http/errors';
import type { AnyRouteDefinition } from '../../src/http/types';
import { createStartedMatch, createWorld, startRegistryApp, type RegistryApp } from './support/registryApp';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const assertType = <T extends true>(_value?: T) => undefined;

// ---------------------------------------------------------------------------
// Type inference (compile-time; the `it`s below also run them)
// ---------------------------------------------------------------------------

/** A judge route: ctx has currentUser, currentMatch AND currentRound; params/body inferred. */
export const sampleJudgeRoute = defineRoute({
    method:    'post',
    path:      '/sample/:matchId/vote',
    authorize: { scope: 'match', level: 'judge', round: 'open' },
    request:   { params: matchIdParams, body: startRidingTimeBody },
    response:  routeResponses['POST /match/{matchId}/ridingTime'],
    tags:      ['sample'],
    handler:   async ctx => {
        assertType<Equals<typeof ctx.params, { matchId: string }>>();
        assertType<Equals<typeof ctx.body, { rider: 'red' | 'blue' }>>();
        assertType<Equals<typeof ctx.currentMatch, Match>>();
        assertType<Equals<typeof ctx.currentRound, Round>>();
        assertType<Equals<typeof ctx.currentUser, User>>();
        const matchId: string = ctx.params.matchId;
        const rider: 'red' | 'blue' = ctx.body.rider;
        // @ts-expect-error a match route has no currentMat
        void ctx.currentMat;
        // @ts-expect-error the body has no such field
        void ctx.body.winner;
        // @ts-expect-error params are strings, not numbers
        const asNumber: number = ctx.params.matchId;
        void [matchId, rider, asNumber];
        if (rider === 'blue') return ctx.renderErrors({ rider: ['blue is busy'] });
        return { match: { id: ctx.currentMatch.id } as unknown as z.input<typeof matchSchema> };
    },
});

/** A mat-code route: currentMat + currentMatCode, no currentMatch. */
export const sampleMatCodeRoute = defineRoute({
    method:    'get',
    path:      '/sample/:matCode',
    authorize: { scope: 'matCode', level: 'create a match' },
    request:   { params: z.object({ matCode: z.string() }) },
    response:  routeResponses['GET /mat/{matCode}/judges'],
    tags:      ['sample'],
    // @ts-expect-error the success value ({ viewers }) must match the response schema's data ({ judges })
    handler:   async ctx => {
        assertType<Equals<typeof ctx.currentMat, Mat>>();
        assertType<Equals<typeof ctx.currentMatCode, MatCode>>();
        assertType<Equals<typeof ctx.body, typeof noInput._output>>();
        // @ts-expect-error a mat-code route has no currentMatch
        void ctx.currentMatch;
        return { viewers: [] };
    },
});

/** A public route: the user is optional; the legacy-faithful body type is honest (presence only). */
export const samplePublicRoute = defineRoute({
    method:    'post',
    path:      '/sample-public',
    authorize: { scope: 'none', level: 'public' },
    request:   { body: createUserBody },
    response:  routeResponses['GET /system/healthCheck'],
    tags:      ['sample'],
    handler:   async ctx => {
        assertType<Equals<typeof ctx.currentUser, User | null>>();
        // `name` passed a PRESENCE check only (any truthy value), not a string check.
        assertType<Equals<typeof ctx.body.name, string | number | boolean | Record<string, unknown> | unknown[]>>();
        // @ts-expect-error a public route has no currentMatch
        void ctx.currentMatch;
        return {};
    },
});

// @ts-expect-error the params schema must declare exactly the path parameters
defineRoute({
    method:    'get',
    path:      '/sample/:matchId/:roundId',
    authorize: { scope: 'match', level: 'view' },
    request:   { params: matchIdParams },
    response:  routeResponses['GET /match/{matchId}'],
    tags:      ['sample'],
    handler:   async () => null,
});

defineRoute({
    method:    'get',
    path:      '/sample/:matchId',
    // @ts-expect-error `judge` requires `round: 'open'` (the open-round gate)
    authorize: { scope: 'match', level: 'judge' },
    request:   { params: matchIdParams },
    response:  routeResponses['GET /match/{matchId}'],
    tags:      ['sample'],
    handler:   async () => null,
});

defineRoute({
    method:    'get',
    path:      '/sample/:matchId',
    // @ts-expect-error unknown levels are rejected (no stringly-typed authorization)
    authorize: { scope: 'match', level: 'admin' },
    request:   { params: matchIdParams },
    response:  routeResponses['GET /match/{matchId}'],
    tags:      ['sample'],
    handler:   async () => null,
});

describe('type inference', () => {
    it('compiles the sample routes (see `bun run typecheck`) and keeps them as plain data', () => {
        expect(sampleJudgeRoute.path).toBe('/sample/:matchId/vote');
        expect(sampleJudgeRoute.render).toBe('envelope');
        expect(sampleJudgeRoute.devOnly).toBe(false);
        expect(sampleJudgeRoute.request.query).toBe(noInput);
        expect(Object.isFrozen(sampleJudgeRoute)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Legacy input bag (F-73) and validation
// ---------------------------------------------------------------------------

describe('legacy input bag (ServerController#params, F-73)', () => {
    it('merges path < body < query', () => {
        expect(buildLegacyInput({ params: { matchId: 'path' }, body: { matchId: 'body', a: 1 }, query: { matchId: 'query' } }))
            .toEqual({ matchId: 'query', a: 1 });
        expect(buildLegacyInput({ params: { matCode: 'path' }, body: { matCode: 'body' } })).toEqual({ matCode: 'body' });
    });

    it('JSON-decodes top-level strings that hold an object or array, and nothing else', () => {
        expect(processedRequestDataValue('{"a":1}')).toEqual({ a: 1 });
        expect(processedRequestDataValue('[1]')).toEqual([1]);
        expect(processedRequestDataValue('5')).toBe('5');
        expect(processedRequestDataValue('null')).toBe('null');
        expect(processedRequestDataValue('not json')).toBe('not json');
        expect(processedRequestDataValue(5)).toBe(5);
        expect(buildLegacyInput({ params: { p: '{"x":1}' }, body: { b: '{"y":2}' }, query: { q: '{"z":3}' } }))
            .toEqual({ p: '{"x":1}', b: { y: 2 }, q: { z: 3 } }); // path params are NOT decoded
    });

    it('tolerates missing body/query', () => {
        expect(buildLegacyInput({ params: { a: 'b' } })).toEqual({ a: 'b' });
    });
});

describe('validation (legacy error envelope from Zod issues)', () => {
    const schemas = { params: matchIdParams, query: noInput, body: startRidingTimeBody };

    it('parses params from the PATH and body from the merged bag', () => {
        expect(validateRequest(schemas, { matchId: 'm1' }, { matchId: 'override', rider: 'red' }))
            .toEqual({ params: { matchId: 'm1' }, query: {}, body: { rider: 'red' } });
    });

    it('throws ValidationError with legacy keys and messages', () => {
        let err: unknown;
        try { validateRequest(schemas, { matchId: 'm1' }, {}); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).errors).toEqual({ rider: ['must be one of [red, blue]'] });
    });
});

// ---------------------------------------------------------------------------
// Registration mechanics over HTTP
// ---------------------------------------------------------------------------

const seen: Record<string, unknown> = {};
const capture = (key: string): AnyRouteDefinition['handler'] =>
    (async (ctx: any) => { seen[key] = { params: ctx.params, query: ctx.query, body: ctx.body }; return {}; }) as AnyRouteDefinition['handler'];

const putRoute = defineRoute({
    method: 'put', path: '/__put', authorize: { scope: 'none', level: 'public' },
    response: routeResponses['GET /system/healthCheck'], tags: ['test'],
    handler: async () => undefined as never,
});
const falsyRoute = defineRoute({
    method: 'get', path: '/__falsy', authorize: { scope: 'none', level: 'public' },
    response: routeResponses['GET /system/healthCheck'], tags: ['test'],
    handler: async () => null,
});

let app: RegistryApp;
let devApp: RegistryApp;

beforeAll(async () => {
    app = await startRegistryApp({
        handlers: {
            'POST /users': capture('POST /users'),
            'POST /match/:matchId/ridingTime': capture('POST /match/:matchId/ridingTime'),
            'DELETE /match/:matchId/ridingTime': capture('DELETE /match/:matchId/ridingTime'),
        },
    });
    devApp = await startRegistryApp({
        dev: true,
        handlers: {
            'GET /docs.json': (async () => ({ openapi: '3.1.0' })) as AnyRouteDefinition['handler'],
            'GET /docs': (async () => '<html>docs</html>') as AnyRouteDefinition['handler'],
        },
    });
});

afterAll(() => { app?.close(); devApp?.close(); });

describe('registration', () => {
    it('skips DEV-only routes outside DEV (Express default 404, as legacy in production)', async () => {
        const res = await fetch(`${app.origin}/docs.json`);
        expect(res.status).toBe(404);
        expect(res.headers.get('content-type')).toContain('text/html');
    });

    it('registers DEV-only routes in DEV, rendering raw JSON and HTML (no envelope)', async () => {
        const json = await fetch(`${devApp.origin}/docs.json`);
        expect(await json.json()).toEqual({ openapi: '3.1.0' });
        const html = await fetch(`${devApp.origin}/docs`);
        expect(html.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(await html.text()).toBe('<html>docs</html>');
    });

    it('dispatches every HTTP method, PUT included', async () => {
        const putApp = await startRegistryApp({ routes: [putRoute, falsyRoute] });
        try {
            const put = await putApp.request('PUT', '/__put');
            expect(put).toEqual({ status: 200, body: { data: {}, status: 'ok' } });
            // legacy: render(responseBody || {}) -> a falsy result renders {}
            expect(await putApp.request('GET', '/__falsy')).toEqual({ status: 200, body: { data: {}, status: 'ok' } });
        } finally {
            putApp.close();
        }
    });

    it('placeholder handlers fail LOUDLY (500), never silently succeed', async () => {
        const placeholderApp = await startRegistryApp({ routes: [(await import('../../src/http/routes/system')).getHealthCheck] });
        try {
            const res = await placeholderApp.request('GET', '/system/healthCheck');
            expect(res.status).toBe(500);
            expect(res.body).toEqual({ data: { error: 'handler not implemented: ported in task 13c' }, status: 'server error' });
        } finally {
            placeholderApp.close();
        }
    });

    it('sends request-state resolution errors to Express\'s default handler, as legacy did', async () => {
        const broken = await startRegistryApp({ routes: [(await import('../../src/http/routes/system')).getRoot] });
        try {
            broken.db.$client.close();
            const res = await fetch(`${broken.origin}/`, { headers: { 'x-api-token': 'anything' } });
            expect(res.status).toBe(500);
            expect(res.headers.get('content-type')).toContain('text/html');
        } finally {
            broken.close();
        }
    });
});

describe('request parts reaching the handler (F-73 fidelity)', () => {
    it('validates the body from the merged bag: a query value overrides the body', async () => {
        const res = await app.request('POST', '/users?name=fromQuery', { body: { name: 'fromBody' } });
        expect(res.status).toBe(200);
        expect(seen['POST /users']).toEqual({ params: {}, query: {}, body: { name: 'fromQuery' } });
    });

    it('JSON-decodes a string body value before validation (legacy: object name -> 500 later)', async () => {
        await app.request('POST', '/users', { body: { name: '{"a":1}' } });
        expect(seen['POST /users']).toEqual({ params: {}, query: {}, body: { name: { a: 1 } } });
    });

    it('rejects a falsy name with the legacy presence message', async () => {
        for (const name of ['', 0, false, null]) {
            expect(await app.request('POST', '/users', { body: { name } }))
                .toEqual({ status: 400, body: { data: { errors: { name: ['required'] } }, status: 'bad request' } });
        }
    });

    it('takes ctx.params from the path even when the bag overrides it', async () => {
        const world = await createWorld(app.db);
        const match = await createStartedMatch(app.db, world);
        const res = await app.request('POST', `/match/${match.id}/ridingTime?rider=red`, { token: world.judge.api_token, body: { rider: 'purple' } });
        expect(res.status).toBe(200); // query `rider` wins over the invalid body value, as in legacy
        expect(seen['POST /match/:matchId/ridingTime']).toEqual({ params: { matchId: match.id }, query: {}, body: { rider: 'red' } });
    });

    it('accepts and ignores DELETE ridingTime `rider`, valid or not (F-55)', async () => {
        const world = await createWorld(app.db);
        const match = await createStartedMatch(app.db, world);
        for (const rider of ['red', 'purple', '']) {
            const res = await app.request('DELETE', `/match/${match.id}/ridingTime?rider=${rider}`, { token: world.judge.api_token });
            expect(res.status).toBe(200);
        }
        expect((await app.request('DELETE', `/match/${match.id}/ridingTime`, { token: world.judge.api_token })).status).toBe(200);
    });

    it('parses urlencoded and text/plain JSON bodies like the legacy app', async () => {
        const form = await fetch(`${app.origin}/users`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=Formy' });
        expect(form.status).toBe(200);
        expect(seen['POST /users']).toEqual({ params: {}, query: {}, body: { name: 'Formy' } });
        const text = await fetch(`${app.origin}/users`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"name":"Texty"}' });
        expect(text.status).toBe(200);
        expect(seen['POST /users']).toEqual({ params: {}, query: {}, body: { name: 'Texty' } });
    });
});
