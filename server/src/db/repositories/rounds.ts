/**
 * `rounds` and `round_pauses` repository (server-ts task 10). Pauses live here
 * because they are only ever reached through a round (`round.getPauses()`).
 */
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { round_pauses, rounds } from '../schema';
import type { NewRound, Round, RoundPause } from '../types';
import { insertStamps, orNull, rowid, type DbOrTx } from './internal';

/**
 * `Round.getOpenRounds()` (`Round.where({ended_at: null})`): every round
 * still open, across all matches (TechFallTracker, RoundTimer and
 * MatchUpdate workers). Legacy order: a table scan, i.e. insertion (rowid).
 */
export async function findOpenRounds(db: DbOrTx): Promise<Round[]> {
    return await db.query.rounds.findMany({
        where:   isNull(rounds.ended_at),
        orderBy: [asc(rowid)],
    });
}

/**
 * `match.getRounds()`: legacy loads `WHERE match_id = ?` unordered (rowid,
 * since `rounds.match_id` has no index, F-40) and then stable-sorts by
 * `created_at` in JS, so ties keep insertion order. Reproduced as
 * `ORDER BY created_at, rowid` (ISO text sorts chronologically).
 */
export async function findMatchRounds(db: DbOrTx, matchId: string): Promise<Round[]> {
    return await db.query.rounds.findMany({
        where:   eq(rounds.match_id, matchId),
        orderBy: [asc(rounds.created_at), asc(rowid)],
    });
}

/** `match.getLastRound()`: the last element of `findMatchRounds`, or `null`. */
export async function findLastRound(db: DbOrTx, matchId: string): Promise<Round | null> {
    return orNull(await db.query.rounds.findFirst({
        where:   eq(rounds.match_id, matchId),
        orderBy: [desc(rounds.created_at), desc(rowid)],
    }));
}

/** `round.getPauses()` — insertion (rowid) order, via `round_pauses_round_id`. */
export async function findRoundPauses(db: DbOrTx, roundId: string): Promise<RoundPause[]> {
    return await db.query.round_pauses.findMany({
        where:   eq(round_pauses.round_id, roundId),
        orderBy: [asc(rowid)],
    });
}

/**
 * `round.getCurrentPause()`: legacy takes `pauses.slice().reverse().find(isOpen) || null`,
 * i.e. the LAST open pause in insertion order, or `null`.
 */
export async function findCurrentPause(db: DbOrTx, roundId: string): Promise<RoundPause | null> {
    return orNull(await db.query.round_pauses.findFirst({
        where:   and(eq(round_pauses.round_id, roundId), isNull(round_pauses.resumed_at)),
        orderBy: [desc(rowid)],
    }));
}


/* ----------------------------------------------------------------------------
 * Write primitives (composed by the lifecycle services, task 10b)
 * ------------------------------------------------------------------------- */

export type InsertRoundValues = Omit<NewRound, 'created_at' | 'updated_at'>;

/**
 * `Round.create({ match_id })` (`Match#startRound`). `created_at` is the
 * round's start time (`Round#started_at` is an alias for it).
 */
export async function insertRound(db: DbOrTx, values: InsertRoundValues): Promise<Round> {
    const [row] = await db.insert(rounds).values({ ...values, ...insertStamps() }).returning();
    return row;
}

export type RoundPatch = Partial<Pick<Round, 'ended_at' | 'declared_winner_id' | 'stoppage'>>;

/**
 * `round.save()` after setting attributes (`Round#end`: `ended_at`;
 * `Round#setResult`: `declared_winner_id` + `stoppage`). Also sets
 * `updated_at = now`. Returns the updated row or `null`.
 */
export async function updateRound(db: DbOrTx, id: string, patch: RoundPatch): Promise<Round | null> {
    const [row] = await db.update(rounds)
        .set({ ...patch, updated_at: new Date() })
        .where(eq(rounds.id, id))
        .returning();
    return orNull(row);
}

/** `new RoundPause({round_id, paused_at}).save()` (`Round#pause`). */
export async function insertRoundPause(db: DbOrTx, values: { round_id: string; paused_at: Date; id?: string }): Promise<RoundPause> {
    const [row] = await db.insert(round_pauses).values({
        ...(values.id ? { id: values.id } : {}),
        round_id:  values.round_id,
        paused_at: values.paused_at,
        ...insertStamps(),
    }).returning();
    return row;
}

/**
 * `openPause.resumed_at = new Date(); openPause.save()` (`Round#resume`).
 * Returns the updated row or `null`.
 */
export async function setPauseResumed(db: DbOrTx, pauseId: string, resumedAt: Date = new Date()): Promise<RoundPause | null> {
    const [row] = await db.update(round_pauses)
        .set({ resumed_at: resumedAt, updated_at: new Date() })
        .where(eq(round_pauses.id, pauseId))
        .returning();
    return orNull(row);
}
