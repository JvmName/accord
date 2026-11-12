/**
 * `User` — `models.kt:47`.
 */
import { z } from 'zod';
import { idSchema } from './scalars';

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

