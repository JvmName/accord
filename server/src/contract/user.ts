/**
 * `User` — `models.kt:47`.
 */
import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './scalars';

/**
 * The canonical, safe user shape. `User#apiSafeKeys` renders exactly
 * `id` and `name`; both are non-nullable in `models.kt` and populated in
 * every golden.
 */
export const userSchema = z.strictObject({
    id: idSchema,
    name: z.string(),
});
export type User = z.infer<typeof userSchema>;

/**
 * ⚠️ **F-22 — a known security leak, preserved, not endorsed.**
 *
 * `Match#toApiResponse` assigns the raw Sequelize model instances for
 * `red_competitor`, `blue_competitor` and `winner` (and `Round#toApiResponse`
 * does the same for `result.winner`). Over HTTP that is harmless:
 * `ServerController#_formatJSONBody` walks the body and calls
 * `.toApiResponse()`, which strips to `apiSafeKeys`. **The worker path does
 * not go through `_formatJSONBody`** — it hands the object straight to
 * socket.io, whose encoder calls Sequelize's `toJSON()` and emits every
 * `dataValue`. The result is that every `match.update`, `round.tech-fall` and
 * `break.ended` payload carries both competitors' `api_token`s, roughly once
 * per second, to anyone who can join the room.
 *
 * `api_token` is the sole credential (`x-api-token`), so this is account
 * takeover of both competitors by any viewer.
 *
 * This schema exists so the leak is described **narrowly** — only where it
 * actually occurs — rather than by weakening `userSchema`, which is used by
 * every HTTP response and by the request schemas. Weakening the canonical
 * shape would let a future HTTP response leak the same fields without any
 * schema or typecheck noticing.
 *
 * **Task 18 fixes this** (serialize competitors via `toApiResponse()` in
 * `Match`/`Round`). When it does, this schema and its uses in
 * `websocket.ts` are deleted and the four `ws.*` goldens change — that diff
 * is the intended evidence of the fix.
 */
export const leakedUserSchema = userSchema.extend({
    api_token: z.string(),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
});
export type LeakedUser = z.infer<typeof leakedUserSchema>;
