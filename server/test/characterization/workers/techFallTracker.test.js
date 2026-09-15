/**
 * CHARACTERIZATION — TechFallTrackerWorker.
 *
 * Zero coverage before task 02b. Pins:
 *   - which rounds are considered (open rounds only)
 *   - threshold reached  → round ended in the DB + `round.tech-fall` emitted
 *   - threshold not met  → nothing happens at all
 *   - an already-ended round is never re-ended (no double emit)
 *   - the shape of the emitted payload
 *
 * Modelled on test/workerQueue/matchUpdateWorker.test.js: `performJob()` is
 * called directly rather than waiting on the scheduler, which is the pattern
 * already proven in this repo (test/helpers/time.js has no call sites —
 * FINDINGS.md F-10).
 *
 * Consumed by task 14.
 */
const { afterEach, beforeEach, describe, expect, it, jest, mock } = require('bun:test');

// bun's mock.module() does NOT hoist (FINDINGS.md F-09.1), and a bare package
// specifier silently no-ops (F-09.2) — hence require.resolve for socket.io-client.
mock.module('../../../models/round', () => ({ Round: { getOpenRounds: jest.fn() } }));
mock.module('../../../models/match', () => ({ Match: { where: jest.fn().mockResolvedValue([]), find: jest.fn() } }));
mock.module(require.resolve('socket.io-client'), () => ({ io: jest.fn(() => ({ on: jest.fn(), emit: jest.fn() })) }));
mock.module('../../../lib/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() } }));

const { TechFallTrackerWorker } = require('../../../lib/workerQueue/techFallTrackerWorker');
const { Round }                 = require('../../../models/round');
const { EVENTS }                = require('../../../lib/server/workerWebSocket');


function fakeRound({ threshold = false, id = 'round-1', match } = {}) {
    const round = {
        id,
        rules: { techFallThreshold: jest.fn(() => 24) },
        hasReachedTechFallThreshold: jest.fn().mockResolvedValue(threshold),
        toApiResponse:               jest.fn().mockResolvedValue({ id }),
        getRedScore:                 jest.fn().mockResolvedValue(0),
        getBlueScore:                jest.fn().mockResolvedValue(0),
        getRoundNumber:              jest.fn().mockResolvedValue(1),
    };
    round.getMatch = jest.fn().mockResolvedValue(match || fakeMatch({ rounds: [round] }));
    return round;
}


function fakeMatch({ id = 'match-1', rounds = [] } = {}) {
    return {
        id,
        endRound:      jest.fn().mockResolvedValue(undefined),
        getRounds:     jest.fn().mockResolvedValue(rounds),
        toApiResponse: jest.fn().mockResolvedValue({ id, rounds: 'PLACEHOLDER' }),
    };
}


describe('CHARACTERIZATION: TechFallTrackerWorker', () => {
    let worker;

    beforeEach(() => {
        worker = new TechFallTrackerWorker('test-worker-token');
        jest.spyOn(worker, 'notifyServer').mockImplementation(() => {});
    });

    afterEach(() => { jest.clearAllMocks(); });


    describe('round selection', () => {
        it('considers only open rounds, via Round.getOpenRounds()', async () => {
            Round.getOpenRounds.mockResolvedValue([]);

            await worker.performJob();

            expect(Round.getOpenRounds).toHaveBeenCalledTimes(1);
            expect(Round.getOpenRounds).toHaveBeenCalledWith();
        });


        it('does nothing when there are no open rounds', async () => {
            Round.getOpenRounds.mockResolvedValue([]);

            await worker.performJob();

            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        // Rounds that have already ended carry a non-null ended_at, so
        // Round.getOpenRounds() ({ended_at: null}) never returns them. That is
        // the ONLY thing preventing a second end/emit: the worker itself has no
        // "already ended" guard, and `match.endRound()` is called with no
        // options, so `safe` is undefined and it would throw on a second pass.
        it('never re-ends a round that is no longer open (no double emit)', async () => {
            const round = fakeRound({ threshold: true });
            Round.getOpenRounds.mockResolvedValue([round]);
            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(1);

            // Next tick: the round has ended, so it is no longer returned.
            Round.getOpenRounds.mockResolvedValue([]);
            worker.notifyServer.mockClear();
            await worker.performJob();

            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        it('checks every open round independently', async () => {
            const below = fakeRound({ threshold: false, id: 'round-below' });
            const above = fakeRound({ threshold: true,  id: 'round-above' });
            Round.getOpenRounds.mockResolvedValue([below, above]);

            await worker.performJob();

            expect(below.hasReachedTechFallThreshold).toHaveBeenCalledTimes(1);
            expect(above.hasReachedTechFallThreshold).toHaveBeenCalledTimes(1);
            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
        });
    });


    describe('below the tech fall threshold', () => {
        it('does not end the round and does not emit', async () => {
            const match = fakeMatch();
            const round = fakeRound({ threshold: false, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(round.hasReachedTechFallThreshold).toHaveBeenCalledTimes(1);
            expect(match.endRound).not.toHaveBeenCalled();
            expect(worker.notifyServer).not.toHaveBeenCalled();
        });
    });


    describe('at or above the tech fall threshold', () => {
        it('ends the round through Match#endRound, with no options', async () => {
            const match = fakeMatch();
            const round = fakeRound({ threshold: true, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).toHaveBeenCalledTimes(1);
            // No `{ safe: true }` — the unsafe form, which throws if there is no
            // open round to end.
            expect(match.endRound).toHaveBeenCalledWith();
        });


        it('emits `round.tech-fall`', async () => {
            const round = fakeRound({ threshold: true });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
            expect(worker.notifyServer.mock.calls[0][0]).toBe('round.tech-fall');
            expect(worker.notifyServer.mock.calls[0][0]).toBe(EVENTS.TECH_FALL);
        });


        it('ends the round BEFORE emitting', async () => {
            const match = fakeMatch();
            const round = fakeRound({ threshold: true, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            expect(match.endRound).toHaveBeenCalledBefore(worker.notifyServer);
        });


        it('emits the match payload with rounds rendered individually, overwriting toApiResponse\'s rounds', async () => {
            const roundA = { id: 'r1', toApiResponse: jest.fn().mockResolvedValue({ id: 'r1' }) };
            const roundB = { id: 'r2', toApiResponse: jest.fn().mockResolvedValue({ id: 'r2' }) };
            const match  = fakeMatch({ rounds: [roundA, roundB] });
            const round  = fakeRound({ threshold: true, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            const [, payload] = worker.notifyServer.mock.calls[0];
            expect(payload).toEqual({ id: 'match-1', rounds: [{ id: 'r1' }, { id: 'r2' }] });
            expect(match.toApiResponse).toHaveBeenCalledWith({ includeRounds: true });
        });


        // NOTE: unlike MatchUpdateWorker/BreakTransitionWorker, the tech-fall
        // payload is rendered WITHOUT includeMat / includeMatchJudges.
        it('renders the payload without includeMat or includeMatchJudges', async () => {
            const match = fakeMatch();
            const round = fakeRound({ threshold: true, match });
            Round.getOpenRounds.mockResolvedValue([round]);

            await worker.performJob();

            const [renderOptions] = match.toApiResponse.mock.calls[0];
            expect(renderOptions).toEqual({ includeRounds: true });
            expect(renderOptions).not.toHaveProperty('includeMat');
            expect(renderOptions).not.toHaveProperty('includeMatchJudges');
        });
    });


    describe('failure behavior', () => {
        // FINDINGS.md F-03: Worker#_performJob does not wrap performJob() in a
        // try/catch, so a rejection propagates and the worker stops re-queuing.
        // Pinned so task 14 cannot silently "fix" it as part of the rewrite.
        it('lets a rejection from a round escape performJob() (unhandled)', async () => {
            const round = fakeRound({ threshold: false });
            round.hasReachedTechFallThreshold.mockRejectedValue(new Error('db down'));
            Round.getOpenRounds.mockResolvedValue([round]);

            // F-09.5: `.rejects` needs a promise, not a function.
            await expect(worker.performJob()).rejects.toThrow('db down');
        });
    });
});
