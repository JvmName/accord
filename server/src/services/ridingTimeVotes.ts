/**
 * Riding-time vote commands (server-ts task 10b). Ports of
 * `RidingTimeVote#end`, `Round#startRidingTime` and `Round#endRidingTime`.
 *
 * Plain async functions over the Drizzle handle; no classes, no caching, no
 * WebSocket emission. Behaviour (including bugs) is the legacy behaviour; see
 * `src/services/README.md` and `.ai/plans/server-ts/artifacts/lifecycle-inventory.md`.
 * Every function resolves to `undefined`, like the legacy methods.
 */
import type { RidingTimeVote, Round } from '../db/types';
import type { DbOrTx } from '../db/repositories/internal';
import { assertDefined } from '../db/repositories/internal';
import { findMatchById } from '../db/repositories/matches';
import { findOpenVoteForJudge, insertRidingTimeVote, setVoteEnded } from '../db/repositories/votes';
import { competitorForColor } from './matchLifecycle';

/**
 * `RidingTimeVote#end()`: `ended_at = new Date()` and save. No guard: an
 * already-ended vote gets a new `ended_at` (legacy overwrites too). Callers:
 * `endRidingTime`, `finishRound` (vote close on round end), and the mat
 * `leave` route (judge leaving mid-round, `usersController.js:153`).
 */
export async function endVote(db: DbOrTx, vote: Pick<RidingTimeVote, 'id'>): Promise<void> {
    await setVoteEnded(db, vote.id, new Date());
}

/**
 * `Round#startRidingTime(judge, riderColor)`.
 *
 * 1. the judge's first open vote in this round exists -> `Error('Riding time is already active')`
 * 2. competitor = `competitorForColor(match, riderColor)` (TypeError for an
 *    unknown/undefined colour, exactly as legacy)
 * 3. insert `{competitor_id: competitor.id, judge_id, round_id}` (TypeError if
 *    the competitor row is missing, as legacy's `competitor.id`)
 *
 * Does NOT check that the round is open or unpaused: the route only ever
 * passes the active last round, and votes during a pause are allowed (legacy).
 */
export async function startRidingTime(db: DbOrTx, round: Pick<Round, 'id' | 'match_id'>, judgeId: string, riderColor: string): Promise<void> {
    assertDefined(judgeId, 'judge_id');
    const activeVote = await findOpenVoteForJudge(db, round.id, judgeId);
    if (activeVote) throw new Error(`Riding time is already active`);

    const match      = await findMatchById(db, round.match_id);
    const competitor = await competitorForColor(db, match, riderColor);
    await insertRidingTimeVote(db, {
        competitor_id: competitor.id,
        judge_id:      judgeId,
        round_id:      round.id,
    });
}

/**
 * `Round#endRidingTime(judge, riderColor)`: ends the judge's FIRST open vote
 * in the round, whatever its competitor. `riderColor` is accepted and IGNORED,
 * exactly as legacy (FINDINGS F-55).
 */
export async function endRidingTime(db: DbOrTx, round: Pick<Round, 'id'>, judgeId: string, riderColor?: string): Promise<void> {
    assertDefined(judgeId, 'judge_id');
    const activeVote = await findOpenVoteForJudge(db, round.id, judgeId);
    if (!activeVote) throw new Error(`Riding time is not active`);
    await endVote(db, activeVote);
}
