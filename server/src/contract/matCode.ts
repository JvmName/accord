/**
 * `MatCode` / `Role` — `models.kt:69` and `models.kt:74`.
 */
import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'viewer']);
export type Role = z.infer<typeof roleSchema>;

/**
 * Word-triple invite code plus the role it grants.
 *
 * `codes` is rendered ONLY by `POST /mats` (which passes
 * `{includeCodes: true}`); it is absent from every other mat payload,
 * including a plain `GET /mat/:matId`. See `mat.ts`.
 */
export const matCodeSchema = z.strictObject({
    code: z.string(),
    role: roleSchema,
});
export type MatCode = z.infer<typeof matCodeSchema>;
