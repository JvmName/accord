/**
 * `Mat` — `models.kt:83`.
 *
 * `current_match` and `upcoming_matches` are computed, not columns.
 */
import { z } from 'zod';
import { matchSchema } from './match';
import { matCodeSchema } from './matCode';
import { idSchema } from './scalars';
import { userSchema } from './user';

/**
 * Optionality, checked against the 37 mat objects in the goldens:
 *
 *   - `judges` — present in 11/37. Rendered only under `includeMatJudges`;
 *     the mat nested inside a match payload (`http.match.get.inBreak`) omits
 *     it. **Optional**, never null.
 *   - `codes` — present in 1/37: `POST /mats` passes `includeCodes` and
 *     nothing else ever does, not even `GET /mat/:matId`. **Optional**.
 *   - `current_match` / `upcoming_matches` — present in 4/37, rendered only
 *     under `includeMatches`. `current_match` is additionally NULLABLE when
 *     the mat has no match in progress (`http.mat.get.empty`), so it is
 *     `.nullable().optional()`; `upcoming_matches` is an array that is empty,
 *     never null.
 *   - `judge_count` — present in all 37 and non-null in all 37, but it is
 *     `Int? = null` in `models.kt` and the column is nullable (it is no
 *     longer required at mat creation: `POST /mats` validates only `name`,
 *     see `http.mats.create.missingName.400`). It is rendered from
 *     `apiSafeKeys`, so the KEY is always present; the VALUE can legitimately
 *     be null for a mat created without one. Modelled as required + nullable.
 *   - `id`, `name`, `creator_id` — always present, never null.
 *
 * Matches nested here carry the HTTP (non-leaking) user shape: `Mat` is never
 * the root of a WebSocket payload, and the `mat` embedded in one goes through
 * `Mat#toApiResponse` with no `includeMatches`.
 */
export const matSchema = z.strictObject({
    id: idSchema,
    name: z.string(),
    judge_count: z.number().int().nullable(),
    creator_id: idSchema,

    judges: z.array(userSchema).optional(),
    codes: z.array(matCodeSchema).optional(),
    current_match: z.lazy(() => matchSchema).nullable().optional(),
    upcoming_matches: z.array(z.lazy(() => matchSchema)).optional(),
});
export type Mat = z.infer<typeof matSchema>;
