/**
 * CHARACTERIZATION — RoundTimerWorker.
 *
 * Pins:
 *   - which rounds are considered (open rounds only)
 *   - elapsed-minus-pauses >= max_duration ends the round and emits match.update
 *   - PAUSES ARE EXCLUDED FROM ELAPSED TIME, the subtlest rule here, pinned
 *     explicitly for closed pauses, an open pause, and several pauses combined
 *   - an unexpired round is untouched
 *   - the exact boundary (remaining == 0 fires, remaining == 1 does not)
 *
 * `performJob()` is called directly on a scratch database (./world.ts) with
 * the clock frozen (the job reads `new Date()`); `notifyServer` is replaced to
 * capture emissions. Round durations (rDojoKombat): 180, 120, 60 s.
 */
import { afterEach, beforeEach, describe, expect, it, jest, mock, setSystemTime } from 'bun:test';

// The lifecycle service the worker calls, with `endRound` wrapped in a spy.
// `require` + `mock.module(require.resolve(...))` must precede the worker's require.
const lifecyclePath = require.resolve('../../../src/services/matchLifecycle');
const lifecycle     = require(lifecyclePath);
const realEndRound  = lifecycle.endRound;
const endRound      = jest.fn((...args) => realEndRound(...args));
mock.module(lifecyclePath, () => ({ ...lifecycle, endRound }));

const { RoundTimerWorker }     = require('../../../src/workers/roundTimerWorker');
const { EVENTS }               = require('../../../src/ws/workerWebSocket');
const { findMatchGraph }       = require('../../../src/db/repositories/matches');
const { serializeLeakedMatch } = require('../../../src/serialize');
const W = require('./world');

const MAX_DURATION = 180; // rDojoKombat round 1
const MATCH = W.X('100');
const ROUND = W.X('101');


describe('CHARACTERIZATION: RoundTimerWorker', () => {
    let world;
    let worker;
    let roundEndedWhenEmitted;

    function newWorker(db = world.db) {
        const w = new RoundTimerWorker('test-worker-token', { db });
        w.notifyServer = jest.fn(() => { roundEndedWhenEmitted = world.row('rounds', ROUND)?.ended_at ?? null; });
        return w;
    }

    /** Round 1 of a match, open since `startedSecondsAgo`, with `pauses` ([startedSecondsAgo, endedSecondsAgo | null]). */
    function openRound(startedSecondsAgo, pauses: [number, number | null][] = [], { match = MATCH, round = ROUND } = {}) {
        world.match(match).round(round, match, { startedSecondsAgo });
        pauses.forEach(([started, ended], i) => world.pause(W.X(`${round.slice(-3)}${i}`), round, { startedSecondsAgo: started, endedSecondsAgo: ended }));
    }

    const ended = (round = ROUND) => world.row('rounds', round).ended_at !== null;

    beforeEach(() => {
        setSystemTime(W.NOW);
        world = W.createWorld();
        roundEndedWhenEmitted = undefined;
        worker = newWorker();
    });

    afterEach(() => {
        setSystemTime();
        world.close();
        jest.clearAllMocks();
    });


    describe('round selection', () => {
        it('considers only open rounds (an ENDED round past its duration is ignored)', async () => {
            world.match(MATCH).round(ROUND, MATCH, { startedSecondsAgo: 1000, endedSecondsAgo: 500 });

            await worker.performJob();

            expect(endRound).not.toHaveBeenCalled();
            expect(world.writes()).toEqual([]);
        });


        it('does nothing when there are no open rounds', async () => {
            await worker.performJob();

            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        it('checks every open round independently', async () => {
            openRound(10, [], { match: W.X('200'), round: W.X('201') }); // live
            openRound(200);                                              // expired

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
            expect(ended(W.X('201'))).toBe(false);
            expect(ended()).toBe(true);
        });
    });


    describe('unexpired round', () => {
        it('leaves a freshly started round alone', async () => {
            openRound(1);

            await worker.performJob();

            expect(endRound).not.toHaveBeenCalled();
            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        // The guard is `if (timeRemaining !== 0) return`, over a value clamped
        // at 0, so one second of remaining time is enough to wait.
        it('waits while one second of the round remains', async () => {
            openRound(MAX_DURATION - 1);

            await worker.performJob();

            expect(endRound).not.toHaveBeenCalled();
        });
    });


    describe('expired round', () => {
        it('fires exactly when elapsed == max_duration', async () => {
            openRound(MAX_DURATION);

            await worker.performJob();

            expect(endRound).toHaveBeenCalledTimes(1);
        });


        it('still fires once elapsed has run well past max_duration (the value is clamped at 0)', async () => {
            openRound(MAX_DURATION + 500);

            await worker.performJob();

            expect(endRound).toHaveBeenCalledTimes(1);
        });


        it('ends the round through endRound with no options', async () => {
            openRound(200);

            await worker.performJob();

            // No `{ safe: true }`: the unsafe form.
            expect(endRound.mock.calls[0]).toEqual([worker.db, MATCH]);
            expect(ended()).toBe(true);
        });


        // The round timer emits `match.update`, NOT a dedicated round-ended
        // event. The client learns about expiry from the ordinary update payload.
        it('emits `match.update`, not a dedicated timer event', async () => {
            openRound(200);

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
            expect(worker.notifyServer.mock.calls[0][0]).toBe('match.update');
            expect(worker.notifyServer.mock.calls[0][0]).toBe(EVENTS.MATCH_UPDATE);
        });


        it('ends the round BEFORE emitting', async () => {
            openRound(200);

            await worker.performJob();

            expect(endRound).toHaveBeenCalledBefore(worker.notifyServer);
            expect(roundEndedWhenEmitted).toBe(W.NOW.toISOString());
        });


        it('emits the match payload with every round rendered individually', async () => {
            const r2 = W.X('102');
            world.match(MATCH)
                .round(ROUND, MATCH, { startedSecondsAgo: 600, endedSecondsAgo: 400 })
                .round(r2, MATCH, { startedSecondsAgo: 130 }); // round 2 lasts 120 s

            await worker.performJob();

            const [, payload] = worker.notifyServer.mock.calls[0];
            expect(payload.id).toBe(MATCH);
            expect(payload.rounds.map((r) => r.id)).toEqual([ROUND, r2]);
            expect(payload).toEqual(serializeLeakedMatch(await findMatchGraph(world.db, MATCH), { includeRounds: true }));
        });


        it('renders the payload without includeMat or includeMatchJudges', async () => {
            openRound(200);

            await worker.performJob();

            const [, payload] = worker.notifyServer.mock.calls[0];
            expect(payload).toHaveProperty('rounds');
            expect(payload).not.toHaveProperty('mat');
            expect(payload).not.toHaveProperty('judges');
        });
    });


    /**
     * THE PAUSE RULE, the subtlest part of this worker.
     *
     *   pausedMs   = sum of (resumed_at - paused_at) over CLOSED pauses only
     *   ref        = paused_at of the newest OPEN pause, else "now"
     *   remaining  = max(0, max_duration - floor((ref - started_at - pausedMs) / 1000))
     */
    describe('pauses are excluded from elapsed time', () => {
        it('does not end a round whose wall-clock age exceeds max_duration but whose paused time does not', async () => {
            // Started 230s ago, paused for 60s of that → 170s of live time < 180s.
            openRound(230, [[200, 140]]);

            await worker.performJob();

            expect(endRound).not.toHaveBeenCalled();
            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        it('subtracts EVERY closed pause, not just the most recent one', async () => {
            // Started 260s ago; two closed pauses of 50s and 40s → 170s live.
            openRound(260, [[250, 200], [150, 110]]);

            await worker.performJob();

            expect(endRound).not.toHaveBeenCalled();
        });


        it('still ends the round once live time reaches max_duration despite a pause', async () => {
            // Started 240s ago, paused 60s → exactly 180s live.
            openRound(240, [[200, 140]]);

            await worker.performJob();

            expect(endRound).toHaveBeenCalledTimes(1);
        });


        // While a pause is OPEN, the clock is frozen at paused_at: the round
        // can sit paused indefinitely without the timer expiring.
        it('freezes the clock at paused_at while a pause is open', async () => {
            // Started 10000s ago but paused (never resumed) 9900s ago →
            // only 100s of live time, regardless of how long ago that was.
            openRound(10000, [[9900, null]]);

            await worker.performJob();

            expect(endRound).not.toHaveBeenCalled();
        });


        it('does NOT subtract the open pause\'s own duration (it is already excluded by the frozen ref)', async () => {
            // Started 500s ago, paused at 300s ago and still paused →
            // ref - started_at = 200s live, pausedMs = 0 (open pause skipped).
            // 200 >= 180, so the round ends. If the open pause were ALSO
            // subtracted the round would still be running.
            openRound(500, [[300, null]]);

            await worker.performJob();

            expect(endRound).toHaveBeenCalledTimes(1);
        });


        it('uses the NEWEST open pause as the reference point', async () => {
            // An earlier closed pause of 30s, then an open pause 120s ago.
            // ref - started_at = 400 - 120 = 280s, minus 30s closed = 250s live
            // → expired.
            openRound(400, [[380, 350], [120, null]]);

            await worker.performJob();

            expect(endRound).toHaveBeenCalledTimes(1);
        });


        it('treats a zero-length round (max_duration 0) as immediately expired', async () => {
            // A 4th round is past the configured durations, so its duration is 0
            // and it is expired at once.
            world.match(MATCH)
                .round(W.X('111'), MATCH, { startedSecondsAgo: 900, endedSecondsAgo: 700 })
                .round(W.X('112'), MATCH, { startedSecondsAgo: 600, endedSecondsAgo: 480 })
                .round(W.X('113'), MATCH, { startedSecondsAgo: 400, endedSecondsAgo: 340 })
                .round(ROUND, MATCH, { startedSecondsAgo: 0 });

            await worker.performJob();

            expect(endRound).toHaveBeenCalledTimes(1);
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
