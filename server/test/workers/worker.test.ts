import { afterEach, beforeEach, describe, expect, it, jest, mock } from 'bun:test';

// mock.module() does not hoist; it must come before the worker modules load.
const emit  = jest.fn();
const ioFn  = jest.fn(() => ({ on: jest.fn(), emit, close: jest.fn() }));
mock.module(require.resolve('socket.io-client'), () => ({ io: ioFn }));

// Required after the mock, typed through `import()` types (an `import` would be hoisted above it).
const TestHelpers = require('../helpers');
const W: typeof import('../../src/workers') = require('../../src/workers');
const { assertSocketPayload }: typeof import('../../src/workers/worker') = require('../../src/workers/worker');
const { WireContractError }: typeof import('../../src/serialize') = require('../../src/serialize');

/** A minimal payload that satisfies the event schema. */
function validPayload() {
    const user = { id: 'u1', name: 'n', api_token: 't', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
    return {
        creator_id: 'c', id: 'm1', mat_id: 'mat', started_at: null, ended_at: null, break_started_at: null,
        break_duration: null, red_competitor: user, blue_competitor: { ...user, id: 'u2' }, winner: null, break_remaining: null,
    };
}

class Probe extends W.Worker {
    performJob = jest.fn(async (): Promise<void> => {});
}

const previousValidate = process.env.ACCORD_VALIDATE_WIRE;
afterEach(() => {
    jest.clearAllMocks();
    if (previousValidate === undefined) delete process.env.ACCORD_VALIDATE_WIRE;
    else process.env.ACCORD_VALIDATE_WIRE = previousValidate;
});

describe('Worker', () => {
    it('names the two tick intervals', () => {
        expect(W.MATCH_UPDATE_TICK_MS).toBe(250);
        expect(W.DEFAULT_TICK_MS).toBe(1000);
        expect(new W.MatchUpdateWorker('t').requeueInterval).toBe(W.MATCH_UPDATE_TICK_MS);
        for (const Cls of [W.TechFallTrackerWorker, W.BreakTransitionWorker, W.RoundTimerWorker]) {
            expect(new Cls('t').requeueInterval).toBe(W.DEFAULT_TICK_MS);
        }
    });

    it('connects to the web process as the worker, with the token in the handshake query', async () => {
        const worker = new Probe('the-token', { host: 'example', port: 1234 });
        await worker.connect();
        expect(ioFn).toHaveBeenCalledTimes(1);
        expect(ioFn).toHaveBeenCalledWith('http://example:1234', { query: { workerToken: 'the-token' } });
    });

    it('emits on the socket with the event name and the payload unchanged', async () => {
        const worker = new Probe('t');
        await worker.connect();
        const payload = validPayload();
        await worker.notifyServer('match.update', payload);
        expect(emit).toHaveBeenCalledWith('match.update', payload);
        expect(emit.mock.calls[0][1]).toBe(payload);
    });

    describe('the scheduling loop', () => {
        beforeEach(() => { TestHelpers.Time.useFakeTimers(); });
        afterEach(()  => { TestHelpers.Time.useRealTimers(); });

        it('re-queues after a successful run', async () => {
            const worker = new Probe('t');
            const queue  = jest.spyOn(worker, 'queueJob');
            await worker._performJob();
            expect(worker.performJob).toHaveBeenCalledTimes(1);
            expect(queue).toHaveBeenCalledTimes(1);
            worker.close();
        });

        // Not caught: a rejected job never re-queues, and the rejection escapes
        // the timer callback, which ends the worker process.
        it('lets a rejection escape and does not re-queue', async () => {
            const worker = new Probe('t');
            worker.performJob.mockRejectedValue(new Error('db down'));
            const queue = jest.spyOn(worker, 'queueJob');
            await expect(worker._performJob()).rejects.toThrow('db down');
            expect(queue).not.toHaveBeenCalled();
        });

        it('does nothing once closed', async () => {
            const worker = new Probe('t');
            worker.close();
            await worker._performJob();
            expect(worker.performJob).not.toHaveBeenCalled();
        });
    });

    describe('payload validation', () => {
        it('is off unless asked for (tests and production)', async () => {
            delete process.env.ACCORD_VALIDATE_WIRE;
            const worker = new Probe('t');
            await worker.connect();
            await worker.notifyServer('match.update', { id: 'not a match' } as any);
            expect(emit).toHaveBeenCalledTimes(1);
        });

        it('rejects a payload that does not match the event schema, and does not emit it', async () => {
            process.env.ACCORD_VALIDATE_WIRE = '1';
            const worker = new Probe('t');
            await worker.connect();
            await expect(worker.notifyServer('round.tech-fall', { id: 'not a match' } as any)).rejects.toBeInstanceOf(WireContractError);
            expect(emit).not.toHaveBeenCalled();
        });

        it('passes a payload that matches', () => {
            process.env.ACCORD_VALIDATE_WIRE = '1';
            expect(() => assertSocketPayload('break.ended', validPayload())).not.toThrow();
        });
    });

    describe('the database', () => {
        it('uses the one it is given', () => {
            const db = {} as any;
            expect(new Probe('t', { db }).db).toBe(db);
        });

        it('otherwise shares one connection across every job in the process', () => {
            expect(new W.TechFallTrackerWorker('t').db).toBe(new W.MatchUpdateWorker('t').db);
        });
    });
});
