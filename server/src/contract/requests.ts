/**
 * Request bodies, as documented in OpenAPI. They match what the routes
 * validate at runtime (`src/http/routes/requests.ts`, which adds the error
 * messages). Unknown keys are ignored, not rejected, so these are not
 * `strictObject`.
 */
import { z } from 'zod';
import { competitorColorSchema, nullableRef } from './scalars';

const uuid = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

/** `POST /users`. */
export const createUserRequestSchema = z.object({
    name: z.string().min(1),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/** `POST /mats`. `judge_count` is optional and defaults to 1. */
export const createMatRequestSchema = z.object({
    name: z.string().min(1),
    judge_count: z.number().int().min(1).optional(),
});
export type CreateMatRequest = z.infer<typeof createMatRequestSchema>;

/**
 * `POST /mat/:matCode/join`. `name` is optional: a blank or missing name
 * joins as `Anonymous`. The body is ignored when the caller is already
 * authenticated.
 */
export const joinMatRequestSchema = z.object({
    name: z.string().optional(),
});
export type JoinMatRequest = z.infer<typeof joinMatRequestSchema>;

/**
 * A competitor in `POST /mat/:matCode/matches`: an existing user by `id`, or
 * a new one by `name`; at least one is required.
 */
export const competitorRequestSchema = z
    .object({
        id: uuid.optional(),
        name: z.string().optional(),
    })
    .refine(value => Boolean(value.id || value.name), {
        message: 'id or name required',
    });
export type CompetitorRequest = z.infer<typeof competitorRequestSchema>;

/** `POST /mat/:matCode/matches`. */
export const createMatchRequestSchema = z.object({
    red: competitorRequestSchema,
    blue: competitorRequestSchema,
});
export type CreateMatchRequest = z.infer<typeof createMatchRequestSchema>;

/**
 * `PATCH /match/:matchId/rounds/result`. An omitted or `null` `winner` clears
 * the result. (The Kotlin client omits it: `encodeDefaults` is off.)
 */
export const endRoundRequestSchema = z.object({
    winner: nullableRef(competitorColorSchema).optional(),
    stoppage: z.boolean().optional(),
});
export type EndRoundRequest = z.infer<typeof endRoundRequestSchema>;

/** `POST /match/:matchId/ridingTime`. */
export const startRidingTimeVoteRequestSchema = z.object({
    rider: competitorColorSchema,
});
export type StartRidingTimeVoteRequest = z.infer<typeof startRidingTimeVoteRequestSchema>;
