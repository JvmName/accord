/**
 * CHARACTERIZATION — BreakTransitionWorker.
 *
 * Pins:
 *   - which matches are considered (break started AND not ended)
 *   - an elapsed break clears the break fields, starts the next round and
 *     emits `break.ended`
 *   - an unexpired break is a complete no-op
 *   - NO FOURTH ROUND: a match that has ended is excluded by the query, which
 *     is the only thing standing between this worker and a 4th round
 *   - the exact off-by-one boundary (elapsed < duration → wait; == → fire)
 *
 * `performJob()` is called directly on a scratch database (./world.ts) with
 * the clock frozen; `notifyServer` is replaced to capture emissions.
 */
import { afterEach, beforeEach, describe, expect, it, jest, setSystemTime } from 'bun:test';

import { BreakTransitionWorker } from '../../../src/workers/breakTransitionWorker';
import { EVENTS } from '../../../src/ws/workerWebSocket';
import { findMatchGraph } from '../../../src/db/repositories/matches';
import { serializeMatch } from '../../../src/serialize';
import * as W from './world';

const MATCH = W.X('100');


describe('CHARACTERIZATION: BreakTransitionWorker', () => {
    let world;
    let worker;

    function newWorker(db = world.db) {
        const w = new BreakTransitionWorker('test-worker-token', { db });
        w.notifyServer = jest.fn();
        return w;
    }

    /** A match whose round 1 ended when its break started `secondsIntoBreak` ago. */
    function matchInBreak({ id = MATCH, secondsIntoBreak = 0, breakDuration = 60, ended = false } = {}) {
        world.match(id, { ended, breakSecondsAgo: secondsIntoBreak, breakDuration })
            .round(W.X(`${id.slice(-3)}1`), id, { startedSecondsAgo: secondsIntoBreak + 180, endedSecondsAgo: secondsIntoBreak });
        return id;
    }

    const roundsOf = (id) => world.client.query('SELECT id, ended_at FROM rounds WHERE match_id = ? ORDER BY rowid').all(id);

    beforeEach(() => {
        setSystemTime(W.NOW);
        world = W.createWorld();
        worker = newWorker();
    });

    afterEach(() => {
        setSystemTime();
        world.close();
    });


    describe('match selection', () => {
        it('considers matches with a break started that have NOT ended', async () => {
            matchInBreak({ id: W.X('100'), secondsIntoBreak: 90 });                 // selected
            matchInBreak({ id: W.X('200'), secondsIntoBreak: 90, ended: true });    // ended: excluded
            world.match(W.X('300')).round(W.X('301'), W.X('300'), { startedSecondsAgo: 300, endedSecondsAgo: 200 }); // no break: excluded

            await worker.performJob();

            expect(worker.notifyServer.mock.calls.map(([, payload]) => payload.id)).toEqual([W.X('100')]);
            expect(roundsOf(W.X('200'))).toHaveLength(1);
            expect(roundsOf(W.X('300'))).toHaveLength(1);
        });


        // THE NO-FOURTH-ROUND RULE, worker half.
        //
        // A match always runs exactly maxRounds (3) rounds. When the final
        // round ends, the match is ended instead of a break being started (the
        // lifecycle snapshot tests cover that half). This worker's guarantee
        // is narrower and lives entirely in the query: an ended match is
        // excluded, so even a match that somehow still carries a break can
        // never be given a fourth round here.
        it('never starts a round for a match that has ended, because "not ended" is part of the query', async () => {
            const id = matchInBreak({ secondsIntoBreak: 600, ended: true });

            await worker.performJob();

            // An ended match is never returned, so nothing happens: there is
            // no fourth round for it to start.
            expect(worker.notifyServer).not.toHaveBeenCalled();
            expect(roundsOf(id)).toHaveLength(1);
            expect(world.writes()).toEqual([]);
        });


        it('does nothing when no match is in a break', async () => {
            await worker.performJob();

            expect(worker.notifyServer).not.toHaveBeenCalled();
            expect(world.writes()).toEqual([]);
        });
    });


    describe('unexpired break', () => {
        it('is a complete no-op: no write, no new round, no emit', async () => {
            matchInBreak({ secondsIntoBreak: 10, breakDuration: 60 });

            await worker.performJob();

            expect(world.writes()).toEqual([]);
            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        it('waits while elapsed is one second short of break_duration', async () => {
            const id = matchInBreak({ secondsIntoBreak: 59, breakDuration: 60 });

            await worker.performJob();

            expect(roundsOf(id)).toHaveLength(1);
        });
    });


    describe('expired break', () => {
        it('fires exactly at elapsed == break_duration (the comparison is `elapsed < duration`)', async () => {
            const id = matchInBreak({ secondsIntoBreak: 60, breakDuration: 60 });

            await worker.performJob();

            expect(roundsOf(id)).toHaveLength(2);
        });


        it('clears break_started_at and break_duration and persists BEFORE starting the round', async () => {
            const id = matchInBreak({ secondsIntoBreak: 90, breakDuration: 60 });

            await worker.performJob();

            const match = world.row('matches', id);
            expect(match.break_started_at).toBeNull();
            expect(match.break_duration).toBeNull();
            expect(world.writes()).toEqual(['UPDATE matches', 'INSERT rounds']);
        });


        it('starts the next round', async () => {
            const id = matchInBreak({ secondsIntoBreak: 90 });

            await worker.performJob();

            const rounds = roundsOf(id);
            expect(rounds).toHaveLength(2);
            expect(rounds[1].ended_at).toBeNull();
        });


        it('emits `break.ended`', async () => {
            matchInBreak({ secondsIntoBreak: 90 });

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
            expect(worker.notifyServer.mock.calls[0][0]).toBe('break.ended');
            expect(worker.notifyServer.mock.calls[0][0]).toBe(EVENTS.BREAK_ENDED);
        });


        // The payload comes from the match as it is AFTER the new round
        // opened, so the newly created round is present in it.
        it('re-reads the match by id and emits the fresh record\'s payload', async () => {
            const id = matchInBreak({ id: W.X('700'), secondsIntoBreak: 90 });

            await worker.performJob();

            const [event, payload] = worker.notifyServer.mock.calls[0];
            expect(event).toBe(EVENTS.BREAK_ENDED);
            expect(payload.id).toBe(id);
            expect(payload.rounds).toHaveLength(2);
            expect(payload.rounds[1].id).toBe(roundsOf(id)[1].id);
            expect(payload).toEqual(serializeMatch((await findMatchGraph(world.db, id))!, { includeMat: true, includeMatchJudges: true, includeRounds: true }));
        });


        it('renders with includeMat, includeMatchJudges and includeRounds', async () => {
            matchInBreak({ secondsIntoBreak: 90 });

            await worker.performJob();

            const [, payload] = worker.notifyServer.mock.calls[0];
            expect(payload).toHaveProperty('mat');
            expect(payload).toHaveProperty('judges');
            expect(payload).toHaveProperty('rounds');
        });


        it('handles several expired breaks in the same tick', async () => {
            matchInBreak({ id: W.X('100'), secondsIntoBreak: 90 });
            matchInBreak({ id: W.X('200'), secondsIntoBreak: 61 });

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(2);
        });
    });


    describe('failure behavior', () => {
        // The base loop does not catch a rejected performJob(); the worker
        // stops re-queuing. Pinned so a change is deliberate.
        it('lets a rejection escape performJob() (unhandled)', async () => {
            const failing = newWorker(W.failingDb('db down'));

            await expect(failing.performJob()).rejects.toThrow('db down');
        });
    });
});
