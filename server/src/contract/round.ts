/**
 * `Round` / `RoundResult` / `RoundResultMethod` / `RoundResultType` —
 * `models.kt:168-206`.
 *
 * Almost none of this is a column: `score` is computed from
 * `RidingTimeVote` timestamps, `paused` and `time_remaining` from
 * `RoundPause` rows, and `result` from `RDojoKombatRules.determineWinner`.
 */
import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './scalars';
import { leakedUserSchema, userSchema } from './user';

export const roundResultTypeSchema = z.enum([
    'submission',
    'stoppage',
    'points',
    'tie',
    // Hyphenated on the wire — `RoundResultType.TECH_FALL` carries
    // `@SerialName("tech-fall")`.
    'tech-fall',
]);
export type RoundResultType = z.infer<typeof roundResultTypeSchema>;

/**
 * `{ type, value }` — both nullable. `type` is null only while the round is
 * still open (`determineWinner` short-circuits on `!round.ended`). `value` is
 * always a STRING when present: a riding-time score is stringified
 * (`String(score)`), and a submission carries `null`, never the submission
 * name. `models.kt`'s comment ("can be … riding time (number as string)")
 * matches; no golden ever carries a number here.
 */
export const roundResultMethodSchema = z.strictObject({
    type: roundResultTypeSchema.nullable(),
    value: z.string().nullable(),
});

const makeRoundResultSchema = (winner: z.ZodType) =>
    z.strictObject({
        winner: winner.nullable(),
        method: roundResultMethodSchema,
    });

/**
 * `winnerUser` is parameterised only to accommodate F-22: over WebSocket,
 * `result.winner` is an unserialised Sequelize instance and carries
 * `api_token`. See `user.ts`.
 *
 * Optionality notes, all cross-checked against the 32 round objects in the
 * goldens (every key present in all 32):
 *   - `paused` and `time_remaining` carry Kotlin defaults (`false` / `null`),
 *     so the client tolerates their absence — but `Round#toApiResponse`
 *     builds a fixed object literal, so they are ALWAYS present on the wire.
 *     Modelled as required (nullable for `time_remaining`), describing what
 *     the server actually sends.
 *   - `time_remaining` is null exactly when the round has ended.
 *   - `started_at` is `this.created_at`, never null.
 */
const makeRoundSchema = (winnerUser: z.ZodType) =>
    z.strictObject({
        id: idSchema,
        max_duration: z.number().int(),
        started_at: isoDateTimeSchema,
        ended_at: isoDateTimeSchema.nullable(),
        // UserId -> riding time in seconds, for exactly the two competitors.
        score: z.record(idSchema, z.number().int()),
        paused: z.boolean(),
        time_remaining: z.number().int().nullable(),
        result: makeRoundResultSchema(winnerUser),
    });

/** The HTTP shape. */
export const roundSchema = makeRoundSchema(userSchema);
export type Round = z.infer<typeof roundSchema>;

/** The WebSocket shape — identical but for the F-22 `result.winner` leak. */
export const leakedRoundSchema = makeRoundSchema(leakedUserSchema);
export type LeakedRound = z.infer<typeof leakedRoundSchema>;

export const roundResultSchema = makeRoundResultSchema(userSchema);
export type RoundResult = z.infer<typeof roundResultSchema>;
