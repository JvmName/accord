const { describe, expect, it } = require('bun:test');
/**
 * `serializeRound` / `serializeLeakedRound` (task 11), from plain fixture rows.
 * No database. Every output is also parsed through the task-05 schema.
 */
const S = require('../../src/serialize');
const { roundSchema, leakedRoundSchema } = require('../../src/contract');
const F = require('./fixtures');

const { at, iso, ID, USERS } = F;
const JUDGES = [USERS.judgeA, USERS.judgeB];
const NOW = at(600);

/** Render `rounds[index]` of a match holding `rounds`, and schema-check it. */
function render(rounds, index = rounds.length - 1, now = NOW, overrides = {}) {
    const match = F.matchGraph({ rounds, ...overrides });
    const out = S.serializeRound(match, rounds[index], { now });
    expect(roundSchema.safeParse(out).success).toBe(true);
    return out;
}

const WIRE_KEYS = ['ended_at', 'id', 'max_duration', 'paused', 'result', 'score', 'started_at', 'time_remaining'];

describe('serializeRound — field set', () => {
    it('emits exactly the eight wire keys; stoppage / declared_winner_id / match_id / timestamps never', () => {
        const r = F.round({ started: 20, ended: 90, declaredWinnerId: ID.red, stoppage: true });
        const out = render([r]);
        expect(Object.keys(out).sort()).toEqual(WIRE_KEYS);
        expect(Object.keys(out.result).sort()).toEqual(['method', 'winner']);
        expect(Object.keys(out.result.method).sort()).toEqual(['type', 'value']);
        expect(out.id).toBe(r.id);
        expect(out.started_at).toBe(iso(20)); // started_at IS created_at
        expect(out.ended_at).toBe(iso(90));
    });

    it('score is keyed by the MATCH competitor ids, for exactly the two competitors', () => {
        const out = render([F.round({ started: 20, ended: 90 })]);
        expect(out.score).toEqual({ [ID.red]: 0, [ID.blue]: 0 });
    });

    it('result.winner is the SAFE user {id, name}; the leaked variant carries api_token (F-22)', () => {
        const rounds = [F.round({ started: 20, ended: 90, declaredWinnerId: ID.blue, stoppage: false })];
        const match = F.matchGraph({ rounds });
        expect(S.serializeRound(match, rounds[0], { now: NOW }).result.winner).toEqual({ id: ID.blue, name: 'Blair Blue' });
        const leaked = S.serializeLeakedRound(match, rounds[0], { now: NOW });
        expect(leakedRoundSchema.safeParse(leaked).success).toBe(true);
        expect(leaked.result.winner).toEqual({
            id: ID.blue, name: 'Blair Blue', api_token: USERS.blue.api_token,
            created_at: USERS.blue.created_at.toISOString(), updated_at: USERS.blue.updated_at.toISOString(),
        });
    });
});

describe('serializeRound — result for every win method (domain-derived)', () => {
    it('SUBMISSION: declared winner, stoppage false -> winner, type submission, value null', () => {
        const out = render([F.round({ started: 20, ended: 90, declaredWinnerId: ID.red, stoppage: false })]);
        expect(out.result).toEqual({ winner: { id: ID.red, name: 'Rory Red' }, method: { type: 'submission', value: null } });
    });

    it('SUBMISSION also when stoppage is NULL (only truthiness is read)', () => {
        const out = render([F.round({ started: 20, ended: 90, declaredWinnerId: ID.blue, stoppage: null })]);
        expect(out.result.method).toEqual({ type: 'submission', value: null });
    });

    it('STOPPAGE: declared winner, stoppage true -> type stoppage, value null (and legacy 0/1 reads the same, F-51)', () => {
        for (const stoppage of [true, 1]) {
            const out = render([F.round({ started: 20, ended: 90, declaredWinnerId: ID.blue, stoppage })]);
            expect(out.result).toEqual({ winner: { id: ID.blue, name: 'Blair Blue' }, method: { type: 'stoppage', value: null } });
        }
    });

    it('a declared result beats the score', () => {
        const out = render([F.round({ started: 20, ended: 200, declaredWinnerId: ID.blue, stoppage: false,
                                      ridingTimeVotes: F.votes(ID.red, JUDGES, 25, 115) })]);
        expect(out.score[ID.red]).toBe(30);
        expect(out.result.method.type).toBe('submission');
        expect(out.result.winner.id).toBe(ID.blue);
    });

    it('POINTS: 60s of two-judge consensus = 20 < 24 (round 1) -> points "20"', () => {
        const out = render([F.round({ started: 20, ended: 90, ridingTimeVotes: F.votes(ID.red, JUDGES, 25, 85) })]);
        expect(out.score).toEqual({ [ID.red]: 20, [ID.blue]: 0 });
        expect(out.result).toEqual({ winner: { id: ID.red, name: 'Rory Red' }, method: { type: 'points', value: '20' } });
    });

    it('TECH-FALL: 90s = 30 >= 24 (round 1) -> "tech-fall" "30" (hyphenated, value a STRING)', () => {
        const out = render([F.round({ started: 210, ended: 310, ridingTimeVotes: F.votes(ID.blue, JUDGES, 215, 305) })]);
        expect(out.result).toEqual({ winner: { id: ID.blue, name: 'Blair Blue' }, method: { type: 'tech-fall', value: '30' } });
    });

    it('the tech-fall threshold follows the round NUMBER (round 3: 8)', () => {
        const done = (s) => F.round({ started: s, ended: s + 10 });
        const third = F.round({ started: 100, ended: 160, ridingTimeVotes: F.votes(ID.red, JUDGES, 100, 127) }); // 27s = 9 pts
        const asFirst = render([third]);
        const asThird = render([done(20), done(40), third]);
        expect(asFirst.result.method).toEqual({ type: 'points', value: '9' });
        expect(asThird.result.method).toEqual({ type: 'tech-fall', value: '9' });
    });

    it('TIE 0-0: winner null, type tie, value "0" (a legal draw, not a missing field)', () => {
        const out = render([F.round({ started: 320, ended: 340 })]);
        expect(out.result).toEqual({ winner: null, method: { type: 'tie', value: '0' } });
    });

    it('TIE at a non-zero score: value is the tied score', () => {
        const out = render([F.round({ started: 20, ended: 200, ridingTimeVotes: [
            ...F.votes(ID.red, JUDGES, 30, 60), ...F.votes(ID.blue, JUDGES, 100, 130)] })]);
        expect(out.score).toEqual({ [ID.red]: 10, [ID.blue]: 10 });
        expect(out.result).toEqual({ winner: null, method: { type: 'tie', value: '10' } });
    });

    it('NOT ENDED: winner null, method {type: null, value: null}, even with a declared winner', () => {
        const out = render([F.round({ started: 500, declaredWinnerId: ID.red, stoppage: true })]);
        expect(out.ended_at).toBeNull();
        expect(out.result).toEqual({ winner: null, method: { type: null, value: null } });
    });

    it('a consensus needs 2 judges when the MATCH has 2+: one open vote scores 0', () => {
        const out = render([F.round({ started: 500, ridingTimeVotes: F.votes(ID.red, [USERS.judgeA], 500, null) })]);
        expect(out.score[ID.red]).toBe(0);
        const solo = render([F.round({ started: 500, ridingTimeVotes: F.votes(ID.red, [USERS.judgeA], 500, null) })], 0, NOW, { judges: [USERS.judgeA] });
        expect(solo.score[ID.red]).toBe(33); // threshold 1 with one judge: floor(100/3)
    });
});

describe('serializeRound — clock-dependent fields use the injected `now`', () => {
    it('open votes accrue against now', () => {
        const rounds = [F.round({ started: 500, ridingTimeVotes: F.votes(ID.blue, JUDGES, 500, null) })];
        expect(render(rounds, 0, at(530)).score[ID.blue]).toBe(10);
        expect(render(rounds, 0, at(600)).score[ID.blue]).toBe(33);
    });

    it('F-33 pinned: an ENDED round still holding an open vote keeps accruing against now', () => {
        const rounds = [F.round({ started: 20, ended: 90, ridingTimeVotes: F.votes(ID.red, JUDGES, 25, null) })];
        expect(render(rounds, 0, at(85)).score[ID.red]).toBe(20);
        expect(render(rounds, 0, at(145)).score[ID.red]).toBe(40);
    });

    it('time_remaining: max_duration minus elapsed, net of RESUMED pauses; null once ended', () => {
        expect(render([F.round({ started: 500 })]).time_remaining).toBe(80);                                   // 180 - 100
        expect(render([F.round({ started: 500, pauses: [F.pause(520, 530)] })]).time_remaining).toBe(90);      // 180 - (100 - 10)
        expect(render([F.round({ started: 500, ended: 590 })]).time_remaining).toBeNull();
        expect(render([F.round({ started: 100 })]).time_remaining).toBe(0);                                    // clamps at 0
    });

    it('paused: an OPEN pause freezes time_remaining at its paused_at; only resumed pauses are subtracted', () => {
        const out = render([F.round({ started: 480, pauses: [F.pause(490, 495), F.pause(500, null)] })]);
        expect(out.paused).toBe(true);
        expect(out.time_remaining).toBe(180 - (20 - 5));
        expect(render([F.round({ started: 480, pauses: [F.pause(490, 495)] })]).paused).toBe(false);
        expect(render([F.round({ started: 480 })]).paused).toBe(false);
    });

    it('paused is reported for an ended round with an unresolved pause (legacy reads only the pause rows)', () => {
        const out = render([F.round({ started: 480, ended: 590, pauses: [F.pause(500, null)] })]);
        expect([out.paused, out.time_remaining]).toEqual([true, null]);
    });

    it('defaults now to the wall clock', () => {
        const rounds = [F.round({ started: 0 })];
        const out = S.serializeRound(F.matchGraph({ rounds }), rounds[0]);
        expect(out.time_remaining).toBe(0); // T0 is in the past
    });
});

describe('serializeRound — max_duration by position', () => {
    it('180 / 120 / 60 for rounds 1-3, 0 beyond (a 4th round, F-56)', () => {
        const rounds = [0, 1, 2, 3].map((i) => F.round({ started: 20 + i * 10, ended: 25 + i * 10 }));
        expect(rounds.map((_, i) => render(rounds, i).max_duration)).toEqual([180, 120, 60, 0]);
    });
});
