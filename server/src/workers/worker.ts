/**
 * Base class of the worker process's jobs. Each job connects to the web
 * process's Socket.IO server as the worker, runs `performJob()` on a timer,
 * and is the only place real-time events come from.
 */
import type { io as ioFunction, Socket as ClientSocket } from 'socket.io-client';
import type { Logger } from 'pino';
import type { z } from 'zod';
import { socketPayloads, type SocketEvent } from '../contract/websocket';
import { createLazyDb } from '../db';
import type { DbOrTx } from '../db/repositories/internal';
import { WireContractError, wireValidationEnabled } from '../serialize';

/* eslint-disable @typescript-eslint/no-require-imports */
const { logger }: { logger: Logger } = require('../../lib/logger');
// Required, not imported: `import` resolves to the package's ESM build, a
// different module from the CommonJS one that `require` (and so every test
// that mocks `require.resolve('socket.io-client')`) gets.
const { io }: { io: typeof ioFunction } = require('socket.io-client');
/* eslint-enable @typescript-eslint/no-require-imports */

/** How often `MatchUpdateWorker` runs. Its broadcasts are throttled separately. */
export const MATCH_UPDATE_TICK_MS = 250;
/** How often every other job runs. */
export const DEFAULT_TICK_MS = 1000;

export type SocketPayload<E extends SocketEvent> = z.infer<(typeof socketPayloads)[E]>;

export interface WorkerOptions {
    port?: number | string;
    host?: string;
    /** Defaults to one connection shared by every job in the process, opened on first use. */
    db?: DbOrTx;
}

let sharedDb: DbOrTx | undefined;

function defaultDb(): DbOrTx {
    sharedDb ??= createLazyDb();
    return sharedDb;
}

/**
 * Checks a payload against its event schema when wire validation is on
 * (`ACCORD_VALIDATE_WIRE=1`, or `NODE_ENV=development`); never in production
 * unless asked for.
 */
export function assertSocketPayload<E extends SocketEvent>(event: E, payload: SocketPayload<E>): void {
    if (!wireValidationEnabled()) return;
    const result = socketPayloads[event].safeParse(payload);
    if (!result.success) throw new WireContractError('leakedMatch', result.error.issues);
}

export abstract class Worker {
    #closed = false;
    #host: string;
    #ioClient: ClientSocket | undefined;
    #port: number | string;
    #timeout: ReturnType<typeof setTimeout> | undefined;
    #workerToken: string;
    #db: DbOrTx | undefined;

    constructor(workerToken: string, { port, host, db }: WorkerOptions = {}) {
        this.#host        = host || process.env.HOST || 'localhost';
        this.#port        = port || process.env.PORT || 3000;
        this.#workerToken = workerToken;
        this.#db          = db;
    }

    async start(): Promise<void> {
        await this.connect();
        this.queueJob();
    }

    async connect(): Promise<void> {
        this.#ioClient = io(`http://${this.#host}:${this.#port}`, {
            query: { workerToken: this.#workerToken },
        });
        this.#ioClient.on('connect',    () => { logger.info('Web socket connected') });
        this.#ioClient.on('disconnect', () => { logger.info('Web socket disconnected') });
    }

    async notifyServer<E extends SocketEvent>(event: E, msg: SocketPayload<E>): Promise<void> {
        assertSocketPayload(event, msg);
        this.#ioClient.emit(event, msg);
    }

    close(): void {
        if (this.#timeout)  clearTimeout(this.#timeout);
        if (this.#ioClient) this.#ioClient.close();
        this.#closed = true;
    }

    queueJob(): void {
        this.#timeout = setTimeout(this._performJob.bind(this), this.requeueInterval);
    }

    get requeueInterval(): number {
        return DEFAULT_TICK_MS;
    }

    /**
     * One tick: the job, then the next tick. A rejected `performJob()` is not
     * caught here, so it never re-queues and surfaces as an unhandled
     * rejection, which ends the worker process.
     */
    async _performJob(): Promise<void> {
        if (this.#closed) return;
        await this.performJob();
        this.queueJob();
    }

    abstract performJob(): Promise<void>;

    get db(): DbOrTx {
        return this.#db ?? defaultDb();
    }
}
