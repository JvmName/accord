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
import { legacyBodyParsers, registerRoutes } from '../../src/http/router';


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
    app.use(...legacyBodyParsers());
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


        // The branch is `err.constructor === AuthorizationError`: an exact
        // constructor identity check, NOT instanceof. A subclass therefore
        // falls through to the 500 branch. Pinned for fidelity.
        it('does NOT match a SUBCLASS of AuthorizationError (falls through to 500)', async () => {
            class DerivedAuthorizationError extends AuthorizationError {}
            const { status, body } = await requestThatThrows(new DerivedAuthorizationError('nope'));

            expect(status).toBe(500);
            expect(body).toEqual({ data: { error: 'nope' }, status: 'server error' });
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


    describe('SequelizeUniqueConstraintError → 400 with per-field error arrays', () => {
        // Matched by `err.name == 'SequelizeUniqueConstraintError'` (a string
        // comparison), so a plain object with that name is the whole input.
        function uniqueConstraintError({ errors, parent }: { errors?: unknown; parent?: unknown } = {}) {
            return {
                name:   'SequelizeUniqueConstraintError',
                errors: errors || [{ path: 'code', message: 'code must be unique' }],
                parent,
            };
        }

        it('responds 400 and groups messages into an array per column', async () => {
            const { status, body } = await requestThatThrows(uniqueConstraintError({
                errors: [
                    { path: 'code', message: 'code must be unique' },
                    { path: 'code', message: 'code is already taken' },
                    { path: 'name', message: 'name must be unique' },
                ],
            }));

            expect(status).toBe(400);
            expect(body).toEqual({
                data: {
                    errors: {
                        code: ['code must be unique', 'code is already taken'],
                        name: ['name must be unique'],
                    },
                },
                status: 'bad request',
            });
        });


        // The driver message goes under the key "null" as a raw STRING,
        // breaking the per-field array shape every other key has. Pinned for
        // fidelity.
        it('adds the driver message under the literal key "null", as a bare string', async () => {
            const { status, body } = await requestThatThrows(uniqueConstraintError({
                errors: [{ path: 'code', message: 'code must be unique' }],
                parent: { message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: mat_codes.code' },
            }));

            expect(status).toBe(400);
            expect(body.data.errors).toEqual({
                code:   ['code must be unique'],
                'null': 'SQLITE_CONSTRAINT: UNIQUE constraint failed: mat_codes.code',
            });
            expect(Array.isArray(body.data.errors['null'])).toBe(false);
        });


        it('omits the "null" key entirely when there is no parent error', async () => {
            const { body } = await requestThatThrows(uniqueConstraintError());

            expect(Object.keys(body.data.errors)).toEqual(['code']);
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
            ['SequelizeUniqueConstraintError', { name: 'SequelizeUniqueConstraintError', errors: [{ path: 'a', message: 'b' }] }, 400],
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
