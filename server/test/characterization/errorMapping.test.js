/**
 * CHARACTERIZATION — error class → HTTP status + response envelope.
 *
 * Pins `applicationServer.js#handleError` (lines ~268-292 at the time of
 * writing) and the envelope `serverController.js#formatJSONBody` wraps it in.
 *
 * Driven through `ApplicationServer#requestHandler` — the real production path
 * (setupRequestState → callbacks → action → performRequest → handleError →
 * render) — with Express request/response doubles, so both the status code and
 * the exact JSON body are observed as a client would see them.
 *
 * Consumed by task 12, which must reproduce all four mappings. The Sequelize
 * branch becomes a SQLite/Drizzle unique-violation branch, so its OUTPUT
 * shape is pinned independently of what triggers it.
 */
const { beforeEach, describe, expect, it, jest, mock } = require('bun:test');

// bun's mock.module() does not hoist (FINDINGS.md F-09.1). These keep
// setupRequestState() away from the database; no test here supplies an
// api token, a matId or a matchId, so none of them is actually consulted.
mock.module('../../models/matCode', () => ({ MatCode: { ROLES: { ADMIN: 'admin', VIEWER: 'viewer' }, CODE_REGEXP: /\w+\.\w+\.\w+/, findByCode: jest.fn() } }));
mock.module('../../models/mat',     () => ({ Mat:   { find: jest.fn() } }));
mock.module('../../models/match',   () => ({ Match: { find: jest.fn() } }));
mock.module('../../models/user',    () => ({ User:  { findByApiToken: jest.fn() } }));

const { ApplicationServer } = require('../../lib/server/applicationServer');
const { AuthorizationError,
        ServerController,
        ValidationError }   = require('../../lib/server/serverController');
const { makeRequest, makeResponse } = require('../helpers/express');


/** A controller whose single action throws whatever the test hands it. */
class ThrowingController extends ServerController {
    static thrown = null;
    async getProbe() { throw ThrowingController.thrown; }
}


/**
 * Runs one request end-to-end through ApplicationServer#requestHandler and
 * returns the observed HTTP status and JSON body.
 */
async function requestThatThrows(err) {
    ThrowingController.thrown = err;

    const server   = new ApplicationServer();
    const request  = makeRequest();
    const response = makeResponse();

    await server.requestHandler('getProbe', ThrowingController)(request, response);

    return { status: response.statusCode, body: response._body };
}


describe('CHARACTERIZATION: error class → HTTP response', () => {
    beforeEach(() => { ThrowingController.thrown = null; });


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


        // The branch is `err.constructor == AuthorizationError` — an exact
        // constructor identity check, NOT instanceof. A subclass therefore
        // falls through to the 500 branch. Pinned for fidelity; see F-13.
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
        // comparison), so a plain object with that name is a faithful stand-in
        // for the Sequelize instance.
        function uniqueConstraintError({ errors, parent } = {}) {
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


        // `errors[null] = err.parent.message` assigns a raw STRING under the
        // key "null", breaking the per-field array shape every other key has.
        // Pinned for fidelity; see FINDINGS.md F-14.
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
        const cases = [
            ['AuthorizationError',             new AuthorizationError(),                401],
            ['ValidationError',                new ValidationError({ a: ['b'] }),       400],
            ['SequelizeUniqueConstraintError', { name: 'SequelizeUniqueConstraintError', errors: [{ path: 'a', message: 'b' }] }, 400],
            ['generic Error',                  new Error('x'),                          500],
        ];

        it.each(cases)('%s always renders { data, status } and ends the response', async (_label, err, expectedStatus) => {
            ThrowingController.thrown = err;

            const server   = new ApplicationServer();
            const request  = makeRequest();
            const response = makeResponse();
            await server.requestHandler('getProbe', ThrowingController)(request, response);

            expect(response.statusCode).toBe(expectedStatus);
            expect(Object.keys(response._body).sort()).toEqual(['data', 'status']);
            expect(response.json).toHaveBeenCalledTimes(1);
            expect(response.end).toHaveBeenCalledTimes(1);
        });


        it('maps every pinned status code to its statusText', async () => {
            // serverController.js#statusText — the `status` half of the envelope.
            expect((await requestThatThrows(new AuthorizationError())).body.status).toBe('unauthorized');
            expect((await requestThatThrows(new ValidationError({}))).body.status).toBe('bad request');
            expect((await requestThatThrows(new Error('x'))).body.status).toBe('server error');
        });
    });
});
