import { describe, expect, it } from 'bun:test';
/**
 * `serializeMatch`, from plain fixture rows.
 * No database. Every output is also parsed through the schema.
 */
import * as S from '../../src/serialize';
import { matchSchema } from '../../src/contract';
import * as F from './fixtures';

const { at, iso, ID, USERS } = F;
const JUDGES = [USERS.judgeA, USERS.judgeB];
const NOW = at(600);

function render(graph, options = {}) {
    const out = S.serializeMatch(graph, { now: NOW, ...options });
    const parsed = matchSchema.safeParse(out);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    return out;
}

const BASE_KEYS = ['blue_competitor', 'break_duration', 'break_remaining', 'break_started_at', 'creator_id',
                   'ended_at', 'id', 'mat_id', 'red_competitor', 'started_at', 'winner'];

/** Three ended rounds: red wins on points, blue by submission, red by stoppage (match:done). */
const doneRounds = () => [
    F.round({ started: 20, ended: 90, ridingTimeVotes: F.votes(ID.red, JUDGES, 25, 85) }),
    F.round({ started: 100, ended: 160, declaredWinnerId: ID.blue, stoppage: false }),
    F.round({ started: 170, ended: 200, declaredWinnerId: ID.red, stoppage: true }),
];

describe('serializeMatch — base field set', () => {
    it('emits exactly the base keys; red_score / blue_score are ABSENT (not null), as are created_at / updated_at', () => {
        const out = render(F.matchGraph());
        expect(Object.keys(out).sort()).toEqual(BASE_KEYS);
        expect('red_score' in out).toBe(false);
        expect('blue_score' in out).toBe(false);
        expect(out).not.toHaveProperty('red_score');
        expect(out).not.toHaveProperty('blue_score');
        expect(out).not.toHaveProperty('created_at');
        expect(out).not.toHaveProperty('red_competitor_id');
    });

    it('values: ids, ISO timestamps, competitors as safe users', () => {
        const out = render(F.matchGraph({ ended_at: at(200) }));
        expect(out).toEqual({
            creator_id: ID.creator, id: ID.match, mat_id: ID.mat,
            started_at: iso(20), ended_at: iso(200),
            break_started_at: null, break_duration: null, break_remaining: null,
            red_competitor:  { id: ID.red, name: 'Rory Red' },
            blue_competitor: { id: ID.blue, name: 'Blair Blue' },
            winner: null,
        });
    });

    it('never carries an api_token anywhere, even with every association included', () => {
        const out = render(F.matchGraph({ rounds: doneRounds(), ended_at: at(200) }),
                           { includeMat: true, includeMatchJudges: true, includeRounds: true });
        for (const key of ['api_token', 'created_at', 'updated_at', 'red_score', 'blue_score', 'stoppage', 'declared_winner_id']) {
            expect([key, F.allKeys(out).has(key)]).toEqual([key, false]);
        }
    });

    it('a missing competitor row renders null, not absent', () => {
        const out = S.serializeMatch(F.matchGraph({ redCompetitor: null }), { now: NOW });
        expect(out.red_competitor).toBeNull();
        expect('red_competitor' in out).toBe(true);
    });

    it('renders the stored columns: break_duration 0 stays 0; a zero-length break has nothing remaining', () => {
        const out = render(F.matchGraph({ break_started_at: at(590), break_duration: 0 }));
        expect(out.break_duration).toBe(0);
        expect(out.break_remaining).toBeNull();
        expect(out.break_started_at).toBe(iso(590));
    });
});

describe('serializeMatch — break_remaining (computed on HTTP too)', () => {
    it('null when there is no break', () => {
        expect(render(F.matchGraph()).break_remaining).toBeNull();
    });

    it('break_duration - floor(elapsed seconds) during a break, from the injected now', () => {
        const g = F.matchGraph({ break_started_at: at(580), break_duration: 60 });
        expect(render(g).break_remaining).toBe(40);
        expect(S.serializeMatch(g, { now: new Date(at(580).getTime() + 999) }).break_remaining).toBe(60);
        expect(S.serializeMatch(g, { now: at(700) }).break_remaining).toBe(0); // clamps at 0, not null
    });

    it('present on every render, including partial payloads', () => {
        const g = F.matchGraph({ break_started_at: at(580), break_duration: 60 });
        expect(render(g, { includeRounds: true }).break_remaining).toBe(40);
        expect(S.serializeMatch(g, { now: NOW }).break_remaining).toBe(40);
    });
});

describe('serializeMatch — optional associations: absent unless included, never null', () => {
    it('no includes: mat, judges and rounds are all ABSENT', () => {
        const out = render(F.matchGraph({ rounds: doneRounds() }));
        for (const key of ['mat', 'judges', 'rounds']) expect([key, key in out]).toEqual([key, false]);
    });

    it('each flag adds exactly its key', () => {
        const g = F.matchGraph({ rounds: doneRounds() });
        expect(Object.keys(render(g, { includeMat: true })).filter((k) => !BASE_KEYS.includes(k))).toEqual(['mat']);
        expect(Object.keys(render(g, { includeMatchJudges: true })).filter((k) => !BASE_KEYS.includes(k))).toEqual(['judges']);
        expect(Object.keys(render(g, { includeRounds: true })).filter((k) => !BASE_KEYS.includes(k))).toEqual(['rounds']);
        expect(Object.keys(render(g, { includeMat: true, includeRounds: true })).filter((k) => !BASE_KEYS.includes(k)).sort())
            .toEqual(['mat', 'rounds']); // the round/ridingTime routes: judges ABSENT
    });

    it('included associations: bare mat, safe judges, rounds in order; empty lists stay [] (not null)', () => {
        const rounds = doneRounds();
        const out = render(F.matchGraph({ rounds }), { includeMat: true, includeMatchJudges: true, includeRounds: true });
        expect(out.mat).toEqual({ id: ID.mat, name: 'Main Mat', judge_count: 2, creator_id: ID.creator });
        expect(out.judges).toEqual([{ id: ID.judgeA, name: 'Jordan Judge' }, { id: ID.judgeB, name: 'Jamie Judge' }]);
        expect(out.rounds!.map((r) => r.id)).toEqual(rounds.map((r) => r.id));
        expect(out.rounds!.map((r) => r.result.method.type)).toEqual(['points', 'submission', 'stoppage']);

        const empty = render(F.matchGraph({ judges: [], rounds: [] }), { includeMatchJudges: true, includeRounds: true });
        expect([empty.judges, empty.rounds]).toEqual([[], []]);
    });

    it('includeMat with a missing mat row throws', () => {
        expect(() => S.serializeMatch(F.matchGraph({ mat: null }), { includeMat: true, now: NOW })).toThrow(TypeError);
        expect(() => S.serializeMatch(F.matchGraph({ mat: null }), { now: NOW })).not.toThrow();
    });
});

describe('serializeMatch — winner', () => {
    it('null (not absent) while fewer than maxRounds rounds have ended, even with a 2-0 lead (no early exit)', () => {
        const twoForRed = [
            F.round({ started: 20, ended: 90, declaredWinnerId: ID.red }),
            F.round({ started: 100, ended: 160, declaredWinnerId: ID.red }),
            F.round({ started: 170 }),
        ];
        const out = render(F.matchGraph({ rounds: twoForRed }));
        expect('winner' in out).toBe(true);
        expect(out.winner).toBeNull();
    });

    it('best of 3 ended rounds: red takes rounds 1 and 3 (match:done)', () => {
        const out = render(F.matchGraph({ rounds: doneRounds(), ended_at: at(200) }));
        expect(out.winner).toEqual({ id: ID.red, name: 'Rory Red' });
    });

    it('a draw on an ENDED match is null (valid, not an error)', () => {
        const rounds = [
            F.round({ started: 20, ended: 90, declaredWinnerId: ID.red }),
            F.round({ started: 100, ended: 160, declaredWinnerId: ID.blue }),
            F.round({ started: 170, ended: 200 }), // 0-0 tie
        ];
        expect(render(F.matchGraph({ rounds, ended_at: at(200) })).winner).toBeNull();
    });

    it('a 4th ended round counts, and the winner is the competitor ROW (null if missing)', () => {
        const rounds = [
            F.round({ started: 20, ended: 30, declaredWinnerId: ID.red }),
            F.round({ started: 40, ended: 50, declaredWinnerId: ID.blue }),
            F.round({ started: 60, ended: 70 }),
            F.round({ started: 80, ended: 90, declaredWinnerId: ID.blue }),
        ];
        expect(render(F.matchGraph({ rounds })).winner).toEqual({ id: ID.blue, name: 'Blair Blue' });
        expect(S.serializeMatch(F.matchGraph({ rounds, blueCompetitor: { ...USERS.blue, name: 'Renamed' } }), { now: NOW }).winner)
            .toEqual({ id: ID.blue, name: 'Renamed' });
    });

    it('scored winners stop an open vote on an ended round at its ended_at, whatever now is', () => {
        const rounds = [
            F.round({ started: 20, ended: 30, declaredWinnerId: ID.blue }),
            F.round({ started: 40, ended: 50, declaredWinnerId: ID.red }),
            F.round({ started: 60, ended: 70, ridingTimeVotes: F.votes(ID.red, JUDGES, 65, null) }),
        ];
        // 65s to 70s is 1 pt for red, which decides the match 2-1.
        expect(S.serializeMatch(F.matchGraph({ rounds }), { now: at(66) }).winner!.id).toBe(ID.red);
        expect(S.serializeMatch(F.matchGraph({ rounds }), { now: at(80) }).winner!.id).toBe(ID.red);
    });
});

describe('serializeMatch never carries a credential', () => {
    it('no key anywhere in a fully rendered match is api_token, created_at or updated_at', () => {
        const g = F.matchGraph({ rounds: doneRounds(), ended_at: at(200), break_started_at: at(590), break_duration: 60 });
        const out = S.serializeMatch(g, { now: NOW, includeMat: true, includeMatchJudges: true, includeRounds: true });
        const keys = F.allKeys(out);
        for (const key of ['api_token', 'created_at', 'updated_at']) expect(keys.has(key)).toBe(false);
        expect(out.red_competitor).toEqual({ id: USERS.red.id, name: USERS.red.name });
        expect(out.winner).toEqual({ id: USERS.red.id, name: USERS.red.name });
    });
});
