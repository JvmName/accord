import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
/**
 * Round commands on cases the lifecycle snapshot cannot reach through stored
 * rows: a round without a start time, and the paused check on its own.
 */
import * as H from './support';
import { isRoundPaused, pauseRound } from '../../src/services/roundLifecycle';

const STAMP = '2026-01-01T12:00:00.000Z';
let db;

beforeEach(() => {
    db = H.modernDb();
    H.insertRaw(db.$client, 'rounds', [{ id: 'round-1', match_id: 'match-1', ended_at: null, created_at: STAMP, updated_at: STAMP, declared_winner_id: null, stoppage: null }]);
});

afterEach(() => db.$client.close());

const pause = (id, resumedAt) => H.insertRaw(db.$client, 'round_pauses', [{ id, round_id: 'round-1', paused_at: STAMP, resumed_at: resumedAt, created_at: STAMP, updated_at: STAMP }]);

describe('pauseRound', () => {
    it('throws "Round has not started" for a round without a start time, and writes nothing', async () => {
        await expect(pauseRound(db, { id: 'round-1', created_at: null as never, ended_at: null })).rejects.toThrow('Round has not started');
        expect(db.$client.query('SELECT count(*) AS n FROM zz_audit').get().n).toBe(0);
    });
});

describe('isRoundPaused', () => {
    it('is true while a pause has no resumed_at', async () => {
        pause('p1', null);
        expect(await isRoundPaused(db, 'round-1')).toBe(true);
    });

    it('is false when the pause has a resumed_at', async () => {
        pause('p0', STAMP);
        expect(await isRoundPaused(db, 'round-1')).toBe(false);
    });

    it('is false when there are no pauses', async () => {
        expect(await isRoundPaused(db, 'round-1')).toBe(false);
    });
});
