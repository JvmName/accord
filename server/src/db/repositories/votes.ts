/**
 * `riding_time_votes` repository (server-ts task 10). An open vote has
 * `ended_at` NULL; a vote's start is its `created_at`
 * (`RidingTimeVote#started_at` is an alias for it).
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { riding_time_votes } from '../schema';
import type { RidingTimeVote } from '../types';
import { insertStamps, orNull, rowid, type DbOrTx } from './internal';

/** `round.getRidingTimeVotes()` — insertion (rowid) order, via `riding_time_votes_round_id`. */
export async function findRoundVotes(db: DbOrTx, roundId: string): Promise<RidingTimeVote[]> {
    return await db.query.riding_time_votes.findMany({
        where:   eq(riding_time_votes.round_id, roundId),
        orderBy: [asc(rowid)],
    });
}

/** `round.getRidingTimeVotes({where: {ended_at: null}})` (`Round#end` closes each). */
export async function findOpenRoundVotes(db: DbOrTx, roundId: string): Promise<RidingTimeVote[]> {
    return await db.query.riding_time_votes.findMany({
        where:   and(eq(riding_time_votes.round_id, roundId), isNull(riding_time_votes.ended_at)),
        orderBy: [asc(rowid)],
    });
}

/**
 * `round.currentRidingTimeVoteForJudge(judge)`: the first open vote of that
 * judge in the round, in insertion order. NOTE: returns `undefined` (not
 * `null`) when there is none, exactly like the legacy `(await ...)[0]`.
 */
export async function findOpenVoteForJudge(db: DbOrTx, roundId: string, judgeId: string): Promise<RidingTimeVote | undefined> {
    return await db.query.riding_time_votes.findFirst({
        where: and(
            eq(riding_time_votes.round_id, roundId),
            eq(riding_time_votes.judge_id, judgeId),
            isNull(riding_time_votes.ended_at),
        ),
        orderBy: [asc(rowid)],
    });
}


/* ----------------------------------------------------------------------------
 * Write primitives (composed by the lifecycle services, task 10b)
 * ------------------------------------------------------------------------- */

/** `new RidingTimeVote({competitor_id, judge_id, round_id}).save()` (`Round#startRidingTime`). */
export async function insertRidingTimeVote(
    db: DbOrTx,
    values: { round_id: string; judge_id: string; competitor_id: string; id?: string },
): Promise<RidingTimeVote> {
    const [row] = await db.insert(riding_time_votes).values({
        ...(values.id ? { id: values.id } : {}),
        round_id:      values.round_id,
        judge_id:      values.judge_id,
        competitor_id: values.competitor_id,
        ...insertStamps(),
    }).returning();
    return row;
}

/**
 * `vote.end()` (`this.ended_at = new Date(); save()`). Also sets
 * `updated_at`. Returns the updated row or `null`.
 */
export async function setVoteEnded(db: DbOrTx, voteId: string, endedAt: Date = new Date()): Promise<RidingTimeVote | null> {
    const [row] = await db.update(riding_time_votes)
        .set({ ended_at: endedAt, updated_at: new Date() })
        .where(eq(riding_time_votes.id, voteId))
        .returning();
    return orNull(row);
}
