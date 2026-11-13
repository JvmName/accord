/**
 * CHARACTERIZATION — error class → HTTP status + response envelope.
 *
 * Pins `src/http/middleware/errors.ts#handleError` and the `{ data, status }`
 * envelope it renders.
 *
 * Driven through the production path: a route registered by the route
 * registry (request state → gates → handler → the route's error handler →
 * handleError → render) on a real Express app, observed over HTTP, so both
 * the status code and the exact JSON body are seen as a client sees them.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import { createDb, migrateDb } from '../../src/db';
import { routeResponses } from '../../src/contract/responses';
import { AuthorizationError, ValidationError } from '../../src/http/errors';
import { defineRoute } from '../../src/http/route';
import { bodyParsers, registerRoutes } from '../../src/http/router';


/** A route whose handler throws whatever the test hands it. */
let thrown = null;
const probe = defineRoute({
    method:    'get',
    path:      '/probe',
    authorize: { scope: 'none', level: 'public' },
    response:  routeResponses['GET /system/healthCheck'],
    tags:      ['test'],
    handler:   async () => { throw thrown; },
});

let db;
let server;
let origin;
/** Per request: how often `res.json` and `res.end` were called. */
let calls: { json: number; end: number };

beforeAll(async () => {
    db = createDb({ path: ':memory:' });
    migrateDb(db);
    const app = express();
    app.use((req, res, next) => {
        const json = res.json.bind(res);
        const end  = res.end.bind(res);
        res.json = (...args) => { calls.json++; return json(...args); };
        res.end  = (...args) => { calls.end++; return end(...args); };
        next();
    });
    app.use(...bodyParsers());
    registerRoutes(app, [probe], { db, dev: false });
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
    server?.close();
    server?.closeAllConnections();
    db?.$client.close();
});


/** Runs one request whose handler throws `err`; returns the observed HTTP status and JSON body. */
async function requestThatThrows(err: unknown): Promise<{ status: number; body: any }> {
    thrown = err as null;
    calls = { json: 0, end: 0 };
    const res = await fetch(`${origin}/probe`);
    return { status: res.status, body: await res.json() as any };
}


describe('CHARACTERIZATION: error class → HTTP response', () => {
    beforeEach(() => { thrown = null; });


    describe('AuthorizationError → 401', () => {
        it('responds 401 with a null data envelope', async () => {
            const { status, body } = await requestThatThrows(new AuthorizationError());

            expect(status).toBe(401);
            expect(body).toEqual({ data: null, status: 'unauthorized' });
        });


        it('does not leak the error message', async () => {
            const { body } = await requestThatThrows(new AuthorizationError('super secret detail'));

            expect(JSON.stringify(body)).not.toContain('super secret detail');
        });


        // The branch is `instanceof`, so a subclass is still a 401.
        it('matches a SUBCLASS of AuthorizationError (401, message not leaked)', async () => {
            class DerivedAuthorizationError extends AuthorizationError {}
            const { status, body } = await requestThatThrows(new DerivedAuthorizationError('nope'));

            expect(status).toBe(401);
            expect(body).toEqual({ data: null, status: 'unauthorized' });
        });
    });


    describe('ValidationError → 400 with { errors }', () => {
        it('responds 400 and echoes the per-field error arrays', async () => {
            const { status, body } = await requestThatThrows(new ValidationError({
                name:  ['required'],
                judge_count: ['must be an integer', 'must be greater than or equal to 1'],
            }));

            expect(status).toBe(400);
            expect(body).toEqual({
                data: {
                    errors: {
                        name:        ['required'],
                        judge_count: ['must be an integer', 'must be greater than or equal to 1'],
                    },
                },
                status: 'bad request',
            });
        });


        it('nests the errors under data.errors, never at the top level', async () => {
            const { body } = await requestThatThrows(new ValidationError({ name: ['required'] }));

            expect(body).toHaveProperty('data.errors.name');
            expect(body).not.toHaveProperty('errors');
        });


        it('responds 400 with an empty errors object when the error carries none', async () => {
            const { status, body } = await requestThatThrows(new ValidationError({}));

            expect(status).toBe(400);
            expect(body).toEqual({ data: { errors: {} }, status: 'bad request' });
        });
    });


    describe('SQLite unique violation → 400 with per-field error arrays', () => {
        // The handler recognises a driver error by its `code` (SQLITE_CONSTRAINT*)
        // and its message, so an Error carrying both is the whole input.
        const driverError = (message: string, code = 'SQLITE_CONSTRAINT_UNIQUE') => Object.assign(new Error(message), { code });

        it('responds 400 with an array per violated column', async () => {
            const { status, body } = await requestThatThrows(driverError('UNIQUE constraint failed: mat_codes.mat_id, mat_codes.role'));

            expect(status).toBe(400);
            expect(body).toEqual({
                data: { errors: { mat_id: ['mat_id must be unique'], role: ['role must be unique'] } },
                status: 'bad request',
            });
        });


        // The driver message used to be echoed as a bare string under the
        // key "null", which the client cannot decode (every other value is a list).
        it('never adds a "null" key or the driver message', async () => {
            const { body } = await requestThatThrows(driverError('UNIQUE constraint failed: mat_codes.code'));

            expect(Object.keys(body.data.errors)).toEqual(['code']);
            expect(JSON.stringify(body)).not.toContain('SQLITE');
        });


        // Only a unique violation is a client-fixable duplicate.
        it('answers other constraint failures with the generic 500', async () => {
            const { status, body } = await requestThatThrows(driverError('NOT NULL constraint failed: users.name', 'SQLITE_CONSTRAINT_NOTNULL'));

            expect(status).toBe(500);
            expect(body).toEqual({ data: { error: 'NOT NULL constraint failed: users.name' }, status: 'server error' });
        });
    });


    describe('anything else → 500 with { error: message }', () => {
        it('responds 500 and echoes the error message', async () => {
            const { status, body } = await requestThatThrows(new Error('boom'));

            expect(status).toBe(500);
            expect(body).toEqual({ data: { error: 'boom' }, status: 'server error' });
        });


        it('responds 500 with a null message for a thrown non-Error', async () => {
            const { status, body } = await requestThatThrows({ name: 'NotAnError' });

            expect(status).toBe(500);
            expect(body).toEqual({ data: { error: null }, status: 'server error' });
        });


        it('uses the 500 branch for any Error subclass that is not one of the three', async () => {
            class TypeErrorish extends Error {}
            const { status, body } = await requestThatThrows(new TypeErrorish('unexpected'));

            expect(status).toBe(500);
            expect(body).toEqual({ data: { error: 'unexpected' }, status: 'server error' });
        });
    });


    describe('envelope invariants shared by all four mappings', () => {
        const cases: [string, unknown, number][] = [
            ['AuthorizationError',             new AuthorizationError(),                401],
            ['ValidationError',                new ValidationError({ a: ['b'] }),       400],
            ['SQLite unique violation',        Object.assign(new Error('UNIQUE constraint failed: t.a'), { code: 'SQLITE_CONSTRAINT_UNIQUE' }), 400],
            ['generic Error',                  new Error('x'),                          500],
        ];

        it.each(cases)('%s always renders { data, status } and ends the response', async (_label, err, expectedStatus) => {
            const { status, body } = await requestThatThrows(err);

            expect(status).toBe(expectedStatus);
            expect(Object.keys(body).sort()).toEqual(['data', 'status']);
            expect(calls.json).toBe(1);
            expect(calls.end).toBe(1);
        });


        it('maps every pinned status code to its statusText', async () => {
            // envelope.ts#statusText — the `status` half of the envelope.
            expect((await requestThatThrows(new AuthorizationError())).body.status).toBe('unauthorized');
            expect((await requestThatThrows(new ValidationError({}))).body.status).toBe('bad request');
            expect((await requestThatThrows(new Error('x'))).body.status).toBe('server error');
        });
    });
});
