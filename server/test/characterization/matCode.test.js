/**
 * CHARACTERIZATION — `MatCode.CODE_REGEXP` code-vs-UUID discrimination.
 *
 * `serverController.js#initCurrentMat` uses this regexp to decide whether the
 * `:matId` path segment of `GET /mat/:matId` is a word-code
 * ("morning.coffee.bicycle") or a primary key. A regression here silently
 * misroutes every mat lookup, so both the regexp itself and the branch it
 * drives are pinned.
 *
 * Consumed by task 12 (the request-state middleware that replaces
 * `#initCurrentMat`).
 *
 * NOTE (fidelity, not correctness): the regexp is UNANCHORED and built from
 * `\w`, so it matches anywhere in the string and accepts underscores and
 * digits. Both properties are asserted below because they are current
 * behavior, not because they are desirable. See FINDINGS.md F-12.
 */
const { afterEach, beforeEach, describe, expect, it, jest, mock } = require('bun:test');

// bun's mock.module() does not hoist (FINDINGS.md F-09.1) — these must precede
// the require() of the module under test.
const { MatCode: RealMatCode } = require('../../models/matCode');

const matCodeDouble = {
    ROLES:       RealMatCode.ROLES,
    CODE_REGEXP: RealMatCode.CODE_REGEXP,   // the real regexp, deliberately
    findByCode:  jest.fn(),
};
const matDouble  = { find: jest.fn() };
const userDouble = { findByApiToken: jest.fn() };

mock.module('../../models/matCode', () => ({ MatCode: matCodeDouble }));
mock.module('../../models/mat',     () => ({ Mat:     matDouble     }));
mock.module('../../models/user',    () => ({ User:    userDouble    }));
mock.module('../../models/match',   () => ({ Match:   { find: jest.fn() } }));

const { ServerController } = require('../../lib/server/serverController');
const { makeRequest, makeResponse } = require('../helpers/express');


class ProbeController extends ServerController {}


async function setupRequestStateFor(matId) {
    const controller = new ProbeController(makeRequest({ params: { matId } }), makeResponse());
    await controller.setupRequestState();
    return controller;
}


describe('CHARACTERIZATION: MatCode.CODE_REGEXP', () => {
    const CODE_REGEXP = RealMatCode.CODE_REGEXP;

    describe('the regexp itself', () => {
        it('is exactly /\\w+\\.\\w+\\.\\w+/', () => {
            expect(CODE_REGEXP.source).toBe('\\w+\\.\\w+\\.\\w+');
            expect(CODE_REGEXP.flags).toBe('');
        });


        it('matches a three-word dotted code', () => {
            expect(CODE_REGEXP.test('morning.coffee.bicycle')).toBe(true);
        });


        it('matches codes containing generated multi-word entries joined with _', () => {
            // WordGenerator replaces whitespace with '_', e.g. "blue whale".
            expect(CODE_REGEXP.test('blue_whale.manta_ray.sea_urchin')).toBe(true);
        });


        it('does NOT match a UUID', () => {
            expect(CODE_REGEXP.test('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
            expect(CODE_REGEXP.test('0f14d0ab-9605-4a62-a9e4-5ed26688389b')).toBe(false);
        });


        it('does NOT match a bare word or a two-word code', () => {
            expect(CODE_REGEXP.test('coffee')).toBe(false);
            expect(CODE_REGEXP.test('morning.coffee')).toBe(false);
        });


        it('is unanchored, so it matches a code embedded in a longer string', () => {
            // Current behavior, asserted for fidelity — not an endorsement.
            expect(CODE_REGEXP.test('!!morning.coffee.bicycle!!')).toBe(true);
            expect(CODE_REGEXP.test('a.b.c.d.e')).toBe(true);
        });


        it('accepts digits and underscores, since \\w is used rather than [a-z]', () => {
            expect(CODE_REGEXP.test('1.2.3')).toBe(true);
            expect(CODE_REGEXP.test('_._._')).toBe(true);
        });
    });


    describe('the branch it drives in ServerController#initCurrentMat', () => {
        beforeEach(() => {
            matDouble.find.mockReset();
            matCodeDouble.findByCode.mockReset();
            userDouble.findByApiToken.mockReset();
        });

        afterEach(() => { jest.clearAllMocks(); });


        it('resolves a word-code :matId through MatCode.findByCode, not Mat.find', async () => {
            const mat = { id: 'mat-1' };
            matCodeDouble.findByCode.mockResolvedValue({ mat_id: 'mat-1', getMat: async () => mat });

            const controller = await setupRequestStateFor('morning.coffee.bicycle');

            expect(matCodeDouble.findByCode).toHaveBeenCalledWith('morning.coffee.bicycle');
            expect(matDouble.find).not.toHaveBeenCalled();
            expect(controller.currentMat).toBe(mat);
            expect(controller.currentMatCode).not.toBeNull();
        });


        it('resolves a UUID :matId through Mat.find, not MatCode.findByCode', async () => {
            const mat = { id: '550e8400-e29b-41d4-a716-446655440000' };
            matDouble.find.mockResolvedValue(mat);

            const controller = await setupRequestStateFor('550e8400-e29b-41d4-a716-446655440000');

            expect(matDouble.find).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
            expect(matCodeDouble.findByCode).not.toHaveBeenCalled();
            expect(controller.currentMat).toBe(mat);
            expect(controller.currentMatCode).toBeNull();
        });


        it('leaves currentMat null when a word-code resolves to no MatCode', async () => {
            matCodeDouble.findByCode.mockResolvedValue(null);

            const controller = await setupRequestStateFor('no.such.code');

            expect(controller.currentMat).toBeNull();
            expect(controller.currentMatCode).toBeNull();
        });


        it('prefers an explicit matCode param over the matId branch entirely', async () => {
            const mat = { id: 'mat-1' };
            matCodeDouble.findByCode.mockResolvedValue({ mat_id: 'mat-1', getMat: async () => mat });

            const controller = new ProbeController(
                makeRequest({ params: { matCode: 'a.b.c', matId: '550e8400-e29b-41d4-a716-446655440000' } }),
                makeResponse(),
            );
            await controller.setupRequestState();

            expect(matCodeDouble.findByCode).toHaveBeenCalledWith('a.b.c');
            expect(matDouble.find).not.toHaveBeenCalled();
        });
    });
});
