const { afterEach, beforeEach, describe, expect, it } = require('bun:test');
/** riding_time_votes repository (task 10). Real in-memory SQLite. */
const { ID, at, freshDb, insertRows, seedBase, stampsAt } = require('./support');
const Votes = require('../../../src/db/repositories/votes');

let db;
beforeEach(() => {
    db = freshDb();
    seedBase(db);
    insertRows(db, 'rounds', [
        { id: 'r1', match_id: 'm1', ...stampsAt(100) },
        { id: 'r2', match_id: 'm1', ...stampsAt(200) },
    ]);
});
afterEach(() => db.$client.close());

const ids = (rows) => rows.map((r) => r.id);
const vote = (id, roundId, judgeId, seconds, extra = {}) =>
    ({ id, round_id: roundId, judge_id: judgeId, competitor_id: ID.red, ...stampsAt(seconds), ...extra });

describe('reads', () => {
    beforeEach(() => insertRows(db, 'riding_time_votes', [
        vote('v3', 'r1', ID.judgeB, 130),
        vote('v1', 'r1', ID.judgeA, 110, { ended_at: at(120) }),
        vote('v2', 'r1', ID.judgeA, 125),
        vote('vx', 'r2', ID.judgeA, 210),
    ]));

    it('findRoundVotes: this round only, insertion order (not created_at)', async () => {
        expect(ids(await Votes.findRoundVotes(db, 'r1'))).toEqual(['v3', 'v1', 'v2']);
    });

    it('findOpenRoundVotes: only ended_at IS NULL', async () => {
        expect(ids(await Votes.findOpenRoundVotes(db, 'r1'))).toEqual(['v3', 'v2']);
    });

    it('findOpenVoteForJudge: that judge\'s open vote in this round', async () => {
        expect((await Votes.findOpenVoteForJudge(db, 'r1', ID.judgeA)).id).toBe('v2');
        expect((await Votes.findOpenVoteForJudge(db, 'r2', ID.judgeA)).id).toBe('vx');
    });

    it('findOpenVoteForJudge returns UNDEFINED (not null) when none, like legacy `[0]`', async () => {
        expect(await Votes.findOpenVoteForJudge(db, 'r2', ID.judgeB)).toBeUndefined();
    });

    it('findOpenVoteForJudge picks the first open one in insertion order if several exist', async () => {
        insertRows(db, 'riding_time_votes', [vote('v-later', 'r1', ID.judgeB, 100)]);
        expect((await Votes.findOpenVoteForJudge(db, 'r1', ID.judgeB)).id).toBe('v3');
    });
});

describe('writes', () => {
    it('insertRidingTimeVote opens a vote stamped now', async () => {
        const before = Date.now();
        const row = await Votes.insertRidingTimeVote(db, { round_id: 'r1', judge_id: ID.judgeA, competitor_id: ID.blue });
        expect(row).toMatchObject({ round_id: 'r1', judge_id: ID.judgeA, competitor_id: ID.blue, ended_at: null });
        expect(row.created_at.getTime()).toBeGreaterThanOrEqual(before);
        expect(await Votes.findOpenVoteForJudge(db, 'r1', ID.judgeA)).toEqual(row);
    });

    it('setVoteEnded closes it (explicit time or now); null for a missing vote', async () => {
        const row = await Votes.insertRidingTimeVote(db, { round_id: 'r1', judge_id: ID.judgeA, competitor_id: ID.blue });
        const ended = await Votes.setVoteEnded(db, row.id, at(150));
        expect(ended.ended_at).toEqual(at(150));
        expect(ended.created_at).toEqual(row.created_at);
        expect(await Votes.findOpenVoteForJudge(db, 'r1', ID.judgeA)).toBeUndefined();

        const other = await Votes.insertRidingTimeVote(db, { round_id: 'r1', judge_id: ID.judgeB, competitor_id: ID.red });
        const before = Date.now();
        expect((await Votes.setVoteEnded(db, other.id)).ended_at.getTime()).toBeGreaterThanOrEqual(before);
        expect(await Votes.setVoteEnded(db, 'missing')).toBeNull();
    });
});
