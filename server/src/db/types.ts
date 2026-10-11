/**
 * Row types inferred from the Drizzle schema (server-ts task 09).
 *
 * Types-only: always pulled in with `import type`, so it is erased at runtime
 * and bun never loads it (same convention as `src/domain/types.ts`, which is
 * why it may use `export` while the runtime modules stay CommonJS).
 *
 * `X` is a row as selected; `NewX` is what an insert accepts (columns with an
 * app-side `$defaultFn`/`default` become optional).
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
    judges_matches,
    judges_mats,
    mat_codes,
    matches,
    mats,
    mats_viewers,
    riding_time_votes,
    round_pauses,
    rounds,
    users,
} from './schema';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Mat = InferSelectModel<typeof mats>;
export type NewMat = InferInsertModel<typeof mats>;

export type MatCode = InferSelectModel<typeof mat_codes>;
export type NewMatCode = InferInsertModel<typeof mat_codes>;

export type Match = InferSelectModel<typeof matches>;
export type NewMatch = InferInsertModel<typeof matches>;

export type Round = InferSelectModel<typeof rounds>;
export type NewRound = InferInsertModel<typeof rounds>;

export type RidingTimeVote = InferSelectModel<typeof riding_time_votes>;
export type NewRidingTimeVote = InferInsertModel<typeof riding_time_votes>;

export type RoundPause = InferSelectModel<typeof round_pauses>;
export type NewRoundPause = InferInsertModel<typeof round_pauses>;

export type JudgeMat = InferSelectModel<typeof judges_mats>;
export type NewJudgeMat = InferInsertModel<typeof judges_mats>;

export type MatViewer = InferSelectModel<typeof mats_viewers>;
export type NewMatViewer = InferInsertModel<typeof mats_viewers>;

export type JudgeMatch = InferSelectModel<typeof judges_matches>;
export type NewJudgeMatch = InferInsertModel<typeof judges_matches>;

/* ----------------------------------------------------------------------------
 * Compile-time assertions (erased at runtime; `bun run typecheck` checks them).
 *
 * tsconfig has `strict: false` (until task 18), so `string | null` collapses to
 * `string` and row-type assertions cannot see nullability. The assertions
 * therefore read the column's own `notNull` type flag instead.
 *
 * The columns listed in `_NotNullValueClassColumns` back NON-nullable Kotlin
 * value classes (UserId, MatId, MatchId, RoundId, AuthToken in
 * app/.../network/models.kt). If any is relaxed to nullable in schema.ts, its
 * line stops compiling - the same regression that once crashed the Wasm client
 * with "Cannot cast null to kotlin.String".
 * ------------------------------------------------------------------------- */

type Assert<T extends true> = T;
type IsNotNull<C extends { _: { notNull: boolean } }> = C['_']['notNull'] extends true ? true : false;
type IsNullable<C extends { _: { notNull: boolean } }> = C['_']['notNull'] extends false ? true : false;

export type _NotNullValueClassColumns = [
    Assert<IsNotNull<typeof users.id>>,                      // UserId
    Assert<IsNotNull<typeof users.api_token>>,               // AuthToken
    Assert<IsNotNull<typeof mats.id>>,                       // MatId
    Assert<IsNotNull<typeof mats.creator_id>>,               // UserId
    Assert<IsNotNull<typeof matches.id>>,                    // MatchId
    Assert<IsNotNull<typeof matches.creator_id>>,            // UserId
    Assert<IsNotNull<typeof matches.mat_id>>,                // MatId
    Assert<IsNotNull<typeof matches.red_competitor_id>>,     // User.id
    Assert<IsNotNull<typeof matches.blue_competitor_id>>,    // User.id
    Assert<IsNotNull<typeof rounds.id>>,                     // RoundId
    Assert<IsNotNull<typeof riding_time_votes.judge_id>>,    // Map<UserId, _> key
    Assert<IsNotNull<typeof riding_time_votes.competitor_id>>,
];

// Genuinely nullable columns stay nullable (Kotlin: Instant?, Int?, User?).
export type _NullableColumns = [
    Assert<IsNullable<typeof matches.started_at>>,
    Assert<IsNullable<typeof matches.ended_at>>,
    Assert<IsNullable<typeof matches.break_duration>>,
    Assert<IsNullable<typeof rounds.declared_winner_id>>,
    Assert<IsNullable<typeof rounds.stoppage>>,
    Assert<IsNullable<typeof riding_time_votes.ended_at>>,
    Assert<IsNullable<typeof round_pauses.resumed_at>>,
];
