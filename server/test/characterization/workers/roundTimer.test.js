/**
 * CHARACTERIZATION — RoundTimerWorker.
 *
 * Zero coverage before task 02b. Pins:
 *   - which rounds are considered (open rounds only)
 *   - elapsed-minus-pauses >= max_duration ends the round and emits match.update
 *   - PAUSES ARE EXCLUDED FROM ELAPSED TIME — the subtlest rule here, pinned
 *     explicitly for closed pauses, an open pause, and several pauses combined
 *   - an unexpired round is untouched
 *   - the exact boundary (remaining == 0 fires, remaining == 1 does not)
 *
 * Unlike the other two workers, `#computeTimeRemaining` calls `new Date()`
 * (not `Date.now()`), which a `spyOn(Date, 'now')` does NOT affect. Time is
 * therefore controlled with `TestHelpers.Time.setSystemTime`, which drives
 * bun's `setSystemTime` — this is the first call site of that helper
 * (FINDINGS.md F-10).
 *
 * Consumed by task 14.
 */
const { afterEach, beforeEach, describe, expect, it, jest, mock } = require('bun:test');

// bun's mock.module() does NOT hoist (F-09.1); bare specifiers no-op (F-09.2).
mock.module('../../../models/round', () => ({ Round: { getOpenRounds: jest.fn().mockResolvedValue([]) } }));
mock.module('../../../models/match', () => ({ Match: { where: jest.fn().mockResolvedValue([]), find: jest.fn() } }));
mock.module(require.resolve('socket.io-client'), () => ({ io: jest.fn(() => ({ on: jest.fn(), emit: jest.fn() })) }));
mock.module('../../../lib/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() } }));

const { RoundTimerWorker } = require('../../../lib/workerQueue/roundTimerWorker');
const { Round }            = require('../../../models/round');
const { EVENTS }           = require('../../../lib/server/workerWebSocket');
const   TestHelpers        = require('../../helpers');


const NOW      = new Date('2026-01-01T12:00:00.000Z');
const NOW_MS   = NOW.getTime();
const MAX_DURATION = 180; // rDojoKombat round 1


/** `ago` seconds before NOW. */
function secondsAgo(seconds) {
    return new Date(NOW_MS - seconds * 1000);
}


function pause({ startedSecondsAgo, endedSecondsAgo }) {
    return {
        paused_at:  secondsAgo(startedSecondsAgo),
        resumed_at: endedSecondsAgo === null ? null : secondsAgo(endedSecondsAgo),
        get isOpen() { return !this.resumed_at; },
    };
}


function fakeMatch({ id = 'match-1', rounds = [] } = {}) {
    return {
        id,
        endRound:      jest.fn().mockResolvedValue(undefined),
        getRounds:     jest.fn().mockResolvedValue(rounds),
        toApiResponse: jest.fn().mockResolvedValue({ id, rounds: 'PLACEHOLDER' }),
    };
}


function fakeRound({ id = 'round-1', startedSecondsAgo, pauses = [], maxDuration = MAX_DURATION, match } = {}) {
    const round = {
        id,
        started_at:    secondsAgo(startedSecondsAgo),
        getMaxDuration: jest.fn().mockResolvedValue(maxDuration),
        getPauses:      jest.fn().mockResolvedValue(pauses),
        toApiResponse:  jest.fn().mockResolvedValue({ id }),
    };
    round.getMatch = jest.fn().mockResolvedValue(match || fakeMatch({ rounds: [round] }));
    return round;
}


describe('CHARACTERIZATION: RoundTimerWorker', () => {
    let worker;

    beforeEach(() => {
        TestHelpers.Time.setSystemTime(NOW);
        worker = new RoundTimerWorker('test-worker-token');
        jest.spyOn(worker, 'notifyServer').mockImplementation(() => {});
        Round.getOpenRounds.mockResolvedValue([]);
    });

    afterEach(() => {
        TestHelpers.Time.useRealTimers();
        jest.clearAllMocks();
    });


    describe('round selection', () => {
        it('considers only open rounds, via Round.getOpenRounds()', async () => {
            await worker.performJob();

            expect(Round.getOpenRounds).toHaveBeenCalledTimes(1);
            expect(Round.getOpenRounds).toHaveBeenCalledWith();
        });


        it('does nothing when there are no open rounds', async () => {
            await worker.performJob();

            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        it('checks every open round independently', async () => {
            const live    = fakeRound({ id: 'live',    startedSecondsAgo: 10  });
            const expired = fakeRound({ id: 'expired', startedSecondsAgo: 200 });
            Round.getOpenRounds.mockResolvedValue([live, expired]);

            await worker.performJob();

            expect(live.getMaxDuration).toHaveBeenCalledTimes(1);
            expect(expired.getMaxDuration).toHaveBeenCalledTimes(1);
            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
        });
    });


    describe('unexpired round', () => {
        it('leaves a freshly started round alone', async () => {
            const match = fakeMatch();
            const round = fakeRound({ startedSecondsAgo: 1, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).not.toHaveBeenCalled();
            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        // The guard is `if (timeRemaining !== 0) return`, over a value clamped
        // by Math.max(0, …) — so one second of remaining time is enough to wait.
        it('waits while one second of the round remains', async () => {
            const match = fakeMatch();
            const round = fakeRound({ startedSecondsAgo: MAX_DURATION - 1, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).not.toHaveBeenCalled();
        });
    });


    describe('expired round', () => {
        it('fires exactly when elapsed == max_duration', async () => {
            const match = fakeMatch();
            const round = fakeRound({ startedSecondsAgo: MAX_DURATION, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).toHaveBeenCalledTimes(1);
        });


        it('still fires once elapsed has run well past max_duration (the value is clamped at 0)', async () => {
            const match = fakeMatch();
            const round = fakeRound({ startedSecondsAgo: MAX_DURATION + 500, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).toHaveBeenCalledTimes(1);
        });


        it('ends the round through Match#endRound with no options', async () => {
            const match = fakeMatch();
            const round = fakeRound({ startedSecondsAgo: 200, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            // No `{ safe: true }` — the unsafe form.
            expect(match.endRound).toHaveBeenCalledWith();
        });


        // NOTE: the round timer emits `match.update`, NOT a dedicated
        // round-ended event. The client learns about expiry from the ordinary
        // update payload.
        it('emits `match.update`, not a dedicated timer event', async () => {
            const round = fakeRound({ startedSecondsAgo: 200 });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
            expect(worker.notifyServer.mock.calls[0][0]).toBe('match.update');
            expect(worker.notifyServer.mock.calls[0][0]).toBe(EVENTS.MATCH_UPDATE);
        });


        it('ends the round BEFORE emitting', async () => {
            const match = fakeMatch();
            const round = fakeRound({ startedSecondsAgo: 200, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).toHaveBeenCalledBefore(worker.notifyServer);
        });


        it('emits the match payload with rounds rendered individually', async () => {
            const roundA = { id: 'r1', toApiResponse: jest.fn().mockResolvedValue({ id: 'r1' }) };
            const roundB = { id: 'r2', toApiResponse: jest.fn().mockResolvedValue({ id: 'r2' }) };
            const match  = fakeMatch({ rounds: [roundA, roundB] });
            const round  = fakeRound({ startedSecondsAgo: 200, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            const [, payload] = worker.notifyServer.mock.calls[0];
            expect(payload).toEqual({ id: 'match-1', rounds: [{ id: 'r1' }, { id: 'r2' }] });
            expect(match.toApiResponse).toHaveBeenCalledWith({ includeRounds: true });
        });


        it('renders the payload without includeMat or includeMatchJudges', async () => {
            const match = fakeMatch();
            const round = fakeRound({ startedSecondsAgo: 200, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            const [renderOptions] = match.toApiResponse.mock.calls[0];
            expect(renderOptions).toEqual({ includeRounds: true });
        });
    });


    /**
     * THE PAUSE RULE — the subtlest part of this worker, and the reason the
     * task called it out explicitly.
     *
     *   pausedMs   = sum of (resumed_at - paused_at) over CLOSED pauses only
     *   ref        = paused_at of the newest OPEN pause, else "now"
     *   remaining  = max(0, max_duration - floor((ref - started_at - pausedMs) / 1000))
     */
    describe('pauses are excluded from elapsed time', () => {
        it('does not end a round whose wall-clock age exceeds max_duration but whose paused time does not', async () => {
            const match = fakeMatch();
            // Started 230s ago, paused for 60s of that → 170s of live time < 180s.
            const round = fakeRound({
                startedSecondsAgo: 230,
                match,
                pauses: [pause({ startedSecondsAgo: 200, endedSecondsAgo: 140 })],
            });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).not.toHaveBeenCalled();
            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        it('subtracts EVERY closed pause, not just the most recent one', async () => {
            const match = fakeMatch();
            // Started 260s ago; two closed pauses of 50s and 40s → 170s live.
            const round = fakeRound({
                startedSecondsAgo: 260,
                match,
                pauses: [
                    pause({ startedSecondsAgo: 250, endedSecondsAgo: 200 }), // 50s
                    pause({ startedSecondsAgo: 150, endedSecondsAgo: 110 }), // 40s
                ],
            });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).not.toHaveBeenCalled();
        });


        it('still ends the round once live time reaches max_duration despite a pause', async () => {
            const match = fakeMatch();
            // Started 240s ago, paused 60s → exactly 180s live.
            const round = fakeRound({
                startedSecondsAgo: 240,
                match,
                pauses: [pause({ startedSecondsAgo: 200, endedSecondsAgo: 140 })],
            });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).toHaveBeenCalledTimes(1);
        });


        // While a pause is OPEN, the clock is frozen at paused_at: the round
        // can sit paused indefinitely without the timer expiring.
        it('freezes the clock at paused_at while a pause is open', async () => {
            const match = fakeMatch();
            // Started 10000s ago but paused (never resumed) 9900s ago →
            // only 100s of live time, regardless of how long ago that was.
            const round = fakeRound({
                startedSecondsAgo: 10000,
                match,
                pauses: [pause({ startedSecondsAgo: 9900, endedSecondsAgo: null })],
            });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).not.toHaveBeenCalled();
        });


        it('does NOT subtract the open pause\'s own duration (it is already excluded by the frozen ref)', async () => {
            const match = fakeMatch();
            // Started 500s ago, paused at 300s ago and still paused →
            // ref - started_at = 200s live, pausedMs = 0 (open pause skipped).
            // 200 >= 180, so the round ends. If the open pause were ALSO
            // subtracted the round would still be running.
            const round = fakeRound({
                startedSecondsAgo: 500,
                match,
                pauses: [pause({ startedSecondsAgo: 300, endedSecondsAgo: null })],
            });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).toHaveBeenCalledTimes(1);
        });


        it('uses the NEWEST open pause as the reference point', async () => {
            const match = fakeMatch();
            // An earlier closed pause of 30s, then an open pause 120s ago.
            // ref - started_at = 400 - 120 = 280s, minus 30s closed = 250s live
            // → expired.
            const round = fakeRound({
                startedSecondsAgo: 400,
                match,
                pauses: [
                    pause({ startedSecondsAgo: 380, endedSecondsAgo: 350 }), // closed, 30s
                    pause({ startedSecondsAgo: 120, endedSecondsAgo: null }), // open
                ],
            });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).toHaveBeenCalledTimes(1);
        });


        it('treats a zero-length round (max_duration 0) as immediately expired', async () => {
            // getMaxDuration returns `roundDurations[idx] || 0` — an index past
            // the configured durations yields 0, so remaining is 0 at once.
            const match = fakeMatch();
            const round = fakeRound({ startedSecondsAgo: 0, maxDuration: 0, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).toHaveBeenCalledTimes(1);
        });
    });


    describe('failure behavior', () => {
        // FINDINGS.md F-03 — no try/catch in Worker#_performJob.
        it('lets a rejection escape performJob() (unhandled)', async () => {
            const round = fakeRound({ startedSecondsAgo: 10 });
            round.getMaxDuration.mockRejectedValue(new Error('db down'));
            Round.getOpenRounds.mockResolvedValue([round]);

            // F-09.5: `.rejects` needs a promise, not a function.
            await expect(worker.performJob()).rejects.toThrow('db down');
        });
    });
});
