/**
 * The health check is the signal Docker and the uptime monitor read: 200
 * while a worker is connected to the web process, 503 otherwise.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { io } from 'socket.io-client';

/* eslint-disable @typescript-eslint/no-require-imports */
import * as Http from '../helpers/httpServer';
// Before anything opens a database connection.
Http.useTemporaryDatabase('accord-health');
/* eslint-enable @typescript-eslint/no-require-imports */

const WORKER_TOKEN = 'health-check-worker';

let booted: { server: any; origin: string };

beforeAll(async () => {
    await Http.migrate();
    booted = await Http.startServer({ serverOptions: { workerToken: WORKER_TOKEN } });
}, 30000);

afterAll(() => booted?.server.close());

const health = async () => {
    const res = await fetch(`${booted.origin}/system/healthCheck`);
    return { status: res.status, body: await res.json() };
};

const connect = (token: string) => new Promise<ReturnType<typeof io>>((resolve, reject) => {
    const socket = io(booted.origin, { query: { workerToken: token }, reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
});

async function until(check: () => Promise<boolean>) {
    for (let i = 0; i < 100; i++) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

describe('GET /system/healthCheck', () => {
    it('answers 503 until a worker connects, 200 while one is connected, and 503 again after it leaves', async () => {
        expect(await health()).toEqual({ status: 503, body: { data: { errors: { worker: ['not connected'] } }, status: 'service unavailable' } });

        const worker = await connect(WORKER_TOKEN);
        expect(await health()).toEqual({ status: 200, body: { data: { worker: 'connected' }, status: 'ok' } });

        worker.close();
        await until(async () => (await health()).status === 503);
        expect((await health()).status).toBe(503);
    });

    it('is not satisfied by a socket that does not hold the worker token', async () => {
        await expect(connect('wrong-token')).rejects.toBeDefined();
        expect((await health()).status).toBe(503);
    });

    it('stays 200 while any one of the worker process\'s sockets is up', async () => {
        const first  = await connect(WORKER_TOKEN);
        const second = await connect(WORKER_TOKEN);
        first.close();
        await new Promise(resolve => setTimeout(resolve, 100));
        expect((await health()).status).toBe(200);
        second.close();
    });
});
