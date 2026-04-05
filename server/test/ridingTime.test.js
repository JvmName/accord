const { calculateRidingTime } = require('../lib/ridingTime');
const   TestHelpers           = require('./helpers');

const score = (periods) => periods.reduce((sum, d) => sum + Math.floor(d / 3), 0);

const judge1 = {id: TestHelpers.Faker.Text.randomString(10)};
const judge2 = {id: TestHelpers.Faker.Text.randomString(10)};
const judge3 = {id: TestHelpers.Faker.Text.randomString(10)};

const createVote = (startMin, startSec, endMin, endSec, judge) => {
    const startAt = new Date(2026, 0, 1, 10, startMin, startSec)
    const endAt   = endMin === null ? null : new Date(2026, 0, 1, 10, endMin, endSec)
    return {started_at: startAt,
            ended_at:   endAt,
            judge_id:   judge.id};
}

const createPause = (startMin, startSec, endMin, endSec) => {
    const pausedAt  = new Date(2026, 0, 1, 10, startMin, startSec);
    const resumedAt = endMin === null ? null : new Date(2026, 0, 1, 10, endMin, endSec);
    return { paused_at: pausedAt, resumed_at: resumedAt };
}

const judge1Vote1 = createVote(0,0, 0,10,      judge1);
const judge1Vote2 = createVote(1,0, 1,10,      judge1);
const judge1Vote3 = createVote(2,0, 2,10,      judge1);
const judge1Vote4 = createVote(4,0, null,null, judge1);

const judge2Vote1 = createVote(0,5,  0,15,      judge2);
const judge2Vote2 = createVote(0,55, 1,5,       judge2);
const judge2Vote3 = createVote(2,1,  2,6,       judge2);
const judge2Vote4 = createVote(3,0,  3,5,       judge2);
const judge2Vote5 = createVote(4,5,  null,null, judge2);

const judge3Vote1 = createVote(0,0,  0,4, judge3);
const judge3Vote2 = createVote(0,50, 1,0, judge3);
const judge3Vote3 = createVote(2,1,  2,6, judge3);
const judge3Vote4 = createVote(3,0,  3,5, judge3);


describe('calculateRidingTime', () => {
    it ('1 judge, single 10s vote', () => {
        // Single judge, single closed vote 0:00-0:10 → one period of 10s
        const votes  = [judge1Vote1];
        const judges = [judge1];
        const endAt  = judge1Vote1.ended_at;
        const periods = calculateRidingTime(votes, judges, endAt);
        expect(periods).toEqual([10]);
        expect(score(periods)).toEqual(3);
    });

    it ('1 judge, three closed 10s votes', () => {
        // Three separate closed votes, each 10s → three separate periods
        // judge1Vote1: 0:00-0:10, judge1Vote2: 1:00-1:10, judge1Vote3: 2:00-2:10
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3];
        const judges = [judge1];
        const endAt  = judge1Vote3.ended_at;
        const periods = calculateRidingTime(votes, judges, endAt);
        expect(periods).toEqual([10, 10, 10]);
        expect(score(periods)).toEqual(9);
    });

    it ('2 judges (threshold 2), overlapping votes create quorum periods', () => {
        // judge1Vote1: 0:00-0:10, judge2Vote1: 0:05-0:15 → quorum 0:05-0:10 = 5s
        // judge1Vote2: 1:00-1:10, judge2Vote2: 0:55-1:05 → quorum 1:00-1:05 = 5s
        // judge1Vote3: 2:00-2:10, judge2Vote3: 2:01-2:06 → quorum 2:01-2:06 = 5s
        // judge2Vote4: 3:00-3:05 (only judge2, no quorum → no period)
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3,
                        judge2Vote1, judge2Vote2, judge2Vote3, judge2Vote4];
        const judges = [judge1, judge2];
        const endAt  = judge1Vote3.ended_at;
        const periods = calculateRidingTime(votes, judges, endAt);
        expect(periods).toEqual([5, 5, 5]);
        expect(score(periods)).toEqual(3);
    });

    it ('counts only the currently-active quorum period when a round has not ended', () => {
        // judge1Vote4 (4:00, open) and judge2Vote5 (4:05, open) are both active.
        // For 3 judges, threshold = max(ceil(3/2), 2) = 2.
        // The last quorum period starts when judge2Vote5 begins (2 of 3 judges active).
        // All earlier closed periods are independent; the open period at endAt is included.
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3, judge1Vote4,
                        judge2Vote1, judge2Vote2, judge2Vote3, judge2Vote4, judge2Vote5,
                        judge3Vote1, judge3Vote2, judge3Vote3, judge3Vote4];
        const judges = [judge1, judge2, judge3];
        const periods = calculateRidingTime(votes, judges);
        const activePeriod = periods[periods.length - 1];
        const timeSinceLastVote = (new Date().getTime() - judge2Vote5.started_at.getTime()) / 1000;
        expect(activePeriod).toBeCloseTo(timeSinceLastVote);
    });
});


/***********************************************************************************************
* QUORUM-LOSS RESET
***********************************************************************************************/
describe('calculateRidingTime - quorum-loss reset', () => {
    it ('short quorum period (1s) earns 0 points but is still tracked', () => {
        // judge1: 0:00-0:02, judge2: 0:01-0:10 → quorum 0:01-0:02 = 1s, then quorum lost
        const j1 = {id: 'ql-judge1'};
        const j2 = {id: 'ql-judge2'};
        const v1 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,2),  judge_id: j1.id };
        const v2 = { started_at: new Date(2026,0,1,10,0,1), ended_at: new Date(2026,0,1,10,0,10), judge_id: j2.id };
        const periods = calculateRidingTime([v1, v2], [j1, j2], new Date(2026,0,1,10,0,10));
        expect(periods).toEqual([1]);
        expect(score(periods)).toEqual(0);
    });

    it ('6s quorum period earns 2 points', () => {
        // judge1: 0:00-0:10, judge2: 0:02-0:08 → quorum 0:02-0:08 = 6s, then quorum lost
        const j1 = {id: 'ql2-judge1'};
        const j2 = {id: 'ql2-judge2'};
        const v1 = { started_at: new Date(2026,0,1,10,0,0),  ended_at: new Date(2026,0,1,10,0,10), judge_id: j1.id };
        const v2 = { started_at: new Date(2026,0,1,10,0,2),  ended_at: new Date(2026,0,1,10,0,8),  judge_id: j2.id };
        const periods = calculateRidingTime([v1, v2], [j1, j2], new Date(2026,0,1,10,0,10));
        expect(periods).toEqual([6]);
        expect(score(periods)).toEqual(2);
    });

    it ('two separate 5s quorum periods each earn 1 point', () => {
        // Two non-overlapping control periods each 5s long → two separate periods
        const j1 = {id: 'ql3-judge1'};
        const j2 = {id: 'ql3-judge2'};
        // First run: overlap 0:00-0:05
        const v1a = { started_at: new Date(2026,0,1,10,0,0),  ended_at: new Date(2026,0,1,10,0,5),  judge_id: j1.id };
        const v2a = { started_at: new Date(2026,0,1,10,0,0),  ended_at: new Date(2026,0,1,10,0,5),  judge_id: j2.id };
        // Gap: 0:05-0:10 (no quorum)
        // Second run: overlap 0:10-0:15
        const v1b = { started_at: new Date(2026,0,1,10,0,10), ended_at: new Date(2026,0,1,10,0,15), judge_id: j1.id };
        const v2b = { started_at: new Date(2026,0,1,10,0,10), ended_at: new Date(2026,0,1,10,0,15), judge_id: j2.id };
        const periods = calculateRidingTime([v1a, v2a, v1b, v2b], [j1, j2], new Date(2026,0,1,10,0,15));
        expect(periods).toEqual([5, 5]);
        expect(score(periods)).toEqual(2);
    });
});


/***********************************************************************************************
* PER-PERIOD ISOLATION
***********************************************************************************************/
describe('calculateRidingTime - per-period isolation', () => {
    it ('three 2-second periods total 6s but score 0 points', () => {
        // 1 judge, three 2s votes with gaps between them
        // Each 2s period scores Math.floor(2/3) = 0 independently
        const j = {id: 'iso-judge1'};
        const v1 = { started_at: new Date(2026,0,1,10,0,0),  ended_at: new Date(2026,0,1,10,0,2),  judge_id: j.id };
        const v2 = { started_at: new Date(2026,0,1,10,0,5),  ended_at: new Date(2026,0,1,10,0,7),  judge_id: j.id };
        const v3 = { started_at: new Date(2026,0,1,10,0,10), ended_at: new Date(2026,0,1,10,0,12), judge_id: j.id };
        const periods = calculateRidingTime([v1, v2, v3], [j], new Date(2026,0,1,10,0,12));
        expect(periods).toEqual([2, 2, 2]);
        expect(score(periods)).toEqual(0);
    });

    it ('a 3-second and a 2-second period score 1 point total, not 1+0=1 from combined 5s', () => {
        // 1 judge, vote 0:00-0:03 and vote 0:05-0:07
        // period1 = 3s → Math.floor(3/3) = 1; period2 = 2s → Math.floor(2/3) = 0; total score = 1
        const j = {id: 'iso-judge2'};
        const v1 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,3), judge_id: j.id };
        const v2 = { started_at: new Date(2026,0,1,10,0,5), ended_at: new Date(2026,0,1,10,0,7), judge_id: j.id };
        const periods = calculateRidingTime([v1, v2], [j], new Date(2026,0,1,10,0,7));
        expect(periods).toEqual([3, 2]);
        expect(score(periods)).toEqual(1);
    });

    it ('a 6-second continuous period scores 2 points', () => {
        // 1 judge, single vote 0:00-0:06 → one period of 6s → Math.floor(6/3) = 2
        const j = {id: 'iso-judge3'};
        const v = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,6), judge_id: j.id };
        const periods = calculateRidingTime([v], [j], new Date(2026,0,1,10,0,6));
        expect(periods).toEqual([6]);
        expect(score(periods)).toEqual(2);
    });
});


/***********************************************************************************************
* PAUSE-AWARE SCENARIOS
***********************************************************************************************/
describe('calculateRidingTime - pause-aware scenarios', () => {
    it ('only accumulates time outside a paused interval when a vote spans a pause', () => {
        // Single judge (threshold=1): vote 0:00-0:20, pause 0:05-0:10
        // Active outside pause: 0:00-0:05 (5s) + 0:10-0:20 (10s) = 15s → one period
        const j = {id: 'p1-judge'};
        const v = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,20), judge_id: j.id };
        const pause = createPause(0,5, 0,10);
        const periods = calculateRidingTime([v], [j], new Date(2026,0,1,10,0,20), [pause]);
        expect(periods).toHaveLength(1);
        expect(periods[0]).toBeCloseTo(15);
        expect(score(periods)).toEqual(5);
    });

    it ('carries forward accumulated time from before a pause', () => {
        // Two judges (threshold=2): both vote 0:00-0:20, pause 0:05-0:10
        // Pre-pause quorum: 0:00-0:05 (5s banked), post-resume quorum: 0:10-0:20 (10s)
        // Pause preserves continuity: adjusted start = resume - banked = 0:10 - 5s = 0:05(effective)
        // Period end at 0:20: duration = 0:20 - 0:05(effective) = 15s
        const j1 = {id: 'p2-j1'};
        const j2 = {id: 'p2-j2'};
        const v1 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,20), judge_id: j1.id };
        const v2 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,20), judge_id: j2.id };
        const pause = createPause(0,5, 0,10);
        const periods = calculateRidingTime([v1, v2], [j1, j2], new Date(2026,0,1,10,0,20), [pause]);
        expect(periods).toHaveLength(1);
        expect(periods[0]).toBeCloseTo(15);
        expect(score(periods)).toEqual(5);
    });

    it ('contributes zero riding time when a vote is entirely within a paused interval', () => {
        // Single judge: vote 0:05-0:08 is entirely within pause 0:00-0:10
        const j = {id: 'p3-judge'};
        const v = { started_at: new Date(2026,0,1,10,0,5), ended_at: new Date(2026,0,1,10,0,8), judge_id: j.id };
        const pause = createPause(0,0, 0,10);
        const periods = calculateRidingTime([v], [j], new Date(2026,0,1,10,0,10), [pause]);
        expect(periods).toEqual([]);
        expect(score(periods)).toEqual(0);
    });

    it ('discards pending time when quorum is lost during a pause', () => {
        // Two judges: both vote from 0:00, pause at 0:05 (5s banked),
        // judge1 ends at 0:07 (during pause) → quorum lost → banked 5s pushed as own period
        // resume at 0:10 with only judge2 → no quorum → no more periods
        const j1 = {id: 'p4-j1'};
        const j2 = {id: 'p4-j2'};
        const v1 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,7),  judge_id: j1.id };
        const v2 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,15), judge_id: j2.id };
        const pause = createPause(0,5, 0,10);
        const periods = calculateRidingTime([v1, v2], [j1, j2], new Date(2026,0,1,10,0,15), [pause]);
        expect(periods).toEqual([5]);
        expect(score(periods)).toEqual(1);
    });

    it ('correctly handles two separate pause/resume cycles', () => {
        // Single judge (threshold=1): vote 0:00-0:30
        // pause1: 0:05-0:10 (loses 5s), pause2: 0:20-0:25 (loses 5s)
        // Active time: 0:00-0:05 (5s) + 0:10-0:20 (10s) + 0:25-0:30 (5s) = 20s → one period
        const j = {id: 'p5-judge'};
        const v = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,30), judge_id: j.id };
        const pause1 = createPause(0,5,  0,10);
        const pause2 = createPause(0,20, 0,25);
        const periods = calculateRidingTime([v], [j], new Date(2026,0,1,10,0,30), [pause1, pause2]);
        expect(periods).toHaveLength(1);
        expect(periods[0]).toBeCloseTo(20);
        expect(score(periods)).toEqual(6);
    });

    it ('produces identical results when no pauses argument is passed (regression)', () => {
        // Same as 1 judge, three closed 10s votes: [10, 10, 10] regardless of pauses argument
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3];
        const judges = [judge1];
        const endAt  = judge1Vote3.ended_at;
        const periodsWithoutPauses = calculateRidingTime(votes, judges, endAt);
        const periodsWithEmptyArr  = calculateRidingTime(votes, judges, endAt, []);
        expect(periodsWithoutPauses).toEqual([10, 10, 10]);
        expect(periodsWithEmptyArr).toEqual([10, 10, 10]);
    });
});
