/**
 * `matches` repository (server-ts task 10), including the `judges_matches`
 * join rows (legacy `Match.belongsToMany(User, {as: 'judges'})`) and the
 * hot-path relational loader used by every match render and worker tick.
 */
import { and, asc, eq, getTableColumns, inArray, isNotNull, isNull, notInArray, type SQL } from 'drizzle-orm';
import { judges_matches, matches, users } from '../schema';
import type { Mat, Match, NewMatch, RidingTimeVote, Round, RoundPause, User } from '../types';
import { insertStamps, orNull, rowid, type DbOrTx } from './internal';

/** `Match.find(id)` (`findByPk`): the match or `null`; a nullish id yields `null` without a query. */
export async function findMatchById(db: DbOrTx, id: string | null | undefined): Promise<Match | null> {
    if (id === null || id === undefined) return null;
    return orNull(await db.query.matches.findFirst({ where: eq(matches.id, id) }));
}

/**
 * `Match.where({ break_started_at: {[Op.ne]: null}, ended_at: null })`
 * (MatchUpdateWorker, BreakTransitionWorker). Legacy order: SQLite scans the
 * partial index `incomplete_matches_idx (mat_id) WHERE ended_at IS NULL`, so
 * rows come back by `(mat_id, rowid)`.
 */
export async function findMatchesInBreak(db: DbOrTx): Promise<Match[]> {
    return await db.query.matches.findMany({
        where:   and(isNotNull(matches.break_started_at), isNull(matches.ended_at)),
        orderBy: [asc(matches.mat_id), asc(rowid)],
    });
}

/**
 * `match.getJudges()` (Authorizer `judge`, Round scoring, render
 * `includeMatchJudges`, UsersController). INNER JOIN through `judges_matches`;
 * legacy order is by `user_id` (driven from the unique index
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
 * One relational query that loads everything `Match#toApiResponse` with
 * `{includeMat, includeMatchJudges, includeRounds}` (and the round scoring it
 * triggers) used to fetch lazily: mat, both competitors, judges, rounds, and
 * each round's votes and pauses. Replaces the per-match / per-round
 * `getCachedAssociation` round trips (FINDINGS F-49).
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
                // Legacy: unordered scan (rowid) then a stable JS sort by created_at.
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
 * Write primitives (composed by the lifecycle services, task 10b)
 * ------------------------------------------------------------------------- */

export type InsertMatchValues = Omit<NewMatch, 'created_at' | 'updated_at'>;

/**
 * `Match.create({ mat_id, creator_id, red_competitor_id, blue_competitor_id })`.
 * Other columns are optional (scores default to 0, datetimes to NULL).
 */
export async function insertMatch(db: DbOrTx, values: InsertMatchValues): Promise<Match> {
    const [row] = await db.insert(matches).values({ ...values, ...insertStamps() }).returning();
    return row;
}

export type MatchPatch = Partial<Pick<Match,
    'started_at' | 'ended_at' | 'break_started_at' | 'break_duration' | 'red_score' | 'blue_score'>>;

/**
 * `match.save()` after setting attributes (`start`, `end`, `Round#end`'s
 * break, BreakTransitionWorker). Writes the given columns plus
 * `updated_at = now`, and returns the updated row (`null` if no such match).
 * Unlike Sequelize's dirty tracking, `updated_at` is bumped even if a value is
 * unchanged.
 */
export async function updateMatch(db: DbOrTx, id: string, patch: MatchPatch): Promise<Match | null> {
    const [row] = await db.update(matches)
        .set({ ...patch, updated_at: new Date() })
        .where(eq(matches.id, id))
        .returning();
    return orNull(row);
}

/**
 * `match.setJudges(users)` (`Match#start`). Sequelize `belongsToMany#set`
 * semantics: delete join rows for users not in `userIds`, insert rows for new
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
