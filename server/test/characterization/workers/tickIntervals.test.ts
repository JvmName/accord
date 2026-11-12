/**
 * CHARACTERIZATION — worker tick cadence.
 *
 * Pins `requeueInterval` for all four workers so a change to how often they
 * run cannot slip through unnoticed:
 *
 *   MatchUpdateWorker      250ms   (overridden)
 *   TechFallTrackerWorker  1000ms  (inherited default)
 *   BreakTransitionWorker  1000ms  (inherited default)
 *   RoundTimerWorker       1000ms  (inherited default)
 *
 * Also pins the scheduling contract itself (setTimeout-driven re-queue, and
 * `close()` stopping it), because the cadence is only meaningful if the loop
 * behaves this way.
 */
import { afterEach, beforeEach, describe, expect, it, jest, mock } from 'bun:test';

// bun's mock.module() does not hoist, and a bare package name is silently
// ignored, so the mocks come before the requires and use file paths.
mock.module(require.resolve('socket.io-client'), () => ({ io: jest.fn(() => ({ on: jest.fn(), emit: jest.fn(), close: jest.fn() })) }));
mock.module('../../../lib/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() } }));

const { Worker }                = require('../../../src/workers/worker');
const { MatchUpdateWorker }     = require('../../../src/workers/matchUpdateWorker');
const { TechFallTrackerWorker } = require('../../../src/workers/techFallTrackerWorker');
const { BreakTransitionWorker } = require('../../../src/workers/breakTransitionWorker');
const { RoundTimerWorker }      = require('../../../src/workers/roundTimerWorker');
const   TestHelpers             = require('../../helpers');


describe('CHARACTERIZATION: worker tick intervals', () => {
    describe('requeueInterval', () => {
        it('MatchUpdateWorker ticks every 250ms', () => {
            expect(new MatchUpdateWorker('t').requeueInterval).toBe(250);
        });


        it('TechFallTrackerWorker ticks every 1000ms', () => {
            expect(new TechFallTrackerWorker('t').requeueInterval).toBe(1000);
        });


        it('BreakTransitionWorker ticks every 1000ms', () => {
            expect(new BreakTransitionWorker('t').requeueInterval).toBe(1000);
        });


        it('RoundTimerWorker ticks every 1000ms', () => {
            expect(new RoundTimerWorker('t').requeueInterval).toBe(1000);
        });


        it('the base Worker default is 1000ms, and only MatchUpdateWorker overrides it', () => {
            expect(new Worker('t').requeueInterval).toBe(1000);

            const intervals = [
                TechFallTrackerWorker,
                BreakTransitionWorker,
                RoundTimerWorker,
            ].map(Cls => new Cls('t').requeueInterval);

            expect(intervals).toEqual([1000, 1000, 1000]);
            expect(new MatchUpdateWorker('t').requeueInterval).not.toBe(1000);
        });
    });


    describe('the scheduling contract', () => {
        beforeEach(() => { TestHelpers.Time.useFakeTimers(); });
        afterEach(()  => { TestHelpers.Time.useRealTimers(); jest.clearAllMocks(); });


        it('queueJob defers the next run by exactly requeueInterval', () => {
            const worker = new TechFallTrackerWorker('t');
            const spy    = jest.spyOn(worker, 'performJob').mockResolvedValue(undefined);

            worker.queueJob();

            TestHelpers.Time.advanceTimers(999);
            expect(spy).not.toHaveBeenCalled();

            TestHelpers.Time.advanceTimers(1);
            expect(spy).toHaveBeenCalledTimes(1);
        });


        it('uses the 250ms window for MatchUpdateWorker', () => {
            const worker = new MatchUpdateWorker('t');
            const spy    = jest.spyOn(worker, 'performJob').mockResolvedValue(undefined);

            worker.queueJob();

            TestHelpers.Time.advanceTimers(249);
            expect(spy).not.toHaveBeenCalled();

            TestHelpers.Time.advanceTimers(1);
            expect(spy).toHaveBeenCalledTimes(1);
        });


        it('re-queues itself after each successful run', async () => {
            const worker = new RoundTimerWorker('t');
            const spy    = jest.spyOn(worker, 'performJob').mockResolvedValue(undefined);

            worker.queueJob();

            TestHelpers.Time.advanceTimers(1000);
            await Promise.resolve();            // let _performJob's await settle
            expect(spy).toHaveBeenCalledTimes(1);

            TestHelpers.Time.advanceTimers(1000);
            await Promise.resolve();
            expect(spy).toHaveBeenCalledTimes(2);
        });


        it('close() cancels the pending tick and stops further runs', async () => {
            const worker = new BreakTransitionWorker('t');
            const spy    = jest.spyOn(worker, 'performJob').mockResolvedValue(undefined);

            await worker.connect();             // so close() has an io client to close
            worker.queueJob();
            worker.close();

            TestHelpers.Time.advanceTimers(5000);
            expect(spy).not.toHaveBeenCalled();
        });
    });
});
