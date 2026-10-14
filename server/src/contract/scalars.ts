/**
 * Shared leaf types for the wire contract.
 */
import { z } from 'zod';

/**
 * Every id on the wire is a UUID string in production. It is modelled as a
 * plain string, not `z.uuid()`, for two reasons:
 *   - the task-04 goldens normalise ids to stable placeholders
 *     (`<uuid:1>`, `<user:creator>`, `<match:break>`) so the captures are
 *     diffable, and a uuid-format schema would reject every golden; and
 *   - `MatCode.code` is a word triple (`morning.coffee.bicycle`) and mat
 *     routes accept either form in the same `:matId` position.
 * Format validation belongs to the route layer (task 12), not the wire shape.
 */
export const idSchema = z.string();

/**
 * Timestamps are ISO 8601 with milliseconds and a `Z` offset — the output of
 * `Date.toISOString()`, which is what `ServerController#_formatJSONBody`
 * produces. The Kotlin client decodes these to `kotlin.time.Instant`.
 */
export const isoDateTimeSchema = z.iso.datetime();

/** `CompetitorColor` in `models.kt`. */
export const competitorColorSchema = z.enum(['red', 'blue']);
export type CompetitorColor = z.infer<typeof competitorColorSchema>;

/**
 * `schema | null` for a schema that is registered as an OpenAPI component
 * (`Match.winner`, `Round.result.winner`, ...).
 *
 * Use this instead of `.nullable()` on such schemas. zod-to-openapi 9.1.0
 * emits `registered.nullable()` as `allOf: [{ $ref }, { type: ['object', 'null'] }]`,
 * and `allOf` needs both branches, so the referenced object rejects `null`.
 * A union emits `anyOf: [{ $ref }, { type: 'null' }]`, which is correct. The
 * Zod-side behaviour is identical, so the wire shape is unchanged.
 *
 * Upstream: https://github.com/asteasolutions/zod-to-openapi/pull/387 and
 * https://github.com/asteasolutions/zod-to-openapi/issues/248. Remove this
 * helper (back to `.nullable()`) once a release containing the fix is adopted.
 */
export const nullableRef = <T extends z.ZodType>(schema: T) => z.union([schema, z.null()]);
