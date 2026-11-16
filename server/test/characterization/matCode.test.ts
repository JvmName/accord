/**
 * CHARACTERIZATION — `CODE_REGEXP` code-vs-UUID discrimination.
 *
 * Request-state resolution (`src/http/middleware/requestState.ts`) uses this
 * regexp to decide whether the `:matId` path segment of `GET /mat/:matId` is a
 * word code ("morning.coffee.bicycle") or a primary key. A regression here
 * silently misroutes every mat lookup, so both the regexp itself and the
 * branch it drives are pinned.
 *
 * NOTE: the regexp is anchored (it used to match a dotted triple
 * anywhere in the string) and built from `\w`, so it accepts underscores and
 * digits.
 *
 * The branch is observed on a real database with decoys: a mat whose id is
 * the code string itself, and a mat code whose code is the UUID string, so a
 * lookup down the wrong branch finds the decoy instead of the expected mat.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createDb, migrateDb, schema } from '../../src/db';
const MatCodes = require('../../src/domain/matCode');
import { resolveRequestState } from '../../src/http/middleware/requestState';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const STAMPS = { created_at: new Date(0), updated_at: new Date(0) };

let db;

beforeAll(async () => {
    db = createDb({ path: ':memory:' });
    migrateDb(db);
    await db.insert(schema.mats).values([
        { id: 'mat-1', name: 'Mat 1', creator_id: 'u', ...STAMPS },
        { id: UUID, name: 'Mat by id', creator_id: 'u', ...STAMPS },
        // decoys: a mat whose primary key IS a code string
        { id: 'morning.coffee.bicycle', name: 'decoy: id is a code', creator_id: 'u', ...STAMPS },
        { id: 'no.such.code', name: 'decoy: id is an unknown code', creator_id: 'u', ...STAMPS },
    ]);
    await db.insert(schema.mat_codes).values([
        { id: 'c1', mat_id: 'mat-1', code: 'morning.coffee.bicycle', role: 'admin', ...STAMPS },
        { id: 'c2', mat_id: 'mat-1', code: 'a.b.c', role: 'viewer', ...STAMPS },
        // decoy: a mat code whose code IS the UUID
        { id: 'c3', mat_id: 'mat-1', code: UUID, role: 'other', ...STAMPS },
    ]);
});

afterAll(() => db?.$client.close());

/** Request state for a request with these path params and nothing else. */
function setupRequestStateFor(params: Record<string, string>) {
    // The resolver reads only these four properties of the request.
    const request = { headers: {}, params, body: {}, query: {} } as unknown as Parameters<typeof resolveRequestState>[1];
    return resolveRequestState(db, request, { scope: 'mat', level: 'view' });
}


describe('CHARACTERIZATION: CODE_REGEXP', () => {
    const CODE_REGEXP = MatCodes.CODE_REGEXP;

    describe('the regexp itself', () => {
        it('is exactly /^\\w+\\.\\w+\\.\\w+$/', () => {
            expect(CODE_REGEXP.source).toBe('^\\w+\\.\\w+\\.\\w+$');
            expect(CODE_REGEXP.flags).toBe('');
        });


        it('matches a three-word dotted code', () => {
            expect(CODE_REGEXP.test('morning.coffee.bicycle')).toBe(true);
        });


        it('matches codes containing generated multi-word entries joined with _', () => {
            // The word generator replaces whitespace with '_', e.g. "blue whale".
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


        it('is anchored, so it does not match a code embedded in a longer string', () => {
            expect(CODE_REGEXP.test('!!morning.coffee.bicycle!!')).toBe(false);
            expect(CODE_REGEXP.test('a.b.c.d.e')).toBe(false);
            expect(CODE_REGEXP.test('a.b.c\n')).toBe(false);
        });


        it('accepts digits and underscores, since \\w is used rather than [a-z]', () => {
            expect(CODE_REGEXP.test('1.2.3')).toBe(true);
            expect(CODE_REGEXP.test('_._._')).toBe(true);
        });
    });


    describe('the branch it drives in request-state resolution', () => {
        it('resolves a word-code :matId through the mat-code lookup, not the mat lookup', async () => {
            const state = await setupRequestStateFor({ matId: 'morning.coffee.bicycle' });

            expect(state.currentMatCode?.code).toBe('morning.coffee.bicycle');
            expect(state.currentMat?.id).toBe('mat-1');      // not the decoy mat with that id
            expect(state.currentMatCode).not.toBeNull();
        });


        it('resolves a UUID :matId through the mat lookup, not the mat-code lookup', async () => {
            const state = await setupRequestStateFor({ matId: UUID });

            expect(state.currentMat?.id).toBe(UUID);
            expect(state.currentMat?.name).toBe('Mat by id'); // not mat-1 through the decoy code
            expect(state.currentMatCode).toBeNull();
        });


        it('leaves currentMat null when a word-code resolves to no mat code', async () => {
            const state = await setupRequestStateFor({ matId: 'no.such.code' });

            expect(state.currentMat).toBeNull();               // the decoy mat with that id is never looked up
            expect(state.currentMatCode).toBeNull();
        });


        it('prefers an explicit matCode param over the matId branch entirely', async () => {
            const state = await setupRequestStateFor({ matCode: 'a.b.c', matId: UUID });

            expect(state.currentMatCode?.code).toBe('a.b.c');
            expect(state.currentMat?.id).toBe('mat-1');      // not the mat whose id is matId
        });
    });
});
