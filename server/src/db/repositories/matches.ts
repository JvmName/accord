/**
 * `matches` repository, including the `judges_matches` join rows and the
 * hot-path relational loader used by every match render and worker tick.
 */
import { and, asc, eq, getTableColumns, inArray, isNotNull, isNull, notInArray, type SQL } from 'drizzle-orm';
import { judges_matches, matches, users } from '../schema';
import type { Mat, Match, NewMatch, RidingTimeVote, Round, RoundPause, User } from '../types';
import { insertStamps, orNull, rowid, type DbOrTx, inserted } from './internal';

/** `Match.find(id)` (`findByPk`): the match or `null`; a nullish id yields `null` without a query. */
export async function findMatchById(db: DbOrTx, id: string | null | undefined): Promise<Match | null> {
    if (id === null || id === undefined) return null;
    return orNull(await db.query.matches.findFirst({ where: eq(matches.id, id) }));
}

/**
 * Matches in a break that have not ended (MatchUpdateWorker,
 * BreakTransitionWorker), by `(mat_id, rowid)`: SQLite scans the partial index
 * `incomplete_matches_idx (mat_id) WHERE ended_at IS NULL`.
 */
export async function findMatchesInBreak(db: DbOrTx): Promise<Match[]> {
    return await db.query.matches.findMany({
        where:   and(isNotNull(matches.break_started_at), isNull(matches.ended_at)),
        orderBy: [asc(matches.mat_id), asc(rowid)],
    });
}

/**
 * A match's judges (permissions, round scoring, rendering). INNER JOIN
 * through `judges_matches`, ordered by `user_id` (the unique index
 * `(match_id, user_id)`), not by join time.
 */
export async function findMatchJudges(db: DbOrTx, matchId: string): Promise<User[]> {
    return await db.select(getTableColumns(users))
        .from(judges_matches)
        .innerJoin(users, eq(users.id, judges_matches.user_id))
        .where(eq(judges_matches.match_id, matchId))
        .orderBy(asc(judges_matches.user_id));
}


/* ----------------------------------------------------------------------------
 * Hot-path loader
 * ------------------------------------------------------------------------- */

export type RoundWithActivity = Round & {
    /** `round.getRidingTimeVotes()` — insertion (rowid) order. */
    ridingTimeVotes: RidingTimeVote[];
    /** `round.getPauses()` — insertion (rowid) order. */
    pauses: RoundPause[];
};

export type MatchGraph = Match & {
    /** `match.getMat()` — `null` if the mat row is missing. */
    mat: Mat | null;
    /** `match.getRedCompetitor()` — `null` if the user row is missing. */
    redCompetitor: User | null;
    /** `match.getBlueCompetitor()` — `null` if the user row is missing. */
    blueCompetitor: User | null;
    /** `match.getJudges()` — ordered by `user_id`, as `findMatchJudges`. */
    judges: User[];
    /** `match.getRounds()` — ordered by `created_at`, ties by insertion, as `findMatchRounds`. */
    rounds: RoundWithActivity[];
};

/**
 * One relational query that loads everything a match render and its round
 * scoring need: mat, both competitors, judges, rounds, and each round's votes
 * and pauses.
 */
function matchGraphQuery(db: DbOrTx, where: SQL) {
    return db.query.matches.findMany({
        where,
        with: {
            mat:            true,
            redCompetitor:  true,
            blueCompetitor: true,
            // Callback form: nested relations are aliased, so columns come from `t`.
            judgesMatches:  { with: { user: true }, orderBy: (t, o) => [o.asc(t.user_id)] },
            rounds: {
                // By created_at, ties in insertion order.
                orderBy: (t, o) => [o.asc(t.created_at), asc(rowid)],
                with: {
                    ridingTimeVotes: { orderBy: () => [asc(rowid)] },
                    pauses:          { orderBy: () => [asc(rowid)] },
                },
            },
        },
    });
}

type MatchGraphRow = Awaited<ReturnType<typeof matchGraphQuery>>[number];

function toMatchGraph(row: MatchGraphRow): MatchGraph {
    const { judgesMatches, mat, redCompetitor, blueCompetitor, rounds, ...match } = row;
    return {
        ...match,
        mat:            mat ?? null,
        redCompetitor:  redCompetitor ?? null,
        blueCompetitor: blueCompetitor ?? null,
        // INNER JOIN semantics: a join row whose user is missing contributes nothing.
        judges:         judgesMatches.map((j) => j.user).filter((u): u is User => u != null),
        rounds,
    };
}

/** The full graph for one match, or `null` if it does not exist. */
export async function findMatchGraph(db: DbOrTx, matchId: string): Promise<MatchGraph | null> {
    const [row] = await matchGraphQuery(db, eq(matches.id, matchId));
    return row ? toMatchGraph(row) : null;
}

/**
 * Full graphs for many matches in ONE query (a worker tick: open rounds'
 * matches + matches in break). Keyed by match id; ids that do not exist are
 * simply absent. Duplicate ids are fine.
 */
export async function findMatchGraphsByIds(db: DbOrTx, matchIds: readonly string[]): Promise<Map<string, MatchGraph>> {
    const ids = [...new Set(matchIds)];
    const out = new Map<string, MatchGraph>();
    if (!ids.length) return out;
    const rows = await matchGraphQuery(db, inArray(matches.id, ids));
    for (const row of rows) out.set(row.id, toMatchGraph(row));
    return out;
}


/* ----------------------------------------------------------------------------
 * Write primitives (composed by the lifecycle services)
 * ------------------------------------------------------------------------- */

export type InsertMatchValues = Omit<NewMatch, 'created_at' | 'updated_at'>;

/**
 * `Match.create({ mat_id, creator_id, red_competitor_id, blue_competitor_id })`.
 * Other columns are optional (scores default to 0, datetimes to NULL).
 */
export async function insertMatch(db: DbOrTx, values: InsertMatchValues): Promise<Match> {
    const [row] = await db.insert(matches).values({ ...values, ...insertStamps() }).returning();
    return inserted(row);
}

export type MatchPatch = Partial<Pick<Match,
    'started_at' | 'ended_at' | 'break_started_at' | 'break_duration' | 'red_score' | 'blue_score'>>;

/**
 * Writes the given columns plus `updated_at = now`, and returns the updated
 * row (`null` if no such match). `updated_at` is bumped even if a value is
 * unchanged.
 */
export async function updateMatch(db: DbOrTx, id: string, patch: MatchPatch): Promise<Match | null> {
    const [row] = await db.update(matches)
        .set({ ...patch, updated_at: new Date() })
        .where(eq(matches.id, id))
        .returning();
    return orNull(row);
}

/** Starts the match only if it has not started, and says whether this call did. */
export async function claimMatchStart(db: DbOrTx, id: string, startedAt: Date): Promise<boolean> {
    const claimed = await db.update(matches)
        .set({ started_at: startedAt, updated_at: new Date() })
        .where(and(eq(matches.id, id), isNull(matches.started_at)))
        .returning({ id: matches.id });
    return claimed.length > 0;
}

/**
 * Ends the match and clears its break only if it has not ended, and says
 * whether this call did.
 */
export async function claimMatchEnd(db: DbOrTx, id: string, endedAt: Date): Promise<boolean> {
    const claimed = await db.update(matches)
        .set({ ended_at: endedAt, break_started_at: null, break_duration: null, updated_at: new Date() })
        .where(and(eq(matches.id, id), isNull(matches.ended_at)))
        .returning({ id: matches.id });
    return claimed.length > 0;
}

/**
 * Sets the match's judges: delete join rows for users not in `userIds`, insert rows for new
 * ones, leave existing rows (and their timestamps) untouched.
 */
export async function setMatchJudges(db: DbOrTx, matchId: string, userIds: readonly string[]): Promise<void> {
    const ids = [...new Set(userIds)];
    await db.delete(judges_matches).where(ids.length
        ? and(eq(judges_matches.match_id, matchId), notInArray(judges_matches.user_id, ids))
        : eq(judges_matches.match_id, matchId));
    if (!ids.length) return;
    const stamps = insertStamps();
    await db.insert(judges_matches)
        .values(ids.map((user_id) => ({ match_id: matchId, user_id, ...stamps })))
        .onConflictDoNothing();
}

/** `match.addJudge(user)`. Idempotent like `belongsToMany#add`. */
export async function addMatchJudge(db: DbOrTx, matchId: string, userId: string): Promise<void> {
    await db.insert(judges_matches)
        .values({ match_id: matchId, user_id: userId, ...insertStamps() })
        .onConflictDoNothing();
}

/** `match.removeJudge(user)`: deletes the join row (no-op when absent). */
export async function removeMatchJudge(db: DbOrTx, matchId: string, userId: string): Promise<void> {
    await db.delete(judges_matches)
        .where(and(eq(judges_matches.match_id, matchId), eq(judges_matches.user_id, userId)));
}
