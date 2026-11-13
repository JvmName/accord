/**
 * `Match` — `models.kt:120`.
 *
 * `red_competitor`/`blue_competitor` are `*_competitor_id` columns resolved to
 * users; `winner` is derived; `break_remaining` is computed at render time.
 */
import { z } from 'zod';
import { matSchema } from './mat';
import { roundSchema } from './round';
import { idSchema, isoDateTimeSchema, nullableRef } from './scalars';
import { userSchema } from './user';

/**
 * Nullable-vs-optional, field by field. `models.kt` gives Kotlin defaults to
 * seven of these properties, which means the client tolerates their ABSENCE;
 * what the server actually sends is narrower, and that is what is modelled
 * here (the goldens are ground truth). Evidence is from the 29 HTTP match
 * objects and 4 WebSocket payloads in `test/contract/goldens/`:
 *
 *   - `mat`, `judges`, `rounds` — genuinely **optional**. Rendered only when
 *     the caller passes `includeMat` / `includeMatchJudges` / `includeRounds`,
 *     so the key is ABSENT (not null) from partial payloads: nested matches
 *     under `Mat.current_match` (`http.mat.get.byId`) omit all three, and
 *     `ws.round.techFall` omits `mat` and `judges`. This absent-vs-null
 *     distinction is precisely what `Match.merge()` in `models_ext.kt` exists
 *     to absorb — never collapse it to `.nullable()`.
 *   - `winner`, `started_at`, `ended_at` — present in all 33, nullable.
 *     A null `winner` on an ENDED match is a valid draw, not an error.
 *   - `break_started_at`, `break_duration`, `break_remaining` — present in all
 *     33, nullable. `break_remaining` is computed on every render, over HTTP
 *     as well as WebSocket, so a plain `GET /match/:id` during a break returns
 *     a live countdown (`http.match.get.inBreak` → `break_remaining: 40`).
 *   - `id`, `creator_id`, `mat_id`, `red_competitor`, `blue_competitor` —
 *     always present, never null.
 *
 * `competitorUser` is a parameter so the same shape serves both transports;
 * both use the safe user (`{ id, name }`).
 */
const makeMatchSchema = <U extends z.ZodType, R extends z.ZodType>(competitorUser: U, round: R) =>
    z.strictObject({
        id: idSchema,
        creator_id: idSchema,
        mat_id: idSchema,
        started_at: isoDateTimeSchema.nullable(),
        ended_at: isoDateTimeSchema.nullable(),
        red_competitor: competitorUser,
        blue_competitor: competitorUser,
        winner: nullableRef(competitorUser),

        // Association-dependent — absent unless explicitly included.
        // Typed `unknown` to cut the Mat <-> Match inference cycle; Mat -> Match stays fully typed.
        mat: z.lazy((): z.ZodType<unknown> => matSchema).optional(),
        // Judges are always the safe user shape, on every transport.
        judges: z.array(userSchema).optional(),
        rounds: z.array(round).optional(),

        break_started_at: isoDateTimeSchema.nullable(),
        break_duration: z.number().int().nullable(),
        break_remaining: z.number().int().nullable(),
    });

/** The HTTP shape. */
export const matchSchema = makeMatchSchema(userSchema, roundSchema);
export type Match = z.infer<typeof matchSchema>;

