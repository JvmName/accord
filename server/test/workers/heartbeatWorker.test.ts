import { afterEach, describe, expect, it, jest, mock } from 'bun:test';

// mock.module() does not hoist; it must come before the worker modules load.
let connected = true;
const ioFn = jest.fn(() => ({ on: jest.fn(), emit: jest.fn(), close: jest.fn(), get connected() { return connected; } }));
mock.module(require.resolve('socket.io-client'), () => ({ io: ioFn }));

const W: typeof import('../../src/workers') = require('../../src/workers');

const URL = 'https://monitor.example/ping/abc';

async function startedWorker(fetchImpl: typeof fetch) {
    const worker = new W.HeartbeatWorker('t', URL, { fetch: fetchImpl, port: 1, host: 'h' });
    await worker.connect();
    return worker;
}

afterEach(() => { connected = true; jest.clearAllMocks(); });

describe('HeartbeatWorker', () => {
    it('runs once a minute', async () => {
        const worker = await startedWorker(jest.fn() as unknown as typeof fetch);
        expect(worker.requeueInterval).toBe(60_000);
        worker.close();
    });

    it('requests the URL while connected', async () => {
        const fetchImpl = jest.fn(async () => new Response('ok'));
        const worker = await startedWorker(fetchImpl as unknown as typeof fetch);
        await worker.performJob();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(URL);
        worker.close();
    });

    it('stays silent while the socket is down, so the monitor alerts', async () => {
        connected = false;
        const fetchImpl = jest.fn(async () => new Response('ok'));
        const worker = await startedWorker(fetchImpl as unknown as typeof fetch);
        await worker.performJob();
        expect(fetchImpl).not.toHaveBeenCalled();
        worker.close();
    });

    it('does not throw when the request fails or is refused', async () => {
        const failing = await startedWorker((async () => { throw new Error('offline'); }) as unknown as typeof fetch);
        await expect(failing.performJob()).resolves.toBeUndefined();
        failing.close();

        const refused = await startedWorker((async () => new Response('no', { status: 500 })) as unknown as typeof fetch);
        await expect(refused.performJob()).resolves.toBeUndefined();
        refused.close();
    });
});
