/**
 * Requests `HEARTBEAT_URL` once a minute while this job is connected to the
 * web process. An external monitor that expects the request alerts when it
 * stops, which covers a dead worker, a worker that lost its socket, and a
 * dead host.
 */
import type { Logger } from 'pino';
import { Worker, type WorkerOptions } from './worker';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger }: { logger: Logger } = require('../../lib/logger');

export const HEARTBEAT_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface HeartbeatOptions extends WorkerOptions {
    /** Injectable for tests. */
    fetch?: typeof fetch;
}

export class HeartbeatWorker extends Worker {
    #url: string;
    #fetch: typeof fetch;

    constructor(workerToken: string, url: string, { fetch: fetchImpl = fetch, ...options }: HeartbeatOptions = {}) {
        super(workerToken, options);
        this.#url   = url;
        this.#fetch = fetchImpl;
    }

    get requeueInterval(): number { return HEARTBEAT_INTERVAL_MS; }

    async performJob(): Promise<void> {
        if (!this.connected) {
            logger.warn('Heartbeat skipped: not connected to the web process');
            return;
        }
        try {
            const response = await this.#fetch(this.#url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
            if (!response.ok) logger.warn(`Heartbeat answered ${response.status}`);
        } catch (err) {
            logger.warn(`Heartbeat failed: ${(err as Error).message}`);
        }
    }
}
