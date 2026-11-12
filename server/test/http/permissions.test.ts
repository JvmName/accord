/**
 * The permission rules (`src/http/permissions.ts`) over the full grid of
 *     subject (user x mat code) x scope (every kind, incl. null) x action (every known + unknown)
 * against the `permissions` snapshot fixture (grant, deny, or the thrown
 * error, per cell; see ./permissionGrid.ts), then the individual rules
 * restated case by case, grants AND denies.
 */
import { describe, expect, it } from 'bun:test';
import type { Mat, MatCode, Match, User } from '../../src/db/types';
import { can, type PermissionLoaders, type Subject } from '../../src/http/permissions';

/* eslint-disable @typescript-eslint/no-require-imports */
import * as G from './permissionGrid';
import * as F from '../support/frozen';
/* eslint-enable @typescript-eslint/no-require-imports */

const { USERS, MATS, MATCHES, MAT_CODES } = G;

const loaders: PermissionLoaders = {
    matchJudges: async match => (Object.values(MATCHES) as Array<{ id: string; judges: string[] }>).find(m => m.id === match.id)!.judges.map(id => ({ id })) as never,
    matchMat:    async match => G.matById(match.mat_id),
};

describe('permissions: the full grid against the snapshot', () => {
    it('agrees on every (subject x scope x action) cell', async () => {
        const fixture = F.readFixture('permissions');
        const actual: Array<{ key: string }> = await G.recordGrid(G.currentRules());
        expect(actual.map(r => r.key)).toEqual([...fixture.records.keys()]);
        const mismatches: string[] = [];
        for (const record of actual) {
            const recorded = fixture.records.get(record.key);
            if (JSON.stringify(F.asStored(record)) !== JSON.stringify(recorded)) mismatches.push(`${record.key}: now ${JSON.stringify(record)} recorded ${JSON.stringify(recorded)}`);
        }
        expect(mismatches).toEqual([]);

        // The grid must exercise both answers heavily, or agreement means nothing.
        const axes = fixture.records.get('axes');
        const cells = [...fixture.records.values()].filter(r => r.key !== 'axes').flatMap(r => r.rows as string[]).join('');
        expect(cells.length).toBe(G.CELLS);
        expect(cells.length).toBe(axes.users.length * axes.codes.length * axes.scopes.length * axes.actions.length);
        expect(cells.length).toBe(4050);
        expect([...cells].filter(c => c === 'G').length).toBeGreaterThan(200);
        expect([...cells].filter(c => c === 'd').length).toBeGreaterThan(200);
    });
});

describe('permissions: each rule, grants and denies', () => {
    const subject = (user: string | null, code: (typeof MAT_CODES)[keyof typeof MAT_CODES] = null): Subject => ({
        user: user ? ({ id: user } as unknown as User) : null,
        matCode: code as unknown as MatCode | null,
    });
    const mat1   = { kind: 'mat', mat: MATS.mat1 as unknown as Mat } as const;
    const matchA = { kind: 'match', match: { id: MATCHES.matchA.id, mat_id: MATCHES.matchA.mat_id } as unknown as Match } as const;

    it('string scopes: `test` grants, anything unknown denies', async () => {
        expect(await can(subject(null), 'x', { kind: 'string', value: 'test' }, loaders)).toBe(true);
        expect(await can(subject(null), 'x', { kind: 'string', value: 'nope' }, loaders)).toBe(false);
        expect(await can(subject(null), 'x', { kind: 'string', value: 'authenticated' }, loaders)).toBe(false);
        expect(await can(subject(USERS.other), 'x', { kind: 'string', value: 'authenticated' }, loaders)).toBe(true);
    });

    it('mat assign / create a match: only the ADMIN code OF THIS MAT', async () => {
        for (const action of ['assign', 'create a match'] as const) {
            expect(await can(subject(USERS.other, MAT_CODES.mat1Admin), action, mat1, loaders)).toBe(true);
            expect(await can(subject(USERS.other, MAT_CODES.mat2Admin), action, mat1, loaders)).toBe(false);
            expect(await can(subject(USERS.other, MAT_CODES.mat1Viewer), action, mat1, loaders)).toBe(false);
            expect(await can(subject(USERS.creator), action, mat1, loaders)).toBe(false);
        }
    });

    it('mat create: any user, no code needed; anonymous denied', async () => {
        expect(await can(subject(USERS.other), 'create', { kind: 'matClass' }, loaders)).toBe(true);
        expect(await can(subject(null), 'create', { kind: 'matClass' }, loaders)).toBe(false);
    });

    it('mat be assigned judge / view: unconditional for a mat; null mat denied', async () => {
        expect(await can(subject(null), 'be assigned judge', mat1, loaders)).toBe(true);
        expect(await can(subject(null), 'view', mat1, loaders)).toBe(true);
        expect(await can(subject(USERS.creator), 'view', { kind: 'mat', mat: null }, loaders)).toBe(false);
    });

    it('match judge: only a judge of the match', async () => {
        expect(await can(subject(USERS.judge), 'judge', matchA, loaders)).toBe(true);
        expect(await can(subject(USERS.creator), 'judge', matchA, loaders)).toBe(false);
        expect(await can(subject(USERS.other), 'judge', matchA, loaders)).toBe(false);
        expect(await can(subject(null), 'judge', matchA, loaders)).toBe(false);
    });

    it('match manage: only the mat creator', async () => {
        expect(await can(subject(USERS.creator), 'manage', matchA, loaders)).toBe(true);
        expect(await can(subject(USERS.judge), 'manage', matchA, loaders)).toBe(false);
        expect(await can(subject(null), 'manage', matchA, loaders)).toBe(false);
    });

    it('match pause PERMISSION: creator or judge (the route never reaches the judge branch)', async () => {
        expect(await can(subject(USERS.creator), 'pause', matchA, loaders)).toBe(true);
        expect(await can(subject(USERS.judge), 'pause', matchA, loaders)).toBe(true);
        expect(await can(subject(USERS.other), 'pause', matchA, loaders)).toBe(false);
    });

    it('match view: unconditional for a match; null match denied', async () => {
        expect(await can(subject(null), 'view', matchA, loaders)).toBe(true);
        expect(await can(subject(USERS.creator), 'view', { kind: 'match', match: null }, loaders)).toBe(false);
    });

    it('user assign: any existing user; a null user (unknown id) denied', async () => {
        expect(await can(subject(USERS.creator), 'assign', { kind: 'user', user: { id: USERS.other } as unknown as User }, loaders)).toBe(true);
        expect(await can(subject(USERS.creator), 'assign', { kind: 'user', user: null }, loaders)).toBe(false);
    });
});
