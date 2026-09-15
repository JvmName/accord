/**
 * CHARACTERIZATION — BreakTransitionWorker.
 *
 * Zero coverage before task 02b. Pins:
 *   - which matches are considered (break started AND not ended)
 *   - an elapsed break clears the break fields, starts the next round and
 *     emits `break.ended`
 *   - an unexpired break is a complete no-op
 *   - NO FOURTH ROUND: a match that has ended is excluded by the query, which
 *     is the only thing standing between this worker and a 4th round
 *   - the exact off-by-one boundary (elapsed < duration → wait; == → fire)
 *
 * `Date.now` is spied on rather than using fake timers — the pattern already
 * proven in test/workerQueue/matchUpdateWorker.test.js (FINDINGS.md F-10).
 *
 * Consumed by task 14.
 */
const { afterEach, beforeEach, describe, expect, it, jest, mock } = require('bun:test');

// bun's mock.module() does NOT hoist (F-09.1); bare specifiers no-op (F-09.2).
const NE = Symbol('ne');
mock.module('../../../models/match', () => ({
    Match: {
        where: jest.fn().mockResolvedValue([]),
        find:  jest.fn(),
        get Operators() { return { ne: NE }; },
    },
}));
mock.module('../../../models/round', () => ({ Round: { getOpenRounds: jest.fn().mockResolvedValue([]) } }));
mock.module(require.resolve('socket.io-client'), () => ({ io: jest.fn(() => ({ on: jest.fn(), emit: jest.fn() })) }));
mock.module('../../../lib/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() } }));

const { BreakTransitionWorker } = require('../../../lib/workerQueue/breakTransitionWorker');
const { Match }                 = require('../../../models/match');
const { EVENTS }                = require('../../../lib/server/workerWebSocket');


const NOW = new Date('2026-01-01T12:00:00.000Z').getTime();


function matchInBreak({ id = 'match-1', secondsIntoBreak = 0, breakDuration = 60 } = {}) {
    return {
        id,
        break_started_at: new Date(NOW - secondsIntoBreak * 1000).toISOString(),
        break_duration:   breakDuration,
        save:             jest.fn().mockResolvedValue(undefined),
        startRound:       jest.fn().mockResolvedValue(undefined),
    };
}


describe('CHARACTERIZATION: BreakTransitionWorker', () => {
    let worker;

    beforeEach(() => {
        worker = new BreakTransitionWorker('test-worker-token');
        jest.spyOn(worker, 'notifyServer').mockImplementation(() => {});
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        Match.where.mockResolvedValue([]);
        Match.find.mockResolvedValue({ toApiResponse: jest.fn().mockResolvedValue({ id: 'match-1' }) });
    });

    afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });


    describe('match selection', () => {
        it('queries matches with a break started that have NOT ended', async () => {
            await worker.performJob();

            expect(Match.where).toHaveBeenCalledTimes(1);
            expect(Match.where).toHaveBeenCalledWith({
                break_started_at: { [NE]: null },
                ended_at:         null,
            });
        });


        // THE NO-FOURTH-ROUND RULE, worker half.
        //
        // A match always runs exactly maxRounds (3) rounds. When the final
        // round ends, `Round.end()` calls `match.end()` — which sets ended_at
        // and nulls break_started_at/break_duration — INSTEAD of starting a
        // break (that half is covered by test/models/round.test.js). This
        // worker's guarantee is narrower and lives entirely in the query: an
        // ended match is excluded, so even a match that somehow still carries
        // break_started_at can never be given a fourth round here.
        it('never starts a round for a match that has ended, because ended_at: null is part of the query', async () => {
            await worker.performJob();

            const [appliedFilter] = Match.where.mock.calls[0];
            expect(appliedFilter).toHaveProperty('ended_at', null);

            // An ended match is therefore never returned, so nothing happens —
            // there is no fourth round for it to start.
            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        it('does nothing when no match is in a break', async () => {
            await worker.performJob();

            expect(worker.notifyServer).not.toHaveBeenCalled();
            expect(Match.find).not.toHaveBeenCalled();
        });
    });


    describe('unexpired break', () => {
        it('is a complete no-op: no save, no startRound, no emit', async () => {
            const match = matchInBreak({ secondsIntoBreak: 10, breakDuration: 60 });
            Match.where.mockResolvedValue([match]);

            await worker.performJob();

            expect(match.save).not.toHaveBeenCalled();
            expect(match.startRound).not.toHaveBeenCalled();
            expect(worker.notifyServer).not.toHaveBeenCalled();
        });


        it('waits while elapsed is one second short of break_duration', async () => {
            const match = matchInBreak({ secondsIntoBreak: 59, breakDuration: 60 });
            Match.where.mockResolvedValue([match]);

            await worker.performJob();

            expect(match.startRound).not.toHaveBeenCalled();
        });
    });


    describe('expired break', () => {
        it('fires exactly at elapsed == break_duration (the comparison is `elapsed < duration`)', async () => {
            const match = matchInBreak({ secondsIntoBreak: 60, breakDuration: 60 });
            Match.where.mockResolvedValue([match]);

            await worker.performJob();

            expect(match.startRound).toHaveBeenCalledTimes(1);
        });


        it('clears break_started_at and break_duration and persists BEFORE starting the round', async () => {
            const match = matchInBreak({ secondsIntoBreak: 90, breakDuration: 60 });
            Match.where.mockResolvedValue([match]);

            await worker.performJob();

            expect(match.break_started_at).toBeNull();
            expect(match.break_duration).toBeNull();
            expect(match.save).toHaveBeenCalledTimes(1);
            expect(match.save).toHaveBeenCalledBefore(match.startRound);
        });


        it('starts the next round', async () => {
            const match = matchInBreak({ secondsIntoBreak: 90 });
            Match.where.mockResolvedValue([match]);

            await worker.performJob();

            expect(match.startRound).toHaveBeenCalledTimes(1);
            expect(match.startRound).toHaveBeenCalledWith();
        });


        it('emits `break.ended`', async () => {
            const match = matchInBreak({ secondsIntoBreak: 90 });
            Match.where.mockResolvedValue([match]);

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
            expect(worker.notifyServer.mock.calls[0][0]).toBe('break.ended');
            expect(worker.notifyServer.mock.calls[0][0]).toBe(EVENTS.BREAK_ENDED);
        });


        // The payload comes from a FRESHLY refetched match, not the in-memory
        // one, so the newly created round is present in the response.
        it('re-fetches the match by id and emits the fresh record\'s payload', async () => {
            const match = matchInBreak({ id: 'match-7', secondsIntoBreak: 90 });
            Match.where.mockResolvedValue([match]);

            const freshPayload = { id: 'match-7', rounds: [{ id: 'new-round' }] };
            const fresh        = { toApiResponse: jest.fn().mockResolvedValue(freshPayload) };
            Match.find.mockResolvedValue(fresh);

            await worker.performJob();

            expect(Match.find).toHaveBeenCalledWith('match-7');
            expect(match.startRound).toHaveBeenCalledBefore(Match.find);
            expect(worker.notifyServer).toHaveBeenCalledWith(EVENTS.BREAK_ENDED, freshPayload);
        });


        it('renders with includeMat, includeMatchJudges and includeRounds', async () => {
            const match = matchInBreak({ secondsIntoBreak: 90 });
            Match.where.mockResolvedValue([match]);

            const fresh = { toApiResponse: jest.fn().mockResolvedValue({}) };
            Match.find.mockResolvedValue(fresh);

            await worker.performJob();

            expect(fresh.toApiResponse).toHaveBeenCalledWith({
                includeMat:         true,
                includeMatchJudges: true,
                includeRounds:      true,
            });
        });


        it('handles several expired breaks in the same tick', async () => {
            Match.where.mockResolvedValue([
                matchInBreak({ id: 'm1', secondsIntoBreak: 90 }),
                matchInBreak({ id: 'm2', secondsIntoBreak: 61 }),
            ]);

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(2);
        });
    });


    describe('failure behavior', () => {
        // FINDINGS.md F-03 — no try/catch in Worker#_performJob, so this
        // rejection escapes and the worker stops re-queuing.
        it('lets a rejection escape performJob() (unhandled)', async () => {
            Match.where.mockRejectedValue(new Error('db down'));

            // F-09.5: `.rejects` needs a promise, not a function.
            await expect(worker.performJob()).rejects.toThrow('db down');
        });
    });
});
