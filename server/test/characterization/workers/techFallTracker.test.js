/**
 * CHARACTERIZATION — TechFallTrackerWorker.
 *
 * Pins:
 *   - which rounds are considered (open rounds only)
 *   - threshold reached  → round ended in the DB + `round.tech-fall` emitted
 *   - threshold not met  → nothing happens at all
 *   - an already-ended round is never re-ended (no double emit)
 *   - the shape of the emitted payload
 *
 * `performJob()` is called directly on a scratch database (./world.js) with
 * the clock frozen; `notifyServer` is replaced to capture emissions.
 * Thresholds (rDojoKombat): 24 points in round 1, 16 in round 2; one point per
 * 3 s of two-judge consensus.
 */
const { afterEach, beforeEach, describe, expect, it, jest, mock, setSystemTime } = require('bun:test');

// The lifecycle service the worker calls, with `endRound` wrapped in a spy.
// `require` + `mock.module(require.resolve(...))` must precede the worker's require.
const lifecyclePath = require.resolve('../../../src/services/matchLifecycle');
const lifecycle     = require(lifecyclePath);
const realEndRound  = lifecycle.endRound;
const endRound      = jest.fn((...args) => realEndRound(...args));
mock.module(lifecyclePath, () => ({ ...lifecycle, endRound }));

const { TechFallTrackerWorker } = require('../../../src/workers/techFallTrackerWorker');
const { EVENTS }                = require('../../../src/ws/workerWebSocket');
const { findMatchGraph }        = require('../../../src/db/repositories/matches');
const { serializeLeakedMatch }  = require('../../../src/serialize');
const W = require('./world');

const MATCH = W.X('100');
const ROUND = W.X('101');


describe('CHARACTERIZATION: TechFallTrackerWorker', () => {
    let world;
    let worker;
    let emitted;
    let roundEndedWhenEmitted;

    function newWorker(db = world.db) {
        const w = new TechFallTrackerWorker('test-worker-token', { db });
        w.notifyServer = jest.fn((event, payload) => {
            emitted.push({ event, payload });
            roundEndedWhenEmitted = world.row('rounds', ROUND)?.ended_at ?? null;
        });
        return w;
    }

    /** Round 1 open; both judges have given red control for `seconds`. */
    function openRound(seconds, { match = MATCH, round = ROUND, voteBase = '10' } = {}) {
        world.match(match).round(round, match, { startedSecondsAgo: seconds + 5 }).consensus(voteBase, round, W.U.red, { startedSecondsAgo: seconds });
    }

    beforeEach(() => {
        setSystemTime(W.NOW);
        world = W.createWorld();
        emitted = [];
        roundEndedWhenEmitted = undefined;
        worker = newWorker();
    });

    afterEach(() => {
        setSystemTime();
        world.close();
        jest.clearAllMocks();
    });


    describe('round selection', () => {
        it('considers only open rounds (an ENDED round over the threshold is ignored)', async () => {
            world.match(MATCH).round(ROUND, MATCH, { startedSecondsAgo: 300, endedSecondsAgo: 100 })
                .consensus('10', ROUND, W.U.red, { startedSecondsAgo: 290, endedSecondsAgo: 100 });

            await worker.performJob();

            expect(endRound).not.toHaveBeenCalled();
            expect(world.writes()).toEqual([]);
        });


        it('does nothing when there are no open rounds', async () => {
            await worker.performJob();

            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        // An ended round has a non-null ended_at, so the open-rounds query
        // never returns it. That is the ONLY thing preventing a second
        // end/emit: the worker itself has no "already ended" guard, and
        // `endRound()` is called without `safe`, so it would throw on a second pass.
        it('never re-ends a round that is no longer open (no double emit)', async () => {
            openRound(80);
            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(1);

            // Next tick: the round has ended, so it is no longer returned.
            worker.notifyServer.mockClear();
            await worker.performJob();

            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        it('checks every open round independently', async () => {
            openRound(10, { match: W.X('200'), round: W.X('201'), voteBase: '20' }); // below
            openRound(80);                                                        // above

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
            expect(emitted[0].payload.id).toBe(MATCH);
            expect(world.row('rounds', W.X('201')).ended_at).toBeNull();
        });
    });


    describe('below the tech fall threshold', () => {
        it('does not end the round and does not emit', async () => {
            openRound(70); // 23 points, one short of 24

            await worker.performJob();

            expect(endRound).not.toHaveBeenCalled();
            expect(world.row('rounds', ROUND).ended_at).toBeNull();
            expect(worker.notifyServer).not.toHaveBeenCalled();
        });
    });


    describe('at or above the tech fall threshold', () => {
        it('ends the round through endRound, with no options', async () => {
            openRound(72); // exactly 24 points

            await worker.performJob();

            expect(endRound).toHaveBeenCalledTimes(1);
            // No `{ safe: true }`: the unsafe form, which throws if there is no
            // open round to end.
            expect(endRound.mock.calls[0]).toEqual([worker.db, MATCH]);
            expect(world.row('rounds', ROUND).ended_at).toBe(W.NOW.toISOString());
        });


        it('emits `round.tech-fall`', async () => {
            openRound(80);

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
            expect(worker.notifyServer.mock.calls[0][0]).toBe('round.tech-fall');
            expect(worker.notifyServer.mock.calls[0][0]).toBe(EVENTS.TECH_FALL);
        });


        it('ends the round BEFORE emitting', async () => {
            openRound(80);

            await worker.performJob();

            expect(endRound).toHaveBeenCalledBefore(worker.notifyServer);
            expect(roundEndedWhenEmitted).toBe(W.NOW.toISOString());
        });


        it('emits the match payload with every round rendered individually', async () => {
            const r2 = W.X('102');
            world.match(MATCH)
                .round(ROUND, MATCH, { startedSecondsAgo: 400, endedSecondsAgo: 300 })
                .round(r2, MATCH, { startedSecondsAgo: 60 })
                .consensus('10', r2, W.U.red, { startedSecondsAgo: 50 }); // 16 points: round 2's threshold

            await worker.performJob();

            const [, payload] = worker.notifyServer.mock.calls[0];
            expect(payload.id).toBe(MATCH);
            expect(payload.rounds.map((r) => r.id)).toEqual([ROUND, r2]);
            expect(payload).toEqual(serializeLeakedMatch(await findMatchGraph(world.db, MATCH), { includeRounds: true }));
        });


        // Unlike the match-update and break-transition jobs, the tech-fall
        // payload is rendered WITHOUT the mat and the judges.
        it('renders the payload without includeMat or includeMatchJudges', async () => {
            openRound(80);

            await worker.performJob();

            const [, payload] = worker.notifyServer.mock.calls[0];
            expect(payload).toHaveProperty('rounds');
            expect(payload).not.toHaveProperty('mat');
            expect(payload).not.toHaveProperty('judges');
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
