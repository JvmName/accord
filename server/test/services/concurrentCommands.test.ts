/**
 * Lifecycle commands racing each other on two connections to one database
 * file, the way the web process and the worker process do. Each pair is
 * started together and the two commands advance in step, so both read the
 * round as open before either writes.
 *
 * Marked `failing` until the commands claim their writes conditionally.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, migrateDb } from '../../src/db';
import { findMatchGraph } from '../../src/db/repositories/matches';
import { insertMatch } from '../../src/db/repositories/matches';
import { insertMat } from '../../src/db/repositories/mats';
import { insertRound, updateRound } from '../../src/db/repositories/rounds';
import { insertUser } from '../../src/db/repositories/users';
import { endRound } from '../../src/services/matchLifecycle';
import { startRidingTime } from '../../src/services/ridingTimeVotes';
import { RoundTimerWorker } from '../../src/workers';
import { installAudit } from './support';

let dir: string;
let a: ReturnType<typeof createDb>;
let b: ReturnType<typeof createDb>;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accord-race-'));
    const file = path.join(dir, 'test.sqlite');
    a = createDb({ path: file });
    migrateDb(a);
    installAudit(a.$client);
    b = createDb({ path: file });
});

afterEach(() => {
    a.$client.close();
    b.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
});

/** A started match whose last round is open; `endedRounds` rounds before it are already over. */
async function seed(endedRounds: number) {
    const creator = await insertUser(a, { name: 'creator' });
    const red     = await insertUser(a, { name: 'red' });
    const blue    = await insertUser(a, { name: 'blue' });
    const mat     = await insertMat(a, { name: 'mat', creator_id: creator.id });
    const match   = await insertMatch(a, {
        mat_id: mat.id, creator_id: creator.id, red_competitor_id: red.id, blue_competitor_id: blue.id,
        started_at: new Date(Date.now() - 600_000),
    });
    for (let i = 0; i < endedRounds; i++) {
        const round = await insertRound(a, { match_id: match.id });
        await updateRound(a, round.id, { ended_at: new Date() });
    }
    const open = await insertRound(a, { match_id: match.id });
    a.$client.run('DELETE FROM zz_audit');
    return { match, open };
}

const audit = () => (a.$client.query('SELECT tbl, op, row FROM zz_audit ORDER BY seq').all() as { tbl: string; op: string; row: string }[])
    .map(({ tbl, op, row }) => ({ tbl, op, row: JSON.parse(row) }));
const roundEnds = () => audit().filter(({ tbl, op, row }) => tbl === 'rounds' && op === 'UPDATE' && row.ended_at !== null);
const breakStarts = () => audit().filter(({ tbl, op, row }) => tbl === 'matches' && op === 'UPDATE' && row.break_started_at !== null);

describe('two connections ending the same round', () => {
    it.failing('end it once, and the loser is refused', async () => {
        const { match } = await seed(0);

        const results = await Promise.allSettled([endRound(a, match.id), endRound(b, match.id)]);

        expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
        expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.message).toBe('No available round to end');
        expect(roundEnds()).toHaveLength(1);
        expect(breakStarts()).toHaveLength(1);
    });

    it.failing('end the match once when it is the final round', async () => {
        const { match } = await seed(2);

        const results = await Promise.allSettled([endRound(a, match.id), endRound(b, match.id)]);

        expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
        expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.message).toBe('No available round to end');
        expect(roundEnds()).toHaveLength(1);
        expect(audit().filter(({ tbl, op, row }) => tbl === 'matches' && op === 'UPDATE' && row.ended_at !== null)).toHaveLength(1);
    });

    it.failing('leave a worker that lost the race to end the round without a second break', async () => {
        const { match, open } = await seed(0);
        a.$client.run('UPDATE rounds SET created_at = ? WHERE id = ?', [new Date(Date.now() - 600_000).toISOString(), open.id]);
        const graph = (await findMatchGraph(a, match.id))!;
        const worker = new RoundTimerWorker('token', { db: a });
        worker.notifyServer = jest.fn();
        a.$client.run('DELETE FROM zz_audit');

        const [workerResult] = await Promise.allSettled([worker.checkRoundTimer(open, graph), endRound(b, match.id)]);

        expect(workerResult.status).toBe('fulfilled');
        expect(roundEnds()).toHaveLength(1);
        expect(breakStarts()).toHaveLength(1);
    });
});


describe('two connections starting riding time for the same judge', () => {
    it.failing('open one vote, and the loser is refused', async () => {
        const { match, open } = await seed(0);
        const judgeId = match.creator_id;

        const results = await Promise.allSettled([startRidingTime(a, open, judgeId, 'red'), startRidingTime(b, open, judgeId, 'red')]);

        expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
        expect(a.$client.query('SELECT count(*) AS n FROM riding_time_votes WHERE ended_at IS NULL').get()).toEqual({ n: 1 });
    });
});
