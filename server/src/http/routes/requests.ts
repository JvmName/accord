/**
 * RUNTIME request schemas of the route registry.
 *
 * Each route validates its path parameters, query and body separately, against
 * the exact JSON types it accepts; the contract schemas in
 * `src/contract/requests.ts` document the same shapes for OpenAPI. A failure
 * is reported as `{ "<dotted.path>": ["<message>"] }` (the shape
 * `ApiResult.Error(Map<String, List<String>>)` decodes), by
 * `middleware/validate.ts`.
 *
 * | route                              | body / query                                                         |
 * |------------------------------------|----------------------------------------------------------------------|
 * | POST /users                        | `name`: non-empty string                                             |
 * | POST /mats                         | `name`: non-empty string; `judge_count`: integer >= 1, optional (1)   |
 * | POST /mat/:matCode/join            | `name`: string, optional (blank or missing joins as `Anonymous`)     |
 * | POST /mat/:matCode/matches         | `red`, `blue`: `{ id?: UUID string, name?: string }`, one of the two  |
 * | PATCH /match/:matchId/rounds/result| `winner`: `red` \| `blue` \| null, optional; `stoppage`: boolean, optional |
 * | POST /match/:matchId/ridingTime    | `rider`: `red` \| `blue`                                             |
 * | DELETE /match/:matchId/ridingTime  | `rider` is accepted and ignored (installed clients send it, F-55)    |
 *
 * Messages: a missing or empty required value is `required`; a value of the
 * wrong type says what it should be.
 */
import { z } from 'zod';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** A non-empty string. Missing or empty is `required`; any other type is `must be a string`. */
function requiredString() {
    return z
        .string({ error: issue => (issue.input === undefined ? 'required' : 'must be a string') })
        .min(1, { error: 'required' });
}

/** `red` | `blue`. Missing, `null` and anything else fail with the same message. */
function colorEnum() {
    return z.enum(['red', 'blue'], { error: 'must be one of [red, blue]' });
}

// ---------------------------------------------------------------------------
// Path parameters. Express always yields strings for these.
// ---------------------------------------------------------------------------

export const matIdParams    = z.object({ matId: z.string() });
export const matCodeParams  = z.object({ matCode: z.string() });
export const matchIdParams  = z.object({ matchId: z.string() });

// ---------------------------------------------------------------------------
// Bodies / queries.
// ---------------------------------------------------------------------------

/** `POST /users`. */
export const createUserBody = z.object({
    name: requiredString(),
});

const JUDGE_COUNT_MESSAGE = 'must be an integer greater than or equal to 1';

/** `POST /mats`. */
export const createMatBody = z.object({
    name:        requiredString(),
    judge_count: z
        .number({ error: JUDGE_COUNT_MESSAGE })
        .int({ error: JUDGE_COUNT_MESSAGE })
        .min(1, { error: JUDGE_COUNT_MESSAGE })
        .optional(),
});

/** `POST /mat/:matCode/join`. A blank or missing `name` falls back to `'Anonymous'` in the handler. */
export const joinMatBody = z.object({
    name: z.string({ error: 'must be a string' }).optional(),
});

/** A competitor in `POST /mat/:matCode/matches`: an existing user by `id`, or a new one by `name`. */
export interface Competitor {
    id?: string;
    name?: string;
}

const competitor = z
    .object({
        id:   z.string({ error: 'must be a UUID' }).regex(UUID, { error: 'must be a UUID' }).optional(),
        name: z.string({ error: 'must be a string' }).optional(),
    }, { error: issue => (issue.input === undefined ? 'required' : 'must be an object') })
    .refine(value => Boolean(value.id || value.name), { error: 'id or name required' });

/** `POST /mat/:matCode/matches`. */
export const createMatchBody = z.object({
    red:  competitor,
    blue: competitor,
});

/**
 * `PATCH /match/:matchId/rounds/result`. An omitted or `null` `winner` clears
 * the result.
 */
export const roundResultBody = z.object({
    winner:   colorEnum().nullable().optional(),
    stoppage: z.boolean({ error: 'must be a boolean' }).optional(),
});

/** `POST /match/:matchId/ridingTime`. */
export const startRidingTimeBody = z.object({
    rider: colorEnum(),
});

/** `DELETE /match/:matchId/ridingTime`. `rider` is read by nothing; it must keep being accepted. */
export const endRidingTimeQuery = z.object({
    rider: z.unknown().optional(),
});
