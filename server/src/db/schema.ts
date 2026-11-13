/**
 * Drizzle schema for the Accord SQLite database.
 *
 * THIS FILE IS THE SOURCE OF TRUTH for the schema; the migrations in
 * `server/drizzle/` are generated from it by drizzle-kit (`bun run db:generate`).
 * See `src/db/README.md`.
 *
 *  - Table and column names are the physical snake_case names, and the JS
 *    property keys are the SAME snake_case names, so `InferSelectModel` rows
 *    line up with the domain layer (`src/domain/types.ts`) and the wire.
 *  - Ids are UUID strings stored as text. There is NO database default; they
 *    are generated in the app with `$defaultFn` (app-side only, emits no DDL).
 *  - DATETIME columns are `text` holding ISO 8601 UTC
 *    (`YYYY-MM-DDTHH:mm:ss.SSSZ`, i.e. `Date#toISOString()`) and surface as
 *    JS `Date` via the `isoDateTime` custom type (`./columns`). Read
 *    with `new Date(text)`; ISO is the only supported format.
 *  - `created_at` / `updated_at` have no DB default; the repositories set them
 *    on insert and update.
 *  - There are NO foreign keys, and SQLite would not enforce them without
 *    `PRAGMA foreign_keys=ON` anyway. Associations exist only as `relations()`
 *    below (query-level, no DDL).
 */
import { randomUUID } from 'node:crypto';
import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { isoDateTime } from './columns';

/** UUID primary key, generated app-side. */
const uuidPk = () => text('id').primaryKey().notNull().$defaultFn(() => randomUUID());

/**
 * A DATETIME column: TEXT holding ISO 8601 UTC, typed as `Date`.
 */
const datetime = (name: string) => isoDateTime(name);

/** `created_at` and `updated_at`: NOT NULL, no DB default. */
const timestamps = () => ({
    created_at: datetime('created_at').notNull(),
    updated_at: datetime('updated_at').notNull(),
});


/* ============================================================================
 * TABLES
 * ========================================================================== */

/** `users` (createUsers, dropUserEmails). `api_token` backs Kotlin `AuthToken`. */
export const users = sqliteTable('users', {
    id:        uuidPk(),
    name:      text('name').notNull(),
    api_token: text('api_token').notNull().unique(),
    ...timestamps(),
});

/**
 * `mats` (createMats, addUsersToMats, createMatCodesTable, enforceMatCreatorId).
 * `judge_count` is NOT NULL DEFAULT 1 in the real DB (not nullable).
 * `creator_id` is NOT NULL since enforceMatCreatorId; backs Kotlin `UserId`.
 */
export const mats = sqliteTable('mats', {
    id:          uuidPk(),
    name:        text('name').notNull(),
    judge_count: integer('judge_count').notNull().default(1),
    creator_id:  text('creator_id').notNull(),
    ...timestamps(),
});

/** `mat_codes` (createMatCodesTable). One code per (mat, role). */
export const mat_codes = sqliteTable('mat_codes', {
    id:     uuidPk(),
    mat_id: text('mat_id').notNull(),
    code:   text('code').notNull().unique(),
    role:   text('role').notNull(),
    ...timestamps(),
}, (t) => [
    uniqueIndex('mat_codes_mat_id_role').on(t.mat_id, t.role),
]);

/** `matches` (createMatches, addMatchIndexes, addBreakFieldsToMatches). */
export const matches = sqliteTable('matches', {
    id:                 uuidPk(),
    creator_id:         text('creator_id').notNull(),
    mat_id:             text('mat_id').notNull(),
    red_competitor_id:  text('red_competitor_id').notNull(),
    blue_competitor_id: text('blue_competitor_id').notNull(),
    red_score:          integer('red_score').notNull().default(0),
    blue_score:         integer('blue_score').notNull().default(0),
    started_at:         datetime('started_at'),
    ended_at:           datetime('ended_at'),
    ...timestamps(),
    break_started_at:   datetime('break_started_at'),
    break_duration:     integer('break_duration'),
}, (t) => [
    index('matches_mat_id').on(t.mat_id),
    index('incomplete_matches_idx').on(t.mat_id).where(sql`\`ended_at\` IS NULL`),
]);

/**
 * `rounds` (createRounds, replaceSubmissionWithWinnerOnRounds).
 * No index on `match_id`: a match has at most a few rounds.
 * `stoppage` is a boolean (stored 0/1/NULL).
 */
export const rounds = sqliteTable('rounds', {
    id:                 uuidPk(),
    match_id:           text('match_id').notNull(),
    ended_at:           datetime('ended_at'),
    ...timestamps(),
    declared_winner_id: text('declared_winner_id'),
    stoppage:           integer('stoppage', { mode: 'boolean' }),
});

/** `riding_time_votes` (createRidingTimeVotes). Open vote = `ended_at` NULL. */
export const riding_time_votes = sqliteTable('riding_time_votes', {
    id:            uuidPk(),
    round_id:      text('round_id').notNull(),
    judge_id:      text('judge_id').notNull(),
    competitor_id: text('competitor_id').notNull(),
    ended_at:      datetime('ended_at'),
    ...timestamps(),
}, (t) => [
    index('riding_time_votes_round_id').on(t.round_id),
    uniqueIndex('riding_time_votes_one_open_per_judge').on(t.round_id, t.judge_id).where(sql`\`ended_at\` IS NULL`),
]);

/** `round_pauses`. Open pause = `resumed_at` NULL; a round has at most one. */
export const round_pauses = sqliteTable('round_pauses', {
    id:         uuidPk(),
    round_id:   text('round_id').notNull(),
    paused_at:  datetime('paused_at').notNull(),
    resumed_at: datetime('resumed_at'),
    ...timestamps(),
}, (t) => [
    index('round_pauses_round_id').on(t.round_id),
    uniqueIndex('round_pauses_one_open_per_round').on(t.round_id).where(sql`\`resumed_at\` IS NULL`),
]);

/* --- join tables: no id, no primary key (created with `{id: false}`) ------ */

/** `judges_mats` — Mat.belongsToMany(User, as 'judges'). */
export const judges_mats = sqliteTable('judges_mats', {
    mat_id:  text('mat_id').notNull(),
    user_id: text('user_id').notNull(),
    ...timestamps(),
}, (t) => [
    index('judges_mats_user_id').on(t.user_id),
    uniqueIndex('judges_mats_mat_id_user_id').on(t.mat_id, t.user_id),
]);

/** `mats_viewers` — Mat.belongsToMany(User, as 'viewers'). */
export const mats_viewers = sqliteTable('mats_viewers', {
    mat_id:  text('mat_id').notNull(),
    user_id: text('user_id').notNull(),
    ...timestamps(),
}, (t) => [
    index('mats_viewers_user_id').on(t.user_id),
    uniqueIndex('mats_viewers_mat_id_user_id').on(t.mat_id, t.user_id),
]);

/** `judges_matches` — Match.belongsToMany(User, as 'judges'). */
export const judges_matches = sqliteTable('judges_matches', {
    match_id: text('match_id').notNull(),
    user_id:  text('user_id').notNull(),
    ...timestamps(),
}, (t) => [
    index('judges_matches_user_id').on(t.user_id),
    uniqueIndex('judges_matches_match_id_user_id').on(t.match_id, t.user_id),
]);


/* ============================================================================
 * RELATIONS — query-level only (no FKs exist).
 * Where a table has several relations to the same target, `relationName`
 * pairs each `one` with its `many` inverse.
 * ========================================================================== */

export const usersRelations = relations(users, ({ many }) => ({
    createdMats:      many(mats,           { relationName: 'mat_creator' }),
    createdMatches:   many(matches,        { relationName: 'match_creator' }),
    redMatches:       many(matches,        { relationName: 'match_red_competitor' }),
    blueMatches:      many(matches,        { relationName: 'match_blue_competitor' }),
    judgesMats:       many(judges_mats),
    matsViewers:      many(mats_viewers),
    judgesMatches:    many(judges_matches),
    ridingTimeVotesAsJudge:      many(riding_time_votes, { relationName: 'vote_judge' }),
    ridingTimeVotesAsCompetitor: many(riding_time_votes, { relationName: 'vote_competitor' }),
    declaredWinnerRounds:        many(rounds,            { relationName: 'round_declared_winner' }),
}));

export const matsRelations = relations(mats, ({ one, many }) => ({
    /** Mat.belongsTo(User, {foreignKey: 'creator_id', as: 'creator'}) */
    creator:  one(users, { fields: [mats.creator_id], references: [users.id], relationName: 'mat_creator' }),
    /** Mat.belongsToMany(User, {as: 'judges', through: 'judges_mats'}) — via the join rows */
    judgesMats:  many(judges_mats),
    /** Mat.belongsToMany(User, {as: 'viewers', through: 'mats_viewers'}) — via the join rows */
    matsViewers: many(mats_viewers),
    /** Mat.hasMany(MatCode) — getMatCodes() */
    matCodes: many(mat_codes),
    /** Mat.hasMany(Match) — getMatches()/getIncompleteMatches(); current/upcoming are derived */
    matches:  many(matches),
}));

export const matCodesRelations = relations(mat_codes, ({ one }) => ({
    /** MatCode.belongsTo(Mat) — code.getMat() */
    mat: one(mats, { fields: [mat_codes.mat_id], references: [mats.id] }),
}));

export const judgesMatsRelations = relations(judges_mats, ({ one }) => ({
    mat:  one(mats,  { fields: [judges_mats.mat_id],  references: [mats.id] }),
    user: one(users, { fields: [judges_mats.user_id], references: [users.id] }),
}));

export const matsViewersRelations = relations(mats_viewers, ({ one }) => ({
    mat:  one(mats,  { fields: [mats_viewers.mat_id],  references: [mats.id] }),
    user: one(users, { fields: [mats_viewers.user_id], references: [users.id] }),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
    /** Match.belongsTo(User, {foreignKey: 'creator_id', as: 'creator'}) */
    creator:        one(users, { fields: [matches.creator_id],         references: [users.id], relationName: 'match_creator' }),
    /** Match.belongsTo(User, {foreignKey: 'red_competitor_id', as: 'redCompetitor'}) — getRedCompetitor() */
    redCompetitor:  one(users, { fields: [matches.red_competitor_id],  references: [users.id], relationName: 'match_red_competitor' }),
    /** Match.belongsTo(User, {foreignKey: 'blue_competitor_id', as: 'blueCompetitor'}) — getBlueCompetitor() */
    blueCompetitor: one(users, { fields: [matches.blue_competitor_id], references: [users.id], relationName: 'match_blue_competitor' }),
    /** Match.belongsTo(Mat) — getMat() */
    mat:            one(mats,  { fields: [matches.mat_id],             references: [mats.id] }),
    /** The match's judges, via the join rows. */
    judgesMatches:  many(judges_matches),
    /** A match's rounds (the repositories sort by created_at). */
    rounds:         many(rounds),
}));

export const judgesMatchesRelations = relations(judges_matches, ({ one }) => ({
    match: one(matches, { fields: [judges_matches.match_id], references: [matches.id] }),
    user:  one(users,   { fields: [judges_matches.user_id],  references: [users.id] }),
}));

export const roundsRelations = relations(rounds, ({ one, many }) => ({
    /** The round's match. */
    match:           one(matches, { fields: [rounds.match_id], references: [matches.id] }),
    /** rounds.declared_winner_id -> users.id (read by scoring via id compare) */
    declaredWinner:  one(users,   { fields: [rounds.declared_winner_id], references: [users.id], relationName: 'round_declared_winner' }),
    /** The round's votes. */
    ridingTimeVotes: many(riding_time_votes),
    /** The round's pauses. */
    pauses:          many(round_pauses),
}));

export const ridingTimeVotesRelations = relations(riding_time_votes, ({ one }) => ({
    round:      one(rounds, { fields: [riding_time_votes.round_id],      references: [rounds.id] }),
    judge:      one(users,  { fields: [riding_time_votes.judge_id],      references: [users.id], relationName: 'vote_judge' }),
    competitor: one(users,  { fields: [riding_time_votes.competitor_id], references: [users.id], relationName: 'vote_competitor' }),
}));

export const roundPausesRelations = relations(round_pauses, ({ one }) => ({
    round: one(rounds, { fields: [round_pauses.round_id], references: [rounds.id] }),
}));
