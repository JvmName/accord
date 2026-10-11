const { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest, mock, spyOn, test } = require('bun:test');
/**
 * DB-free unit tests for the consensus riding-time calculator
 * (src/domain/ridingTime.ts), server-ts task 08.
 *
 * Threshold rule (CLAUDE.md): 1 for a single judge, ALWAYS 2 for any
 * multi-judge panel regardless of size. Time derives from vote timestamps.
 */
const { calculateRidingTime } = require('../../src/domain/ridingTime');

const T = (sec) => new Date(Date.UTC(2026, 0, 1, 10, 0, sec));
const judges = (n) => Array.from({ length: n }, (_, i) => ({ id: `judge-${i + 1}` }));
const vote = (judge, startSec, endSec = null) => ({
    judge_id:   judge.id,
    started_at: T(startSec),
    ended_at:   endSec === null ? null : T(endSec),
});
const pause = (pausedSec, resumedSec = null) => ({
    paused_at:  T(pausedSec),
    resumed_at: resumedSec === null ? null : T(resumedSec),
});


// ===========================================================================
// Threshold boundary
// ===========================================================================
describe('calculateRidingTime — threshold boundary', () => {
    it('1 judge: threshold is 1 — a single vote accumulates', () => {
        const [j1] = judges(1);
        expect(calculateRidingTime([vote(j1, 0, 9)], [j1], T(9))).toEqual([9]);
    });

    it('2 judges: threshold is 2 — one vote alone accumulates nothing', () => {
        const [j1, j2] = judges(2);
        expect(calculateRidingTime([vote(j1, 0, 9)], [j1, j2], T(9))).toEqual([]);
    });

    it('2 judges: threshold is 2 — both votes accumulate only the overlap', () => {
        const [j1, j2] = judges(2);
        const periods = calculateRidingTime([vote(j1, 0, 9), vote(j2, 3, 9)], [j1, j2], T(9));
        expect(periods).toEqual([6]);
    });

    it('5 judges: threshold is STILL 2 — one vote accumulates nothing', () => {
        const panel = judges(5);
        expect(calculateRidingTime([vote(panel[0], 0, 9)], panel, T(9))).toEqual([]);
    });

    it('5 judges: threshold is STILL 2 (not a majority of 3) — two votes accumulate', () => {
        const panel = judges(5);
        const periods = calculateRidingTime([vote(panel[0], 0, 9), vote(panel[1], 3, 9)], panel, T(9));
        expect(periods).toEqual([6]);
    });

    it('5 judges: a third vote does not change an already-met threshold', () => {
        const panel = judges(5);
        const periods = calculateRidingTime(
            [vote(panel[0], 0, 12), vote(panel[1], 3, 12), vote(panel[2], 6, 12)],
            panel, T(12));
        expect(periods).toEqual([9]);
    });
});


// ===========================================================================
// Crossing the threshold up and down
// ===========================================================================
describe('calculateRidingTime — votes crossing the threshold', () => {
    it('starts at the vote that reaches threshold and stops at the vote that drops below it', () => {
        const [j1, j2, j3] = judges(3);
        // j1 0-20, j2 5-12, j3 15-30 → >=2 active during 5-12 and 15-20
        const periods = calculateRidingTime(
            [vote(j1, 0, 20), vote(j2, 5, 12), vote(j3, 15, 30)],
            [j1, j2, j3], T(30));
        expect(periods).toEqual([7, 5]);
    });

    it('stays in control when one judge drops while two others remain', () => {
        const [j1, j2, j3] = judges(3);
        // j1 0-10, j2 0-20, j3 5-20 → >=2 active continuously 0-20
        const periods = calculateRidingTime(
            [vote(j1, 0, 10), vote(j2, 0, 20), vote(j3, 5, 20)],
            [j1, j2, j3], T(20));
        expect(periods).toEqual([20]);
    });

    it('closes a still-open control period at endAt', () => {
        const [j1, j2] = judges(2);
        const periods = calculateRidingTime([vote(j1, 0), vote(j2, 4)], [j1, j2], T(10));
        expect(periods).toEqual([6]);
    });

    it('sorts the caller\'s votes array in place by started_at (preserved behaviour)', () => {
        const [j1, j2] = judges(2);
        const late  = vote(j2, 5, 9);
        const early = vote(j1, 0, 9);
        const votes = [late, early];
        calculateRidingTime(votes, [j1, j2], T(9));
        expect(votes[0]).toBe(early);
        expect(votes[1]).toBe(late);
    });
});


// ===========================================================================
// Pauses are excluded from accumulation
// ===========================================================================
describe('calculateRidingTime — pauses', () => {
    it('excludes a pause from a single-judge period', () => {
        const [j1] = judges(1);
        const periods = calculateRidingTime([vote(j1, 0, 20)], [j1], T(20), [pause(5, 10)]);
        expect(periods).toEqual([15]);
    });

    it('pause/resume with quorum held throughout: pre-pause time carries into one period', () => {
        const [j1, j2] = judges(2);
        const periods = calculateRidingTime(
            [vote(j1, 0, 20), vote(j2, 0, 20)], [j1, j2], T(20), [pause(5, 10)]);
        expect(periods).toEqual([15]);
    });

    it('quorum lost during a pause: banked pre-pause time is scored as its own period', () => {
        const [j1, j2] = judges(2);
        // j1 ends at 7 (inside pause 5-10); after resume only j2 → no quorum
        const periods = calculateRidingTime(
            [vote(j1, 0, 7), vote(j2, 0, 15)], [j1, j2], T(15), [pause(5, 10)]);
        expect(periods).toEqual([5]);
    });

    it('a still-open pause at endAt: banked time is scored, nothing after the pause', () => {
        const [j1, j2] = judges(2);
        const periods = calculateRidingTime(
            [vote(j1, 0, 30), vote(j2, 0, 30)], [j1, j2], T(30), [pause(5)]);
        expect(periods).toEqual([5]);
    });

    it('a vote entirely inside a pause contributes nothing', () => {
        const [j1] = judges(1);
        const periods = calculateRidingTime([vote(j1, 2, 8)], [j1], T(10), [pause(0, 10)]);
        expect(periods).toEqual([]);
    });
});
