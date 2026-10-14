const { describe, expect, it } = require('bun:test');
/**
 * `serializeMat`, `serializeUser(s)`, `serializeMatCode` (task 11), from plain
 * fixture rows. No database. Outputs are parsed through the task-05 schemas.
 */
const S = require('../../src/serialize');
const { matSchema, matCodeSchema, userSchema, leakedUserSchema } = require('../../src/contract');
const F = require('./fixtures');

const { at, ID, USERS } = F;
const NOW = at(600);

function renderMat(mat, options = {}) {
    const out = S.serializeMat(mat, { now: NOW, ...options });
    const parsed = matSchema.safeParse(out);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    return out;
}

const matchOn = (key, created, started) => F.matchGraph({
    id: F.uuid(key), created_at: at(created), started_at: started == null ? null : at(started),
});

describe('serializeUser / serializeUsers', () => {
    it('emits exactly {id, name}: never api_token, created_at, updated_at', () => {
        const out = S.serializeUser(USERS.red);
        expect(out).toEqual({ id: ID.red, name: 'Rory Red' });
        expect(Object.keys(out).sort()).toEqual(['id', 'name']);
        expect(userSchema.safeParse(out).success).toBe(true);
    });

    it('legacy `|| null`: an empty name renders null (F-63)', () => {
        expect(S.serializeUser({ ...USERS.red, name: '' }).name).toBeNull();
    });

    it('serializeNullableUser: null for a missing row; serializeUsers keeps order', () => {
        expect(S.serializeNullableUser(null)).toBeNull();
        expect(S.serializeNullableUser(undefined)).toBeNull();
        expect(S.serializeUsers([USERS.judgeB, USERS.judgeA]).map((u) => u.id)).toEqual([ID.judgeB, ID.judgeA]);
        expect(S.serializeUsers([])).toEqual([]);
    });

    it('serializeLeakedUser (F-22, ws only): every column, raw values, ISO dates', () => {
        const out = S.serializeLeakedUser({ ...USERS.red, name: '' });
        expect(out).toEqual({ id: ID.red, name: '', api_token: USERS.red.api_token,
                              created_at: USERS.red.created_at.toISOString(), updated_at: USERS.red.updated_at.toISOString() });
        expect(S.serializeNullableLeakedUser(null)).toBeNull();
        expect(leakedUserSchema.safeParse(S.serializeLeakedUser(USERS.red)).success).toBe(true);
    });
});

describe('serializeMatCode', () => {
    it('emits exactly {code, role}', () => {
        const row = { id: 'x', mat_id: ID.mat, code: 'alpha.bravo.charlie', role: 'admin', created_at: at(0), updated_at: at(0) };
        const out = S.serializeMatCode(row);
        expect(out).toEqual({ code: 'alpha.bravo.charlie', role: 'admin' });
        expect(matCodeSchema.safeParse(out).success).toBe(true);
    });
});

describe('serializeMat — base keys', () => {
    it('id, name, judge_count, creator_id only; every association ABSENT when not given', () => {
        const out = renderMat(F.mat());
        expect(out).toEqual({ id: ID.mat, name: 'Main Mat', judge_count: 2, creator_id: ID.creator });
        for (const key of ['judges', 'codes', 'current_match', 'upcoming_matches', 'created_at', 'updated_at']) {
            expect([key, key in out]).toEqual([key, false]);
        }
    });

    it('legacy `|| null`: judge_count 0 renders null (F-63); null stays null', () => {
        expect(renderMat(F.mat({ judge_count: 0 })).judge_count).toBeNull();
        expect(renderMat(F.mat({ judge_count: null })).judge_count).toBeNull();
    });
});

describe('serializeMat — includes', () => {
    it('judges: safe users, in the given order; [] stays []', () => {
        expect(renderMat(F.mat(), { judges: [USERS.judgeA, USERS.judgeB] }).judges)
            .toEqual([{ id: ID.judgeA, name: 'Jordan Judge' }, { id: ID.judgeB, name: 'Jamie Judge' }]);
        expect(renderMat(F.mat(), { judges: [] }).judges).toEqual([]);
    });

    it('codes: {code, role} each, only when given (POST /mats)', () => {
        const codes = [{ code: 'a.b.c', role: 'admin' }, { code: 'd.e.f', role: 'viewer' }];
        const out = renderMat(F.mat(), { codes });
        expect(out.codes).toEqual(codes);
        expect('codes' in renderMat(F.mat(), { judges: [] })).toBe(false);
    });

    it('incompleteMatches -> current_match + upcoming_matches; no started match -> current_match NULL (not absent)', () => {
        const out = renderMat(F.mat(), { incompleteMatches: [] });
        expect('current_match' in out).toBe(true);
        expect(out.current_match).toBeNull();
        expect(out.upcoming_matches).toEqual([]);
    });

    it('current = the earliest-CREATED started match (stable sort), upcoming = the not-started ones in created order', () => {
        const laterStarted   = matchOn('f10', 50, 100);
        const earlierStarted = matchOn('f11', 30, 470);
        const upcomingB      = matchOn('f12', 80, null);
        const upcomingA      = matchOn('f13', 40, null);
        const out = renderMat(F.mat(), { incompleteMatches: [laterStarted, upcomingB, earlierStarted, upcomingA] });
        expect(out.current_match.id).toBe(earlierStarted.id);
        expect(out.upcoming_matches.map((m) => m.id)).toEqual([upcomingA.id, upcomingB.id]);
        // a started match that is not the first is in NEITHER list (as legacy)
        expect([out.current_match.id, ...out.upcoming_matches.map((m) => m.id)]).not.toContain(laterStarted.id);
    });

    it('equal created_at keeps the given order (stable)', () => {
        const a = matchOn('f20', 30, 100);
        const b = matchOn('f21', 30, 100);
        expect(renderMat(F.mat(), { incompleteMatches: [b, a] }).current_match.id).toBe(b.id);
    });

    it('nested matches are PARTIAL payloads: no mat / judges / rounds keys, but winner and break_remaining present', () => {
        const m = F.matchGraph({ id: F.uuid('f30'), break_started_at: at(580), break_duration: 60, rounds: [F.round({ started: 20, ended: 90 })] });
        const out = renderMat(F.mat(), { incompleteMatches: [m] });
        for (const key of ['mat', 'judges', 'rounds']) expect([key, key in out.current_match]).toEqual([key, false]);
        expect(out.current_match.winner).toBeNull();
        expect(out.current_match.break_remaining).toBe(40); // injected now reaches the nested match
        expect('red_score' in out.current_match).toBe(false);
    });

    it('splitIncompleteMatches does not reorder its input', () => {
        const input = [matchOn('f40', 50, null), matchOn('f41', 30, null)];
        const ids = input.map((m) => m.id);
        S.splitIncompleteMatches(input);
        expect(input.map((m) => m.id)).toEqual(ids);
    });
});
