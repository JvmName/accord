/**
 * Task 12 — DIFFERENTIAL test of the ported permission rules
 * (`src/http/permissions.ts`) against the legacy `lib/server/authorizer.js`.
 *
 * Both are evaluated over the full grid of
 *     subject (user x mat code) x scope (every kind, incl. null) x action (every known + unknown)
 * and must agree on every cell (grant/deny, or both throwing the same error).
 * The legacy side gets Sequelize model INSTANCES (its dispatch reads
 * `scope.constructor.name`, F-53); the new side gets plain rows with the scope
 * kind made explicit, and relationship reads through `PermissionLoaders`
 * returning the same data the legacy instances return.
 *
 * Also restates `test/server/authorizer.test.js` (which dies with the class in
 * task 15) against the new module, grants AND denies.
 */
import { describe, expect, it } from 'bun:test';
import type { Mat, MatCode, Match, User } from '../../src/db/types';
import { can, type PermissionLoaders, type Scope, type Subject } from '../../src/http/permissions';

/* eslint-disable @typescript-eslint/no-require-imports */
const { Authorizer }        = require('../../lib/server/authorizer');
const { Mat: LegacyMat }    = require('../../models/mat');
const { Match: LegacyMatch } = require('../../models/match');
const { MatCode: LegacyMatCode } = require('../../models/matCode');
const { User: LegacyUser }  = require('../../models/user');
/* eslint-enable @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------------------
// The world, in plain data.
// ---------------------------------------------------------------------------

const USERS = { creator: 'u-creator', judge: 'u-judge', other: 'u-other', creator2: 'u-creator2' } as const;
const MATS  = { mat1: { id: 'mat-1', creator_id: USERS.creator }, mat2: { id: 'mat-2', creator_id: USERS.creator2 } };

const MATCHES = {
    // started match on mat1, judged by `judge`
    matchA: { id: 'match-a', mat_id: MATS.mat1.id, judges: [USERS.judge] },
    // match on mat2 with no judges
    matchB: { id: 'match-b', mat_id: MATS.mat2.id, judges: [] as string[] },
    // match whose mat row is missing (impossible through the API): `manage` throws on both sides
    matchOrphan: { id: 'match-orphan', mat_id: 'mat-missing', judges: [USERS.judge] },
} as const;

const MAT_CODES = {
    none:        null,
    mat1Admin:   { mat_id: MATS.mat1.id, role: 'admin' },
    mat1Viewer:  { mat_id: MATS.mat1.id, role: 'viewer' },
    mat2Admin:   { mat_id: MATS.mat2.id, role: 'admin' },
    mat2Viewer:  { mat_id: MATS.mat2.id, role: 'viewer' },
    mat1OddRole: { mat_id: MATS.mat1.id, role: 'ADMIN' },
} as const;

const SUBJECT_USERS = { anonymous: null, ...USERS } as const;

const ACTIONS = ['assign', 'create a match', 'create', 'be assigned judge', 'view', 'judge', 'manage', 'pause', 'bogus'] as const;

type ScopeCase = { label: string; legacy: () => unknown; modern: () => Scope };

const matById = (id: string) => Object.values(MATS).find(m => m.id === id) ?? null;

function legacyMatch(m: { id: string; mat_id: string; judges: readonly string[] }) {
    const match = new LegacyMatch({ id: m.id, mat_id: m.mat_id });
    match.getJudges = async () => m.judges.map(id => new LegacyUser({ id }));
    match.getMat    = async () => { const mat = matById(m.mat_id); return mat ? new LegacyMat(mat) : null; };
    return match;
}

const SCOPES: ScopeCase[] = [
    ...['test', 'authenticated', 'unauthenticated', 'something-else', ''].map((value): ScopeCase => ({
        label: `string '${value}'`, legacy: () => value, modern: () => ({ kind: 'string', value }),
    })),
    { label: 'Mat class', legacy: () => LegacyMat, modern: () => ({ kind: 'matClass' }) },
    { label: 'mat null', legacy: () => null, modern: () => ({ kind: 'mat', mat: null }) },
    ...Object.entries(MATS).map(([label, mat]): ScopeCase => ({
        label, legacy: () => new LegacyMat(mat), modern: () => ({ kind: 'mat', mat: mat as unknown as Mat }),
    })),
    { label: 'match null', legacy: () => null, modern: () => ({ kind: 'match', match: null }) },
    ...Object.entries(MATCHES).map(([label, m]): ScopeCase => ({
        label, legacy: () => legacyMatch(m), modern: () => ({ kind: 'match', match: { id: m.id, mat_id: m.mat_id } as unknown as Match }),
    })),
    { label: 'user null', legacy: () => null, modern: () => ({ kind: 'user', user: null }) },
    { label: 'user other', legacy: () => new LegacyUser({ id: USERS.other }), modern: () => ({ kind: 'user', user: { id: USERS.other } as unknown as User }) },
];

const loaders: PermissionLoaders = {
    matchJudges: async match => Object.values(MATCHES).find(m => m.id === match.id)!.judges.map(id => ({ id })),
    matchMat:    async match => matById(match.mat_id),
};

async function outcome(fn: () => Promise<unknown>): Promise<string> {
    try {
        return Boolean(await fn()) ? 'GRANT' : 'deny';
    } catch (err) {
        return `THROW ${(err as Error)?.constructor?.name}: ${(err as Error)?.message}`;
    }
}

describe('permissions: differential against the legacy Authorizer', () => {
    it('agrees on every (subject x scope x action) cell', async () => {
        const mismatches: string[] = [];
        let cells = 0;
        let grants = 0;
        let denies = 0;

        for (const [userLabel, userId] of Object.entries(SUBJECT_USERS)) {
            for (const [codeLabel, code] of Object.entries(MAT_CODES)) {
                const legacyAuthorizer = new Authorizer(
                    userId ? new LegacyUser({ id: userId }) : null,
                    code ? new LegacyMatCode(code) : undefined,
                );
                const subject: Subject = {
                    user:    userId ? ({ id: userId } as unknown as User) : null,
                    matCode: code ? (code as unknown as MatCode) : null,
                };

                for (const scope of SCOPES) {
                    for (const action of ACTIONS) {
                        cells++;
                        const legacy = await outcome(() => legacyAuthorizer.can(action, scope.legacy()));
                        const modern = await outcome(() => can(subject, action as never, scope.modern(), loaders));
                        if (legacy === 'GRANT') grants++;
                        if (legacy === 'deny') denies++;
                        if (legacy !== modern) mismatches.push(`${userLabel}/${codeLabel} ${action} on ${scope.label}: legacy=${legacy} new=${modern}`);
                    }
                }
            }
        }

        expect(mismatches).toEqual([]);
        // The grid must exercise both answers heavily, or agreement means nothing.
        expect(cells).toBe(Object.keys(SUBJECT_USERS).length * Object.keys(MAT_CODES).length * SCOPES.length * ACTIONS.length);
        expect(grants).toBeGreaterThan(200);
        expect(denies).toBeGreaterThan(200);
    });
});

describe('permissions: authorizer.test.js restated against the new module', () => {
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

    it('match pause PERMISSION: creator or judge (the route never reaches the judge branch, F-11)', async () => {
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
