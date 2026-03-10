const { calculateRidingTime } = require('../lib/ridingTime');
const   TestHelpers           = require('./helpers');


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
    // Under the quorum-loss-reset algorithm, a control period that ends before the
    // round's endAt (i.e. quorum is lost because a judge stops voting) has its
    // accumulated time discarded.  Only the period that is still active at endAt
    // is counted.  The test data below uses all closed votes (all end before endAt),
    // so every quorum period is discarded and the result is 0.

    it ('returns 0 when all quorum periods ended before the round (1 judge, closed votes)', () => {
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3];
        const judges = [judge1];
        const endAt  = judge1Vote3.ended_at;
        const time   = calculateRidingTime(votes, judges, endAt);
        expect(time).toEqual(0);
    });

    it ('returns 0 when all quorum periods ended before the round (2 judges, closed votes)', () => {
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3,
                        judge2Vote1, judge2Vote2, judge2Vote3, judge2Vote4];
        const judges = [judge1, judge2];
        const endAt  = judge1Vote3.ended_at;
        const time   = calculateRidingTime(votes, judges, endAt);
        expect(time).toEqual(0);
    });

    it ('returns 0 when all quorum periods ended before the round (3 judges, closed votes)', () => {
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3,
                        judge2Vote1, judge2Vote2, judge2Vote3, judge2Vote4,
                        judge3Vote1, judge3Vote2, judge3Vote3, judge3Vote4];
        const judges = [judge1, judge2, judge3];
        const endAt  = judge1Vote3.ended_at;
        const time   = calculateRidingTime(votes, judges, endAt);
        expect(time).toEqual(0);
    });

    it ('counts only the currently-active quorum period when a round has not ended', () => {
        // judge1Vote4 (4:00, open) and judge2Vote5 (4:05, open) are both active.
        // For 3 judges, threshold = max(ceil(3/2), 2) = 2.
        // The last quorum period starts when judge2Vote5 begins (2 of 3 judges active).
        // All earlier closed periods are discarded by the quorum-loss reset.
        const votes             = [judge1Vote1, judge1Vote2, judge1Vote3, judge1Vote4,
                                   judge2Vote1, judge2Vote2, judge2Vote3, judge2Vote4, judge2Vote5,
                                   judge3Vote1, judge3Vote2, judge3Vote3, judge3Vote4];
        const judges            = [judge1, judge2, judge3];
        const timeSinceLastVote = (new Date().getTime() - judge2Vote5.started_at.getTime())/1000;
        const time              = calculateRidingTime(votes, judges);
        expect(time).toBeCloseTo(timeSinceLastVote);
    });
});


/***********************************************************************************************
* QUORUM-LOSS RESET (bug fix regression)
***********************************************************************************************/
describe('calculateRidingTime - quorum-loss reset', () => {
    // Two judges; threshold = 2. Votes are short overlapping windows.

    it ('discards accumulated time when quorum is lost mid-period; score is 0 if no single run reaches threshold', () => {
        // judge1 and judge2 overlap for only 1 second, then judge1 leaves (quorum lost)
        // The overlap is < 3s so no score should be recorded but there is no 3s threshold here;
        // we just verify the accumulated partial time is discarded on quorum loss.
        // judge1: 0:00 -> 0:02 (2s)
        // judge2: 0:01 -> 0:10 (overlap 0:01 - 0:02 = 1s, then quorum lost at 0:02)
        const j1 = {id: 'ql-judge1'};
        const j2 = {id: 'ql-judge2'};
        const v1 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,2), judge_id: j1.id };
        const v2 = { started_at: new Date(2026,0,1,10,0,1), ended_at: new Date(2026,0,1,10,0,10), judge_id: j2.id };
        const time = calculateRidingTime([v1, v2], [j1, j2], new Date(2026,0,1,10,0,10));
        // Quorum active from 0:01 to 0:02 = 1s, then quorum lost → discarded
        expect(time).toEqual(0);
    });

    it ('scores correctly when a single run exceeds threshold before quorum is lost', () => {
        // judge1: 0:00 -> 0:10  judge2: 0:02 -> 0:08  (overlap 0:02-0:08 = 6s, quorum lost at 0:08)
        // After quorum lost at 0:08, no further overlap → total 6s
        const j1 = {id: 'ql2-judge1'};
        const j2 = {id: 'ql2-judge2'};
        const v1 = { started_at: new Date(2026,0,1,10,0,0),  ended_at: new Date(2026,0,1,10,0,10), judge_id: j1.id };
        const v2 = { started_at: new Date(2026,0,1,10,0,2),  ended_at: new Date(2026,0,1,10,0,8),  judge_id: j2.id };
        const time = calculateRidingTime([v1, v2], [j1, j2], new Date(2026,0,1,10,0,10));
        expect(time).toEqual(6);
    });

    it ('counts two separate quorum runs both contributing to total score', () => {
        // Two non-overlapping control periods each 5s long → total 10s
        const j1 = {id: 'ql3-judge1'};
        const j2 = {id: 'ql3-judge2'};
        // First run: overlap 0:00 - 0:05
        const v1a = { started_at: new Date(2026,0,1,10,0,0),  ended_at: new Date(2026,0,1,10,0,5),  judge_id: j1.id };
        const v2a = { started_at: new Date(2026,0,1,10,0,0),  ended_at: new Date(2026,0,1,10,0,5),  judge_id: j2.id };
        // Gap: 0:05 - 0:10 (only j2 active, quorum lost)
        // Second run: overlap 0:10 - 0:15
        const v1b = { started_at: new Date(2026,0,1,10,0,10), ended_at: new Date(2026,0,1,10,0,15), judge_id: j1.id };
        const v2b = { started_at: new Date(2026,0,1,10,0,10), ended_at: new Date(2026,0,1,10,0,15), judge_id: j2.id };
        const time = calculateRidingTime([v1a, v2a, v1b, v2b], [j1, j2], new Date(2026,0,1,10,0,15));
        expect(time).toEqual(10);
    });
});


/***********************************************************************************************
* PAUSE-AWARE SCENARIOS
***********************************************************************************************/
describe('calculateRidingTime - pause-aware scenarios', () => {
    it ('only accumulates time outside a paused interval when a vote spans a pause', () => {
        // Single judge (threshold=1): vote 0:00 -> 0:20, pause 0:05 -> 0:10
        // Active outside pause: 0:00-0:05 (5s) + 0:10-0:20 (10s) = 15s
        const j = {id: 'p1-judge'};
        const v = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,20), judge_id: j.id };
        const pause = createPause(0,5, 0,10);
        const time = calculateRidingTime([v], [j], new Date(2026,0,1,10,0,20), [pause]);
        expect(time).toBeCloseTo(15);
    });

    it ('carries forward accumulated time from before a pause', () => {
        // Two judges (threshold=2): overlap 0:00-0:05 (5s), pause 0:05-0:10, overlap resumes 0:10-0:15 (5s)
        // Total = 10s
        const j1 = {id: 'p2-j1'};
        const j2 = {id: 'p2-j2'};
        const v1 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,20), judge_id: j1.id };
        const v2 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,20), judge_id: j2.id };
        const pause = createPause(0,5, 0,10);
        const time = calculateRidingTime([v1, v2], [j1, j2], new Date(2026,0,1,10,0,20), [pause]);
        expect(time).toBeCloseTo(10);
    });

    it ('contributes zero riding time when a vote is entirely within a paused interval', () => {
        // Single judge: vote 0:05 -> 0:08 is entirely within pause 0:00 -> 0:10
        const j = {id: 'p3-judge'};
        const v = { started_at: new Date(2026,0,1,10,0,5), ended_at: new Date(2026,0,1,10,0,8), judge_id: j.id };
        const pause = createPause(0,0, 0,10);
        const time = calculateRidingTime([v], [j], new Date(2026,0,1,10,0,10), [pause]);
        expect(time).toEqual(0);
    });

    it ('discards pending time when quorum is lost during a pause', () => {
        // Two judges: both vote starting 0:00, pause hits at 0:05 (5s accumulated),
        // judge1 ends at 0:07 (while still paused) → quorum lost during pause → discard pending 5s
        // resume at 0:10 with only judge2 → no quorum → total 0s
        const j1 = {id: 'p4-j1'};
        const j2 = {id: 'p4-j2'};
        const v1 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,7), judge_id: j1.id };
        const v2 = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,15), judge_id: j2.id };
        const pause = createPause(0,5, 0,10);
        const time = calculateRidingTime([v1, v2], [j1, j2], new Date(2026,0,1,10,0,15), [pause]);
        expect(time).toEqual(0);
    });

    it ('correctly handles two separate pause/resume cycles', () => {
        // Single judge (threshold=1): vote 0:00 -> 0:30
        // pause1: 0:05 -> 0:10 (loses 5s)
        // pause2: 0:20 -> 0:25 (loses 5s)
        // Active time: 0:00-0:05 (5s) + 0:10-0:20 (10s) + 0:25-0:30 (5s) = 20s
        const j = {id: 'p5-judge'};
        const v = { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,30), judge_id: j.id };
        const pause1 = createPause(0,5,  0,10);
        const pause2 = createPause(0,20, 0,25);
        const time = calculateRidingTime([v], [j], new Date(2026,0,1,10,0,30), [pause1, pause2]);
        expect(time).toBeCloseTo(20);
    });

    it ('produces identical results when no pauses argument is passed (regression)', () => {
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3];
        const judges = [judge1];
        const endAt  = judge1Vote3.ended_at;
        const timeWithoutPauses = calculateRidingTime(votes, judges, endAt);
        const timeWithEmptyArr  = calculateRidingTime(votes, judges, endAt, []);
        expect(timeWithoutPauses).toEqual(30);
        expect(timeWithEmptyArr).toEqual(30);
    });
});

