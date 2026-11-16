import { describe, expect, it } from 'bun:test';
import { superviseWorker, type WorkerProcess } from '../../src/workers/supervisor';

class FakeWorker implements WorkerProcess {
    killed = false;
    #onExit: ((code: number | null, signal: string | null) => void) | undefined;
    on(_event: 'exit', listener: (code: number | null, signal: string | null) => void) { this.#onExit = listener; }
    kill() { this.killed = true; }
    exit(code: number | null = 1) { this.#onExit?.(code, null); }
}

/** A supervisor over fake workers, a fake clock and a fake timer queue. */
function harness(options: { stableMs?: number } = {}) {
    const workers: FakeWorker[] = [];
    const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
    let time = 0;
    const supervisor = superviseWorker(() => { const w = new FakeWorker(); workers.push(w); return w; }, {
        initialDelayMs: 1_000, maxDelayMs: 4_000, stableMs: options.stableMs ?? 60_000,
        now: () => time,
        setTimer: (fn, ms) => { const t = { fn, ms, cancelled: false }; timers.push(t); return t; },
        clearTimer: (t) => { (t as { cancelled: boolean }).cancelled = true; },
    });
    const fire = () => { const t = timers.filter((x) => !x.cancelled).pop(); t?.fn(); };
    return { supervisor, workers, timers, fire, advance: (ms: number) => { time += ms; } };
}

describe('superviseWorker', () => {
    it('starts one worker at once', () => {
        expect(harness().workers).toHaveLength(1);
    });

    it('restarts a worker that exits, after a delay that doubles up to the cap', () => {
        const h = harness();
        const delays: number[] = [];
        for (let i = 0; i < 5; i++) {
            h.workers.at(-1)!.exit();
            delays.push(h.timers.at(-1)!.ms);
            h.fire();
        }
        expect(delays).toEqual([1_000, 2_000, 4_000, 4_000, 4_000]);
        expect(h.workers).toHaveLength(6);
    });

    it('goes back to the first delay after a worker stayed up long enough', () => {
        const h = harness({ stableMs: 60_000 });
        h.workers[0]!.exit(); h.fire();
        h.workers[1]!.exit(); h.fire();
        h.advance(60_000);
        h.workers[2]!.exit();
        expect(h.timers.at(-1)!.ms).toBe(1_000);
    });

    it('stop() kills the worker and cancels a pending restart', () => {
        const h = harness();
        h.workers[0]!.exit();
        h.supervisor.stop();
        h.fire();
        expect(h.workers).toHaveLength(1);
        expect(h.workers[0]!.killed).toBe(true);
    });

    it('does not restart a worker that exits after stop()', () => {
        const h = harness();
        h.supervisor.stop();
        h.workers[0]!.exit();
        expect(h.timers).toHaveLength(0);
    });
});
