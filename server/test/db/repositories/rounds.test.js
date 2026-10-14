const { afterEach, beforeEach, describe, expect, it } = require('bun:test');
/** rounds + round_pauses repository (task 10). Real in-memory SQLite. */
const { ID, at, freshDb, insertRows, seedBase, stampsAt } = require('./support');
const Rounds = require('../../../src/db/repositories/rounds');

let db;
beforeEach(() => {
    db = freshDb();
    seedBase(db);
    insertRows(db, 'matches', ['m1', 'm2'].map((id) => ({
        id, mat_id: ID.matMain, creator_id: ID.creator,
        red_competitor_id: ID.red, blue_competitor_id: ID.blue, ...stampsAt(20),
    })));
});
afterEach(() => db.$client.close());

const ids = (rows) => rows.map((r) => r.id);
const round = (id, matchId, seconds, extra = {}) => ({ id, match_id: matchId, ...stampsAt(seconds), ...extra });

describe('findOpenRounds', () => {
    it('returns every open round across matches, in insertion order', async () => {
        insertRows(db, 'rounds', [
            round('r-b', 'm2', 50),
            round('r-ended', 'm1', 10, { ended_at: at(20) }),
            round('r-a', 'm1', 40),
        ]);
        expect(ids(await Rounds.findOpenRounds(db))).toEqual(['r-b', 'r-a']);
    });
});

describe('findMatchRounds / findLastRound', () => {
    it('orders by created_at, ties by insertion (legacy stable JS sort)', async () => {
        insertRows(db, 'rounds', [
            round('r3', 'm1', 300),
            round('r1', 'm1', 100),
            round('r2b', 'm1', 200),
            round('r2a', 'm1', 200),
            round('x', 'm2', 50),
        ]);
        expect(ids(await Rounds.findMatchRounds(db, 'm1'))).toEqual(['r1', 'r2b', 'r2a', 'r3']);
        expect((await Rounds.findLastRound(db, 'm1')).id).toBe('r3');
    });

    it('findLastRound breaks a created_at tie by the LAST inserted (last element of the sorted list)', async () => {
        insertRows(db, 'rounds', [round('first', 'm1', 100), round('second', 'm1', 100)]);
        expect((await Rounds.findLastRound(db, 'm1')).id).toBe('second');
    });

    it('[] and null for a match without rounds', async () => {
        expect(await Rounds.findMatchRounds(db, 'm1')).toEqual([]);
        expect(await Rounds.findLastRound(db, 'm1')).toBeNull();
    });
});

describe('pauses', () => {
    beforeEach(() => insertRows(db, 'rounds', [round('r1', 'm1', 100), round('r2', 'm1', 200)]));

    it('findRoundPauses: this round only, insertion order', async () => {
        insertRows(db, 'round_pauses', [
            { id: 'p2', round_id: 'r1', paused_at: at(150), ...stampsAt(150) },
            { id: 'p1', round_id: 'r1', paused_at: at(120), resumed_at: at(130), ...stampsAt(120) },
            { id: 'px', round_id: 'r2', paused_at: at(210), ...stampsAt(210) },
        ]);
        const pauses = await Rounds.findRoundPauses(db, 'r1');
        expect(ids(pauses)).toEqual(['p2', 'p1']);
        expect(pauses[1].resumed_at).toEqual(at(130));
        expect(pauses[0].resumed_at).toBeNull();
    });

    it('findCurrentPause: the LAST open pause in insertion order, else null', async () => {
        expect(await Rounds.findCurrentPause(db, 'r1')).toBeNull();
        insertRows(db, 'round_pauses', [
            { id: 'open-1', round_id: 'r1', paused_at: at(110), ...stampsAt(110) },
            { id: 'open-2', round_id: 'r1', paused_at: at(105), ...stampsAt(105) },
            { id: 'closed', round_id: 'r1', paused_at: at(120), resumed_at: at(125), ...stampsAt(120) },
        ]);
        expect((await Rounds.findCurrentPause(db, 'r1')).id).toBe('open-2');
    });

    it('insertRoundPause / setPauseResumed', async () => {
        const pause = await Rounds.insertRoundPause(db, { round_id: 'r1', paused_at: at(150) });
        expect(pause).toMatchObject({ round_id: 'r1', paused_at: at(150), resumed_at: null });
        expect((await Rounds.findCurrentPause(db, 'r1')).id).toBe(pause.id);

        const resumed = await Rounds.setPauseResumed(db, pause.id, at(160));
        expect(resumed.resumed_at).toEqual(at(160));
        expect(resumed.updated_at.getTime()).toBeGreaterThanOrEqual(pause.updated_at.getTime());
        expect(await Rounds.findCurrentPause(db, 'r1')).toBeNull();
        expect(await Rounds.setPauseResumed(db, 'missing')).toBeNull();
    });

    it('setPauseResumed defaults to now', async () => {
        const pause = await Rounds.insertRoundPause(db, { round_id: 'r1', paused_at: at(150) });
        const before = Date.now();
        const resumed = await Rounds.setPauseResumed(db, pause.id);
        expect(resumed.resumed_at.getTime()).toBeGreaterThanOrEqual(before);
    });
});

describe('insertRound / updateRound', () => {
    it('insertRound: created_at (= round start) is now; nullable columns are null', async () => {
        const before = Date.now();
        const row = await Rounds.insertRound(db, { match_id: 'm1' });
        expect(row).toMatchObject({ match_id: 'm1', ended_at: null, declared_winner_id: null, stoppage: null });
        expect(row.created_at.getTime()).toBeGreaterThanOrEqual(before);
        expect((await Rounds.findLastRound(db, 'm1')).id).toBe(row.id);
    });

    it('updateRound writes the patch and bumps updated_at', async () => {
        insertRows(db, 'rounds', [round('r1', 'm1', 100)]);
        const ended = await Rounds.updateRound(db, 'r1', { ended_at: at(160) });
        expect(ended.ended_at).toEqual(at(160));
        expect(ended.created_at).toEqual(at(100));
        expect(ended.updated_at.getTime()).toBeGreaterThan(at(100).getTime());
        expect(await Rounds.findOpenRounds(db)).toEqual([]);

        expect(await Rounds.updateRound(db, 'r1', { declared_winner_id: ID.red, stoppage: true }))
            .toMatchObject({ declared_winner_id: ID.red, stoppage: true });
        expect(await Rounds.updateRound(db, 'r1', { declared_winner_id: null, stoppage: null }))
            .toMatchObject({ declared_winner_id: null, stoppage: null });
        expect(await Rounds.updateRound(db, 'r1', { stoppage: false })).toMatchObject({ stoppage: false });
        expect(await Rounds.updateRound(db, 'missing', { ended_at: at(1) })).toBeNull();
    });
});
