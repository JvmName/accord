/**
 * Keeps the worker process running: when it exits, start another one after a
 * delay that doubles up to a cap, and goes back to the start once a worker has
 * stayed up for a while. Without this a crashed worker stops every round timer,
 * tech-fall check and break until someone restarts the server.
 */
import type { Logger } from 'pino';

/** The part of a child process the supervisor uses. */
export interface WorkerProcess {
    on(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
    kill(): unknown;
}

export interface SupervisorOptions {
    /** First restart delay. */
    initialDelayMs?: number;
    /** Longest restart delay. */
    maxDelayMs?: number;
    /** A worker that stayed up this long resets the delay. */
    stableMs?: number;
    logger?: Pick<Logger, 'info' | 'error'>;
    /** Injectable for tests. */
    now?: () => number;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (timer: unknown) => void;
}

export interface Supervisor {
    /** Stop restarting and kill the current worker. */
    stop(): void;
}

export function superviseWorker(spawnWorker: () => WorkerProcess, options: SupervisorOptions = {}): Supervisor {
    const initialDelayMs = options.initialDelayMs ?? 1_000;
    const maxDelayMs     = options.maxDelayMs ?? 30_000;
    const stableMs       = options.stableMs ?? 60_000;
    const now            = options.now ?? Date.now;
    const setTimer       = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer     = options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    const log            = options.logger;

    let stopped = false;
    let child: WorkerProcess | undefined;
    let timer: unknown;
    let delayMs = initialDelayMs;

    const start = () => {
        const startedAt = now();
        child = spawnWorker();
        child.on('exit', (code, signal) => {
            if (stopped) return;
            if (now() - startedAt >= stableMs) delayMs = initialDelayMs;
            log?.error(`Worker exited (code=${code}, signal=${signal}); restarting in ${delayMs}ms`);
            timer   = setTimer(start, delayMs);
            delayMs = Math.min(delayMs * 2, maxDelayMs);
        });
    };
    start();

    return {
        stop() {
            stopped = true;
            if (timer !== undefined) clearTimer(timer);
            child?.kill();
        },
    };
}
