/**
 * Riding-time vote commands: `endVote`, `startRidingTime`, `endRidingTime`.
 *
 * Plain async functions over the Drizzle handle; no classes, no caching, no
 * WebSocket emission. See `src/services/README.md`. Every function resolves
 * to `undefined`.
 */
import { present } from '../domain/present';
import type { RidingTimeVote, Round } from '../db/types';
import type { DbOrTx } from '../db/repositories/internal';
import { assertDefined } from '../db/repositories/internal';
import { findMatchById } from '../db/repositories/matches';
import { findOpenVoteForJudge, insertRidingTimeVote, setVoteEnded } from '../db/repositories/votes';
import { competitorForColor } from './matchLifecycle';

/**
 * Ends a vote: `ended_at = endedAt` (now). No guard: an already-ended vote
 * gets a new `ended_at`. Callers: `endRidingTime`, `finishRound` (vote close on
 * round end), and the mat `leave` route (a judge leaving mid-round).
 */
export async function endVote(db: DbOrTx, vote: Pick<RidingTimeVote, 'id'>, endedAt: Date = new Date()): Promise<void> {
    await setVoteEnded(db, vote.id, endedAt);
}

/**
 * Starts a judge's riding-time vote for a rider.
 *
 * 1. the judge's first open vote in this round exists -> `Error('Riding time is already active')`
 * 2. competitor = `competitorForColor(match, riderColor)` (TypeError for an
 *    unknown/undefined colour)
 * 3. insert `{competitor_id: competitor.id, judge_id, round_id}` (TypeError if
 *    the competitor row is missing)
 *
 * Does NOT check that the round is open or unpaused: the route only ever
 * passes the active last round, and votes during a pause are allowed.
 */
export async function startRidingTime(db: DbOrTx, round: Pick<Round, 'id' | 'match_id'>, judgeId: string, riderColor: string): Promise<void> {
    assertDefined(judgeId, 'judge_id');
    const activeVote = await findOpenVoteForJudge(db, round.id, judgeId);
    if (activeVote) throw new Error(`Riding time is already active`);

    const match      = present(await findMatchById(db, round.match_id), 'the round\'s match');
    const competitor = present(await competitorForColor(db, match, riderColor), 'the rider');
    try {
        await insertRidingTimeVote(db, {
            competitor_id: competitor.id,
            judge_id:      judgeId,
            round_id:      round.id,
        });
    } catch (err) {
        // The judge's other request opened a vote after the check above.
        if ((err as Error).message.startsWith('UNIQUE constraint failed')) throw new Error(`Riding time is already active`);
        throw err;
    }
}

/** Ends the judge's FIRST open vote in the round, whatever its competitor. */
export async function endRidingTime(db: DbOrTx, round: Pick<Round, 'id'>, judgeId: string): Promise<void> {
    assertDefined(judgeId, 'judge_id');
    const activeVote = await findOpenVoteForJudge(db, round.id, judgeId);
    if (!activeVote) throw new Error(`Riding time is not active`);
    await endVote(db, activeVote);
}
