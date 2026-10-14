/**
 * `mats` repository (server-ts task 10), including the `judges_mats` and
 * `mats_viewers` join rows (legacy `Mat.belongsToMany(User, {as: 'judges'|'viewers'})`).
 */
import { and, asc, eq, getTableColumns, isNull } from 'drizzle-orm';
import { judges_mats, matches, mats, mats_viewers, users } from '../schema';
import type { Mat, MatCode, Match, User } from '../types';
import { findMatCodeByCode } from './matCodes';
import { insertStamps, orNull, rowid, type DbOrTx } from './internal';

/** `Mat.find(id)` (`findByPk`): the mat or `null`; a nullish id yields `null` without a query. */
export async function findMatById(db: DbOrTx, id: string | null | undefined): Promise<Mat | null> {
    if (id === null || id === undefined) return null;
    return orNull(await db.query.mats.findFirst({ where: eq(mats.id, id) }));
}

/**
 * `Mat.findByCode(code)`, preserved exactly, including its two different
 * "not found" values:
 *  - no such code             -> `undefined` (legacy `if (!code) return;`)
 *  - code whose mat is gone   -> `null`      (legacy `code.getMat()`)
 * (`ServerController#initCurrentMat` inlines the same two steps itself.)
 */
export async function findMatByCode(db: DbOrTx, code: string | null | undefined): Promise<Mat | null | undefined> {
    const matCode = await findMatCodeByCode(db, code);
    if (!matCode) return undefined;
    return await findMatById(db, matCode.mat_id);
}

/**
 * `mat.getJudges()`. Users joined through `judges_mats` (INNER JOIN: a join
 * row whose user is missing yields nothing). Legacy order: SQLite drives the
 * join from the unique index `(mat_id, user_id)`, so judges come back ordered
 * by `user_id`, NOT by when they joined.
 */
export async function findMatJudges(db: DbOrTx, matId: string): Promise<User[]> {
    return await db.select(getTableColumns(users))
        .from(judges_mats)
        .innerJoin(users, eq(users.id, judges_mats.user_id))
        .where(eq(judges_mats.mat_id, matId))
        .orderBy(asc(judges_mats.user_id));
}

/**
 * `mat.getViewers()` and `mat.getViewers({where: {id: userId}})` (the
 * "already a viewer?" check in `UsersController#addAsViewer`). Same join and
 * ordering rules as `findMatJudges`.
 */
export async function findMatViewers(db: DbOrTx, matId: string, filter: { userId?: string } = {}): Promise<User[]> {
    const where = filter.userId === undefined
        ? eq(mats_viewers.mat_id, matId)
        : and(eq(mats_viewers.mat_id, matId), eq(users.id, filter.userId));
    return await db.select(getTableColumns(users))
        .from(mats_viewers)
        .innerJoin(users, eq(users.id, mats_viewers.user_id))
        .where(where)
        .orderBy(asc(mats_viewers.user_id));
}

/**
 * `mat.getIncompleteMatches()` (`getMatches({where: {ended_at: null}})`).
 * Returned in legacy DB order (insertion/rowid, via `incomplete_matches_idx`),
 * NOT sorted: `Mat#toApiResponse` sorts by `created_at` itself, while
 * `UsersController` takes `.find(m => m.started)` on this unsorted order
 * (FINDINGS F-48). Callers must reproduce whichever they replace.
 */
export async function findIncompleteMatchesForMat(db: DbOrTx, matId: string): Promise<Match[]> {
    return await db.query.matches.findMany({
        where:   and(eq(matches.mat_id, matId), isNull(matches.ended_at)),
        orderBy: [asc(rowid)],
    });
}

export type MatGraph = Mat & {
    judges: User[];
    matCodes: MatCode[];
    incompleteMatches: Match[];
};

/**
 * Everything `Mat#toApiResponse` loads (`includeMatJudges`, `includeCodes`,
 * `includeMatches`) in ONE relational query, with the same per-association
 * ordering as the single-purpose functions above. `null` when the mat does
 * not exist. Nested match payloads (competitors, rounds, winner) are loaded
 * with `findMatchGraphsByIds` (matches.ts).
 */
export async function findMatGraph(db: DbOrTx, matId: string): Promise<MatGraph | null> {
    const row = await db.query.mats.findFirst({
        where: eq(mats.id, matId),
        with: {
            // Callback form: nested relations are aliased, so columns must come from `t`.
            judgesMats: { with: { user: true }, orderBy: (t, o) => [o.asc(t.user_id)] },
            matCodes:   { orderBy: (t, o) => [o.asc(t.role)] },
            matches:    { where: (t, o) => o.isNull(t.ended_at), orderBy: () => [asc(rowid)] },
        },
    });
    if (!row) return null;
    const { judgesMats, matCodes, matches: incompleteMatches, ...mat } = row;
    return {
        ...mat,
        judges: judgesMats.map((j) => j.user).filter((u): u is User => u != null),
        matCodes,
        incompleteMatches,
    };
}

export interface InsertMatValues {
    name: string;
    creator_id: string;
    /** Omitted/`undefined` -> the column default (1), as `Mat.create` does for a missing param. */
    judge_count?: number;
    id?: string;
}

/** `Mat.create({ creator_id, name, judge_count })`. */
export async function insertMat(db: DbOrTx, values: InsertMatValues): Promise<Mat> {
    const [row] = await db.insert(mats).values({
        ...(values.id ? { id: values.id } : {}),
        name:       values.name,
        creator_id: values.creator_id,
        ...(values.judge_count === undefined ? {} : { judge_count: values.judge_count }),
        ...insertStamps(),
    }).returning();
    return row;
}

/**
 * `mat.addJudge(user)`. Idempotent like Sequelize's `belongsToMany#add`, which
 * inserts only the targets that have no join row yet (an existing row is left
 * untouched, timestamps included).
 */
export async function addMatJudge(db: DbOrTx, matId: string, userId: string): Promise<void> {
    await db.insert(judges_mats)
        .values({ mat_id: matId, user_id: userId, ...insertStamps() })
        .onConflictDoNothing();
}

/** `mat.removeJudge(user)`: deletes the join row (no-op when absent). */
export async function removeMatJudge(db: DbOrTx, matId: string, userId: string): Promise<void> {
    await db.delete(judges_mats)
        .where(and(eq(judges_mats.mat_id, matId), eq(judges_mats.user_id, userId)));
}

/** `mat.addViewer(user)`. Idempotent, as `addMatJudge`. */
export async function addMatViewer(db: DbOrTx, matId: string, userId: string): Promise<void> {
    await db.insert(mats_viewers)
        .values({ mat_id: matId, user_id: userId, ...insertStamps() })
        .onConflictDoNothing();
}

/** `mat.removeViewer(user)`: deletes the join row (no-op when absent). */
export async function removeMatViewer(db: DbOrTx, matId: string, userId: string): Promise<void> {
    await db.delete(mats_viewers)
        .where(and(eq(mats_viewers.mat_id, matId), eq(mats_viewers.user_id, userId)));
}
