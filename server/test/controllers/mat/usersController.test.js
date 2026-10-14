const { afterEach, beforeEach, describe, expect, it, jest } = require('bun:test');
/**
 * Mat membership: judge join/leave mid-match behaviour of the handlers behind
 * `POST /mat/:matCode/join` and `DELETE /mat/:matCode/join`
 * (`src/http/routes/matUsers.ts`), on a scratch in-memory database.
 *
 * Scenarios:
 *   A — judge joins a running consensus match (≥2 existing judges)
 *   B — judge blocked from joining a solo (1-judge) match in progress
 *   C — judge leaves a running match (open vote is auto-ended, removed from judges_matches)
 */
const { drizzle } = require('drizzle-orm/bun-sqlite');
const { Database } = require('bun:sqlite');
const { schema, migrateDb } = require('../../../src/db');
const Mats    = require('../../../src/db/repositories/mats');
const Matches = require('../../../src/db/repositories/matches');
const Rounds  = require('../../../src/db/repositories/rounds');
const Users   = require('../../../src/db/repositories/users');
const Votes   = require('../../../src/db/repositories/votes');
const MatCodes = require('../../../src/domain/matCode');
const { addAsJudge, removeUser } = require('../../../src/http/routes/matUsers');
const { renderErrors } = require('../../../src/http/envelope');
const { calculateRidingTime } = require('../../../src/domain/ridingTime');


// ---------------------------------------------------------------------------
// Scratch database. Every statement is recorded so ordering can be asserted.
// ---------------------------------------------------------------------------
let db;
let statements;

beforeEach(() => {
    statements = [];
    db = drizzle({
        client: new Database(':memory:'),
        schema,
        logger: { logQuery: (query) => statements.push(query) },
    });
    migrateDb(db);
    statements = [];
});

afterEach(() => db.$client.close());


// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------
let counter = 0;
const makeUser = (label) => Users.insertUser(db, { name: `${label}-${++counter}` });

async function makeMat(creator, judges) {
    const mat = await Mats.insertMat(db, { name: `Mat ${++counter}`, creator_id: creator.id });
    for (const judge of judges) await Mats.addMatJudge(db, mat.id, judge.id);
    return mat;
}

/** A started match on `mat` whose judges are `judges`, with round 1 open. */
async function makeRunningMatch(mat, creator, judges) {
    const red  = await makeUser('red');
    const blue = await makeUser('blue');
    const match = await Matches.insertMatch(db, {
        mat_id: mat.id, creator_id: creator.id, red_competitor_id: red.id, blue_competitor_id: blue.id,
    });
    await Matches.updateMatch(db, match.id, { started_at: new Date() });
    await Matches.setMatchJudges(db, match.id, judges.map(j => j.id));
    const round = await Rounds.insertRound(db, { match_id: match.id });
    return { match, round, red, blue };
}

/** The handler context the membership commands read. Permissions are not under test here. */
function makeContext(mat, role = MatCodes.ROLES.ADMIN) {
    return {
        db,
        currentMat:     mat,
        currentMatCode: { id: 'code', mat_id: mat.id, code: 'a.b.c', role },
        authorize:      jest.fn(async () => {}),
        renderErrors,
    };
}

const ids = (users) => users.map(u => u.id).sort();


// ---------------------------------------------------------------------------
// Scenario A — judge joins a running consensus match (≥2 existing judges)
// ---------------------------------------------------------------------------
describe('Scenario A: judge joins a running consensus match', () => {
    let judge1, judge2, judge3, mat, match, ctx;

    beforeEach(async () => {
        const creator = await makeUser('creator');
        judge1 = await makeUser('judge1');
        judge2 = await makeUser('judge2');
        judge3 = await makeUser('judge3');   // the newcomer

        mat = await makeMat(creator, [judge1, judge2]);
        ({ match } = await makeRunningMatch(mat, creator, [judge1, judge2]));
        ctx = makeContext(mat);
    });

    it('adds the new judge to the mat', async () => {
        await addAsJudge(ctx, judge3);
        expect(ids(await Mats.findMatJudges(db, mat.id))).toEqual(ids([judge1, judge2, judge3]));
    });

    it('adds the new judge to the active match judges_matches', async () => {
        await addAsJudge(ctx, judge3);
        expect(ids(await Matches.findMatchJudges(db, match.id))).toContain(judge3.id);
    });

    it('does not render an error', async () => {
        expect(await addAsJudge(ctx, judge3)).toBeNull();
    });

    it('the match now has 3 judges', async () => {
        await addAsJudge(ctx, judge3);
        expect(await Matches.findMatchJudges(db, match.id)).toHaveLength(3);
    });

    it('checks `assign` and `be assigned judge` on the mat, for the joining user', async () => {
        await addAsJudge(ctx, judge3);
        const calls = ctx.authorize.mock.calls.map(([action, scope, subject]) => [action, scope.kind, scope.mat.id, subject.user.id]);
        expect(calls).toEqual([
            ['assign',            'mat', mat.id, judge3.id],
            ['be assigned judge', 'mat', mat.id, judge3.id],
        ]);
    });

    it('threshold is still 2 for a 3-judge panel (calculateRidingTime)', () => {
        // Verify the ridingTime module honours the new threshold formula:
        // judges.length === 1 ? 1 : 2
        const j1 = { id: 'a-j1' };
        const j2 = { id: 'a-j2' };
        const j3 = { id: 'a-j3' };

        // Only j1 votes — below threshold of 2 → no periods
        const onlyOne = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,10), judge_id: j1.id }
        ];
        const periods1 = calculateRidingTime(onlyOne, [j1, j2, j3], new Date(2026,0,1,10,0,10));
        expect(periods1).toEqual([]);

        // j1 and j2 vote together — meets threshold of 2 → one 5s period
        const twoVotes = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,5), judge_id: j1.id },
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,5), judge_id: j2.id },
        ];
        const periods2 = calculateRidingTime(twoVotes, [j1, j2, j3], new Date(2026,0,1,10,0,5));
        expect(periods2).toEqual([5]);
    });
});


// ---------------------------------------------------------------------------
// Scenario B — judge blocked from joining a solo (1-judge) match in progress
// ---------------------------------------------------------------------------
describe('Scenario B: judge blocked from joining a solo match in progress', () => {
    let judge1, judge2, mat, match, ctx;

    beforeEach(async () => {
        const creator = await makeUser('creator');
        judge1 = await makeUser('judge1');
        judge2 = await makeUser('judge2');   // the blocked newcomer

        mat = await makeMat(creator, [judge1]);
        ({ match } = await makeRunningMatch(mat, creator, [judge1]));   // only 1 judge → solo match
        ctx = makeContext(mat);
    });

    it('renders an error containing "cannot join a solo match in progress"', async () => {
        const rendered = await addAsJudge(ctx, judge2);
        expect(rendered).not.toBeNull();
        expect(rendered.body).toEqual({ errors: { matCode: ['cannot join a solo match in progress'] } });
    });

    it('does NOT add the judge to the active match', async () => {
        await addAsJudge(ctx, judge2);
        expect(ids(await Matches.findMatchJudges(db, match.id))).not.toContain(judge2.id);
    });

    it('the match still has exactly 1 judge in judges_matches', async () => {
        await addAsJudge(ctx, judge2);
        expect(await Matches.findMatchJudges(db, match.id)).toHaveLength(1);
    });

    it('adds the judge to the mat even when blocked from the match', async () => {
        // The mat judge is added before the match check, and is not rolled back.
        await addAsJudge(ctx, judge2);
        expect(ids(await Mats.findMatJudges(db, mat.id))).toContain(judge2.id);
    });

    it('sets status code to 400 for the error response', async () => {
        const rendered = await addAsJudge(ctx, judge2);
        expect(rendered.statusCode).toBe(400);
    });
});


// ---------------------------------------------------------------------------
// Scenario C — judge leaves a running match
// ---------------------------------------------------------------------------
describe('Scenario C: judge leaves a running match', () => {
    let judgeA, judgeB, judgeC, mat, match, round, red, ctx;

    beforeEach(async () => {
        const creator = await makeUser('creator');
        judgeA = await makeUser('judgeA');
        judgeB = await makeUser('judgeB');
        judgeC = await makeUser('judgeC');

        mat = await makeMat(creator, [judgeA, judgeB, judgeC]);
        ({ match, round, red } = await makeRunningMatch(mat, creator, [judgeA, judgeB, judgeC]));
        await Votes.insertRidingTimeVote(db, { round_id: round.id, judge_id: judgeA.id, competitor_id: red.id });
        await Votes.insertRidingTimeVote(db, { round_id: round.id, judge_id: judgeB.id, competitor_id: red.id });
        ctx = makeContext(mat);
        statements = [];
    });

    it('removes the judge from judges_matches', async () => {
        await removeUser(ctx, judgeA, MatCodes.ROLES.ADMIN);
        expect(ids(await Matches.findMatchJudges(db, match.id))).toEqual(ids([judgeB, judgeC]));
    });

    it('removes the judge from the mat', async () => {
        await removeUser(ctx, judgeA, MatCodes.ROLES.ADMIN);
        expect(ids(await Mats.findMatJudges(db, mat.id))).toEqual(ids([judgeB, judgeC]));
    });

    it("auto-ends judge A's open riding time vote", async () => {
        await removeUser(ctx, judgeA, MatCodes.ROLES.ADMIN);
        expect(await Votes.findOpenVoteForJudge(db, round.id, judgeA.id)).toBeUndefined();
        const [voteA] = (await Votes.findRoundVotes(db, round.id)).filter(v => v.judge_id === judgeA.id);
        expect(voteA.ended_at).not.toBeNull();
    });

    it('does not end the vote of a judge who is not leaving', async () => {
        await removeUser(ctx, judgeA, MatCodes.ROLES.ADMIN);
        const voteB = await Votes.findOpenVoteForJudge(db, round.id, judgeB.id);
        expect(voteB).toBeDefined();
        expect(voteB.ended_at).toBeNull();
    });

    it('ends the vote before removing the judge from the match', async () => {
        await removeUser(ctx, judgeA, MatCodes.ROLES.ADMIN);

        const voteEnd    = statements.findIndex(q => /^update "riding_time_votes"/.test(q));
        const matchLeave = statements.findIndex(q => /^delete from "judges_matches"/.test(q));
        expect(voteEnd).toBeGreaterThanOrEqual(0);
        expect(matchLeave).toBeGreaterThanOrEqual(0);
        expect(voteEnd).toBeLessThan(matchLeave);
    });

    it('a viewer leaving touches only the viewer roster', async () => {
        const viewer = await makeUser('viewer');
        await Mats.addMatViewer(db, mat.id, viewer.id);

        await removeUser(makeContext(mat, MatCodes.ROLES.VIEWER), viewer, MatCodes.ROLES.VIEWER);

        expect(await Mats.findMatViewers(db, mat.id)).toEqual([]);
        expect(ids(await Mats.findMatJudges(db, mat.id))).toEqual(ids([judgeA, judgeB, judgeC]));
        expect(await Votes.findOpenVoteForJudge(db, round.id, judgeA.id)).toBeDefined();
    });
});


// ---------------------------------------------------------------------------
// Threshold formula — direct unit tests for calculateRidingTime
// ---------------------------------------------------------------------------
describe('calculateRidingTime threshold: judges.length === 1 ? 1 : 2', () => {
    it('single judge (threshold=1): sole vote earns full time', () => {
        const j = { id: 'thresh-j1' };
        const votes = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,9), judge_id: j.id }
        ];
        const periods = calculateRidingTime(votes, [j], new Date(2026,0,1,10,0,9));
        expect(periods).toEqual([9]);
    });

    it('two judges (threshold=2): only one judge active → no quorum, no time', () => {
        const j1 = { id: 'thresh-j2a' };
        const j2 = { id: 'thresh-j2b' };
        const votes = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,9), judge_id: j1.id }
        ];
        const periods = calculateRidingTime(votes, [j1, j2], new Date(2026,0,1,10,0,9));
        expect(periods).toEqual([]);
    });

    it('two judges (threshold=2): both active → quorum met, time counts', () => {
        const j1 = { id: 'thresh-j3a' };
        const j2 = { id: 'thresh-j3b' };
        const votes = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,6), judge_id: j1.id },
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,6), judge_id: j2.id },
        ];
        const periods = calculateRidingTime(votes, [j1, j2], new Date(2026,0,1,10,0,6));
        expect(periods).toEqual([6]);
    });

    it('five judges (threshold=2, not 3): two votes meet quorum', () => {
        const judges = [1,2,3,4,5].map(n => ({ id: `thresh-5j-${n}` }));
        const votes = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,6), judge_id: judges[0].id },
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,6), judge_id: judges[1].id },
        ];
        const periods = calculateRidingTime(votes, judges, new Date(2026,0,1,10,0,6));
        // Under old formula max(ceil(5/2),2)=3, two votes would NOT meet quorum.
        // Under new formula threshold=2, two votes DO meet quorum.
        expect(periods).toEqual([6]);
    });
});
