const { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest, mock, spyOn, test } = require('bun:test');
/**
 * DB-free unit tests for the pure scoring derivations
 * (src/domain/scoring.ts) and the RDojoKombat ruleset's use of them,
 * server-ts task 08. Everything is plain objects — no models, no database.
 */
const {
    scoreRidingTime,
    determineRoundResult,
    getMatchWinner,
    getRoundScore,
    getRoundResult,
} = require('../../src/domain/scoring');
const { RDojoKombatRules } = require('../../src/domain/rules');

const red  = { id: 'red-1' };
const blue = { id: 'blue-1' };
const MAX_ROUNDS = RDojoKombatRules.maxRounds;

const T = (sec) => new Date(Date.UTC(2026, 0, 1, 10, 0, sec));
const vote = (judgeId, competitor, startSec, endSec) => ({
    judge_id: judgeId, competitor_id: competitor.id, started_at: T(startSec), ended_at: T(endSec),
});
const ended = (overrides = {}) => ({ ended: true, declared_winner_id: null, stoppage: null, ...overrides });


// ===========================================================================
// getMatchWinner — best-of-3, always all rounds
// ===========================================================================
describe('getMatchWinner', () => {
    it('maxRounds is 3', () => {
        expect(MAX_ROUNDS).toBe(3);
    });

    it('red wins 2 of 3 → red (the object passed in)', () => {
        expect(getMatchWinner([red, blue, red], MAX_ROUNDS, red, blue)).toBe(red);
    });

    it('blue wins 2 of 3 → blue', () => {
        expect(getMatchWinner([blue, red, blue], MAX_ROUNDS, red, blue)).toBe(blue);
    });

    it('red sweeps 3 of 3 → red', () => {
        expect(getMatchWinner([red, red, red], MAX_ROUNDS, red, blue)).toBe(red);
    });

    it('one win each plus a tied round → null (draw)', () => {
        expect(getMatchWinner([red, null, blue], MAX_ROUNDS, red, blue)).toBeNull();
    });

    it('all rounds tied → null (draw)', () => {
        expect(getMatchWinner([null, null, null], MAX_ROUNDS, red, blue)).toBeNull();
    });

    it('a single round win with two ties decides the match', () => {
        expect(getMatchWinner([null, blue, null], MAX_ROUNDS, red, blue)).toBe(blue);
    });

    it('incomplete match (fewer than maxRounds ended rounds) → null', () => {
        expect(getMatchWinner([], MAX_ROUNDS, red, blue)).toBeNull();
        expect(getMatchWinner([red], MAX_ROUNDS, red, blue)).toBeNull();
    });

    it('NO early exit: red has won both of the 2 ended rounds → still null', () => {
        expect(getMatchWinner([red, red], MAX_ROUNDS, red, blue)).toBeNull();
    });

    it('compares ids loosely and accepts any object carrying the id', () => {
        // Round winners are separately-loaded competitor objects, not the same references
        const redCopy = { id: 'red-1', name: 'Red' };
        expect(getMatchWinner([redCopy, { id: 'red-1' }, blue], MAX_ROUNDS, red, blue)).toBe(red);
    });
});


// ===========================================================================
// determineWinner (via the ruleset) — every method
// ===========================================================================
describe('RDojoKombatRules.determineWinner / getRoundResult', () => {
    it('not ended → no winner, null method', () => {
        const r = getRoundResult(RDojoKombatRules, red, blue, 30, 0, 1, { ended: false });
        expect(r).toEqual({ winner: null, method: { type: null, value: null } });
    });

    it('submission: declared winner without stoppage', () => {
        const r = getRoundResult(RDojoKombatRules, red, blue, 0, 9, 1, ended({ declared_winner_id: 'red-1', stoppage: false }));
        expect(r.winner).toBe(red);
        expect(r.method).toEqual({ type: 'submission', value: null });
    });

    it('stoppage: declared winner with stoppage', () => {
        const r = getRoundResult(RDojoKombatRules, red, blue, 9, 0, 1, ended({ declared_winner_id: 'blue-1', stoppage: true }));
        expect(r.winner).toBe(blue);
        expect(r.method).toEqual({ type: 'stoppage', value: null });
    });

    it('points: differing scores below the threshold', () => {
        const r = getRoundResult(RDojoKombatRules, red, blue, 3, 7, 1, ended());
        expect(r.winner).toBe(blue);
        expect(r.method).toEqual({ type: 'points', value: '7' });
    });

    it.each([
        [1, 24],
        [2, 16],
        [3, 8],
    ])('tech-fall: round %i threshold is %i (at threshold → tech-fall, one below → points)', (roundNumber, threshold) => {
        expect(RDojoKombatRules.techFallThreshold(roundNumber)).toBe(threshold);

        const at = getRoundResult(RDojoKombatRules, red, blue, threshold, 0, roundNumber, ended());
        expect(at.winner).toBe(red);
        expect(at.method).toEqual({ type: 'tech-fall', value: String(threshold) });

        const below = getRoundResult(RDojoKombatRules, red, blue, threshold - 1, 0, roundNumber, ended());
        expect(below.method).toEqual({ type: 'points', value: String(threshold - 1) });
    });

    it('tie: equal scores, no declared winner', () => {
        const r = getRoundResult(RDojoKombatRules, red, blue, 4, 4, 2, ended());
        expect(r.winner).toBeNull();
        expect(r.method).toEqual({ type: 'tie', value: '4' });
    });

    it('determineRoundResult takes the threshold explicitly', () => {
        expect(determineRoundResult(red, blue, 5, 0, 5, ended()).method.type).toBe('tech-fall');
        expect(determineRoundResult(red, blue, 4, 0, 5, ended()).method.type).toBe('points');
    });
});


// ===========================================================================
// scoreRound / scoreRidingTime
// ===========================================================================
describe('scoreRidingTime / RDojoKombatRules.scoreRound', () => {
    const judges = [{ id: 'j1' }, { id: 'j2' }];

    it('partitions by competitor and floors each period by 3', () => {
        const votes = [
            vote('j1', red, 0, 10), vote('j2', red, 1, 9),     // red quorum 1-9 = 8s → 2
            vote('j1', blue, 20, 40), vote('j2', blue, 21, 39), // blue quorum 21-39 = 18s → 6
        ];
        expect(scoreRidingTime(red, blue, judges, votes, [], T(40))).toEqual({ redScore: 2, blueScore: 6 });
    });

    it('the ruleset and the thin wrapper give the same result as the pure function', () => {
        const votes  = [vote('j1', red, 0, 10), vote('j2', red, 1, 9)];
        const pauses = [{ paused_at: T(3), resumed_at: T(5) }];
        const pure   = scoreRidingTime(red, blue, judges, votes, pauses, T(10));
        expect(RDojoKombatRules.scoreRound(red, blue, judges, votes, pauses)).toEqual(pure);
        expect(getRoundScore(RDojoKombatRules, red, blue, judges, votes, pauses)).toEqual(pure);
        expect(pure).toEqual({ redScore: 2, blueScore: 0 });  // 8s - 2s paused = 6s → 2
    });

    it('scoreRound does not use any round end time: an open vote is closed at "now" (F-33)', () => {
        const openVote = { judge_id: 'j1', competitor_id: red.id, started_at: T(0), ended_at: null };
        const before       = Math.floor((Date.now() - T(0).getTime()) / 1000 / 3);
        const { redScore } = RDojoKombatRules.scoreRound(red, blue, [{ id: 'j1' }], [openVote]);
        const after        = Math.floor((Date.now() - T(0).getTime()) / 1000 / 3);
        expect(redScore).toBeGreaterThanOrEqual(before);
        expect(redScore).toBeLessThanOrEqual(after);
    });
});
