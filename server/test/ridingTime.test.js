const { calculateRidingTime } = require('../lib/ridingTime');
const   TestHelpers           = require('./helpers');


const judge1 = {id: TestHelpers.Faker.Text.randomString(10)};
const judge2 = {id: TestHelpers.Faker.Text.randomString(10)};
const judge3 = {id: TestHelpers.Faker.Text.randomString(10)};
const competitorId = TestHelpers.Faker.Text.randomString(10);

const createVote = (startMin, startSec, endMin, endSec, judge) => {
    const startAt = new Date(2026, 0, 1, 10, startMin, startSec)
    const endAt   = endMin === null ? null : new Date(2026, 0, 1, 10, endMin, endSec)
    return {started_at: startAt,
            ended_at:   endAt,
            judge_id:   judge.id};
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
    it ('calculates riding time when there is only one judge', () => {
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3];
        const judges = [judge1];
        const endAt  = judge1Vote3.ended_at;
        const result = calculateRidingTime(votes, judges, endAt, competitorId);
        // 3 periods of 10 seconds each = 3 × floor(10000ms/3000ms) = 3 × 3 = 9 points
        expect(result.points).toEqual(9);
        expect(result.activeControlTimeMs).toEqual(0);
        expect(result.activeCompetitor).toBeNull();
    });

    it ('calculates riding time when there are two judges', () => {
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3,
                        judge2Vote1, judge2Vote2, judge2Vote3, judge2Vote4];
        const judges = [judge1, judge2];
        const endAt  = judge1Vote3.ended_at;
        const result = calculateRidingTime(votes, judges, endAt, competitorId);
        // Control periods when both judges vote: 10s + 5s (overlaps) = 3 points
        expect(result.points).toEqual(3);
        expect(result.activeControlTimeMs).toEqual(0);
        expect(result.activeCompetitor).toBeNull();
    });

    it ('calculates riding time when there are three judges', () => {
        const votes  = [judge1Vote1, judge1Vote2, judge1Vote3,
                        judge2Vote1, judge2Vote2, judge2Vote3, judge2Vote4,
                        judge3Vote1, judge3Vote2, judge3Vote3, judge3Vote4];
        const judges = [judge1, judge2, judge3];
        const endAt  = judge1Vote3.ended_at;
        const result = calculateRidingTime(votes, judges, endAt, competitorId);
        // Control periods when at least 2 of 3 judges vote = 7 points
        expect(result.points).toEqual(7);
        expect(result.activeControlTimeMs).toEqual(0);
        expect(result.activeCompetitor).toBeNull();
    });

    it ('calculates riding time when there a round has not ended', () => {
        const votes             = [judge1Vote1, judge1Vote2, judge1Vote3, judge1Vote4,
                                   judge2Vote1, judge2Vote2, judge2Vote3, judge2Vote4, judge2Vote5,
                                   judge3Vote1, judge3Vote2, judge3Vote3, judge3Vote4];
        const judges            = [judge1, judge2, judge3];
        const msSinceLastVote   = new Date().getTime() - judge2Vote5.started_at.getTime();
        const result            = calculateRidingTime(votes, judges, null, competitorId);

        // 21 seconds (7 points × 3) of completed control + ongoing time
        const completedMs       = 21000;
        const totalMs           = completedMs + msSinceLastVote;
        const expectedPoints    = Math.floor(totalMs / 3000);
        const expectedRemainder = totalMs % 3000;

        // Allow for timing variance (within 10 points = 30 seconds)
        expect(result.points).toBeGreaterThanOrEqual(expectedPoints - 10);
        expect(result.points).toBeLessThanOrEqual(expectedPoints + 10);
        expect(result.activeCompetitor).toEqual(competitorId);
    });
});

