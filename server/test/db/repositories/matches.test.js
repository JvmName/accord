const { afterEach, beforeEach, describe, expect, it } = require('bun:test');
/** matches repository (task 10): lookups, worker queries, judges, hot-path graph, writes. Real in-memory SQLite. */
const { ID, at, freshDb, insertRows, seedBase, stampsAt } = require('./support');
const Matches = require('../../../src/db/repositories/matches');
const Rounds  = require('../../../src/db/repositories/rounds');
const Votes   = require('../../../src/db/repositories/votes');

let db;
beforeEach(() => { db = freshDb(); seedBase(db); });
afterEach(() => db.$client.close());

const ids = (rows) => rows.map((r) => r.id);
const match = (id, overrides = {}) => ({
    id, mat_id: ID.matMain, creator_id: ID.creator,
    red_competitor_id: ID.red, blue_competitor_id: ID.blue, ...stampsAt(20), ...overrides,
});

describe('findMatchById', () => {
    it('finds; null when missing or nullish', async () => {
        insertRows(db, 'matches', [match(ID.matchOpen, { started_at: at(30) })]);
        expect(await Matches.findMatchById(db, ID.matchOpen)).toMatchObject({
            id: ID.matchOpen, red_score: 0, blue_score: 0, started_at: at(30), ended_at: null,
            break_started_at: null, break_duration: null,
        });
        expect(await Matches.findMatchById(db, 'missing')).toBeNull();
        expect(await Matches.findMatchById(db, undefined)).toBeNull();
    });
});

describe('findMatchesInBreak (worker query)', () => {
    it('break_started_at NOT NULL and ended_at NULL; ordered by (mat_id, rowid)', async () => {
        insertRows(db, 'matches', [
            match('b-main-1', { break_started_at: at(50), break_duration: 60 }),
            match('b-empty',  { mat_id: ID.matEmpty, break_started_at: at(50), break_duration: 60 }),
            match('no-break'),
            match('ended-in-break', { break_started_at: at(50), break_duration: 60, ended_at: at(70) }),
            match('b-main-2', { break_started_at: at(40), break_duration: 30 }),
        ]);
        // matEmpty id (...e1) sorts after matMain (...e0)
        expect(ids(await Matches.findMatchesInBreak(db))).toEqual(['b-main-1', 'b-main-2', 'b-empty']);
    });
});

describe('match judges', () => {
    beforeEach(() => insertRows(db, 'matches', [match('m1'), match('m2')]));

    it('setMatchJudges adds, keeps existing rows untouched, removes the rest (belongsToMany#set)', async () => {
        insertRows(db, 'judges_matches', [
            { match_id: 'm1', user_id: ID.judgeA, ...stampsAt(5) },
            { match_id: 'm1', user_id: ID.viewer, ...stampsAt(5) },
            { match_id: 'm2', user_id: ID.viewer, ...stampsAt(5) },
        ]);
        await Matches.setMatchJudges(db, 'm1', [ID.judgeB, ID.judgeA]);
        expect(ids(await Matches.findMatchJudges(db, 'm1'))).toEqual([ID.judgeA, ID.judgeB]);
        const kept = db.$client.query(`SELECT created_at FROM judges_matches WHERE match_id='m1' AND user_id=?`).get(ID.judgeA);
        expect(kept.created_at).toBe(at(5).toISOString());
        expect(ids(await Matches.findMatchJudges(db, 'm2'))).toEqual([ID.viewer]);

        await Matches.setMatchJudges(db, 'm1', []);
        expect(await Matches.findMatchJudges(db, 'm1')).toEqual([]);
        expect(ids(await Matches.findMatchJudges(db, 'm2'))).toEqual([ID.viewer]);
    });

    it('addMatchJudge is idempotent; removeMatchJudge removes only that pair', async () => {
        await Matches.addMatchJudge(db, 'm1', ID.judgeB);
        await Matches.addMatchJudge(db, 'm1', ID.judgeB);
        await Matches.addMatchJudge(db, 'm2', ID.judgeB);
        expect(ids(await Matches.findMatchJudges(db, 'm1'))).toEqual([ID.judgeB]);
        await Matches.removeMatchJudge(db, 'm1', ID.judgeB);
        expect(await Matches.findMatchJudges(db, 'm1')).toEqual([]);
        expect(ids(await Matches.findMatchJudges(db, 'm2'))).toEqual([ID.judgeB]);
    });
});

describe('findMatchGraph / findMatchGraphsByIds (hot path)', () => {
    beforeEach(() => {
        insertRows(db, 'matches', [match('m1', { started_at: at(100) }), match('m2', { red_competitor_id: 'ghost' })]);
        insertRows(db, 'judges_matches', [
            { match_id: 'm1', user_id: ID.judgeB, ...stampsAt(100) },
            { match_id: 'm1', user_id: ID.judgeA, ...stampsAt(100) },
        ]);
        insertRows(db, 'rounds', [
            { id: 'r2', match_id: 'm1', ...stampsAt(200) },
            { id: 'r1', match_id: 'm1', ...stampsAt(100), ended_at: at(160), declared_winner_id: ID.red, stoppage: false },
        ]);
        insertRows(db, 'riding_time_votes', [
            { id: 'v2', round_id: 'r1', judge_id: ID.judgeB, competitor_id: ID.red, ...stampsAt(110), ended_at: at(140) },
            { id: 'v1', round_id: 'r1', judge_id: ID.judgeA, competitor_id: ID.red, ...stampsAt(110), ended_at: at(140) },
            { id: 'v3', round_id: 'r2', judge_id: ID.judgeA, competitor_id: ID.blue, ...stampsAt(210) },
        ]);
        insertRows(db, 'round_pauses', [{ id: 'p1', round_id: 'r2', paused_at: at(220), ...stampsAt(220) }]);
    });

    it('loads mat, competitors, judges, rounds -> votes/pauses with legacy orderings', async () => {
        const g = await Matches.findMatchGraph(db, 'm1');
        expect(g.id).toBe('m1');
        expect(g.started_at).toEqual(at(100));
        expect(g.mat.id).toBe(ID.matMain);
        expect(g.redCompetitor.id).toBe(ID.red);
        expect(g.blueCompetitor.name).toBe('Blair Blue');
        expect(ids(g.judges)).toEqual([ID.judgeA, ID.judgeB]);
        expect(ids(g.rounds)).toEqual(['r1', 'r2']);
        expect(ids(g.rounds[0].ridingTimeVotes)).toEqual(['v2', 'v1']);
        expect(g.rounds[0]).toMatchObject({ ended_at: at(160), declared_winner_id: ID.red, stoppage: false });
        expect(ids(g.rounds[1].pauses)).toEqual(['p1']);
        expect(g.rounds[1].pauses[0].paused_at).toEqual(at(220));
        expect(g).not.toHaveProperty('judgesMatches');
    });

    it('agrees with the single-purpose functions', async () => {
        const g = await Matches.findMatchGraph(db, 'm1');
        const { mat, redCompetitor, blueCompetitor, judges, rounds, ...row } = g;
        expect(row).toEqual(await Matches.findMatchById(db, 'm1'));
        expect(judges).toEqual(await Matches.findMatchJudges(db, 'm1'));
        expect(rounds.map(({ ridingTimeVotes, pauses, ...r }) => r)).toEqual(await Rounds.findMatchRounds(db, 'm1'));
        for (const r of rounds) {
            expect(r.ridingTimeVotes).toEqual(await Votes.findRoundVotes(db, r.id));
            expect(r.pauses).toEqual(await Rounds.findRoundPauses(db, r.id));
        }
    });

    it('missing related rows become null / []', async () => {
        const g = await Matches.findMatchGraph(db, 'm2');
        expect(g.redCompetitor).toBeNull();
        expect(g.blueCompetitor.id).toBe(ID.blue);
        expect(g.judges).toEqual([]);
        expect(g.rounds).toEqual([]);
        expect(await Matches.findMatchGraph(db, 'missing')).toBeNull();
    });

    it('findMatchGraphsByIds: one query, keyed by id, missing ids absent, duplicates fine', async () => {
        const graphs = await Matches.findMatchGraphsByIds(db, ['m2', 'm1', 'missing', 'm1']);
        expect([...graphs.keys()].sort()).toEqual(['m1', 'm2']);
        expect(graphs.get('m1')).toEqual(await Matches.findMatchGraph(db, 'm1'));
        expect((await Matches.findMatchGraphsByIds(db, [])).size).toBe(0);
    });
});

describe('writes', () => {
    it('insertMatch: scores default to 0, datetimes null, stamps now', async () => {
        const row = await Matches.insertMatch(db, {
            mat_id: ID.matMain, creator_id: ID.creator, red_competitor_id: ID.red, blue_competitor_id: ID.blue,
        });
        expect(row).toMatchObject({ red_score: 0, blue_score: 0, started_at: null, ended_at: null, break_started_at: null, break_duration: null });
        expect(row.id).toBeString();
        expect(row.updated_at).toEqual(row.created_at);
    });

    it('updateMatch writes the patch, bumps updated_at, can null columns, null when missing', async () => {
        insertRows(db, 'matches', [match('m1')]);
        const started = await Matches.updateMatch(db, 'm1', { started_at: at(30) });
        expect(started.started_at).toEqual(at(30));
        expect(started.updated_at.getTime()).toBeGreaterThan(at(20).getTime());

        await Matches.updateMatch(db, 'm1', { break_started_at: at(40), break_duration: 60 });
        expect((await Matches.findMatchesInBreak(db)).map((m) => m.id)).toEqual(['m1']);
        const cleared = await Matches.updateMatch(db, 'm1', { break_started_at: null, break_duration: null, ended_at: at(50) });
        expect(cleared).toMatchObject({ break_started_at: null, break_duration: null, ended_at: at(50), started_at: at(30) });
        expect(await Matches.updateMatch(db, 'missing', { ended_at: at(1) })).toBeNull();
    });
});
