/**
 * Request bodies.
 *
 * Unlike the response schemas, these are deliberately **not** `strictObject`.
 * `ServerController#validateParameters` only inspects the keys it is told
 * about and silently ignores everything else, so a strict schema here would
 * reject bodies the server accepts today — a behavior change, which tasks
 * 01-17 may not make. Task 12 consumes these for route validation.
 *
 * Each schema describes what the server ACTUALLY enforces, which is in
 * several places narrower or wider than `models.kt` and than
 * `server/README.md`. Divergences are called out per field.
 */
import { z } from 'zod';
import { competitorColorSchema, idSchema } from './scalars';

/** `POST /users` — `usersController.js:18`. */
export const createUserRequestSchema = z.object({
    name: z.string(),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/**
 * `POST /mats` — `matsController.js:43`.
 *
 * `judge_count` is **optional**: only `name` is `required: true`, and
 * `http.mats.create.missingName.400` errors on `name` alone. `models.kt`'s
 * `CreateMatRequest` still declares `judgeCount: Int` as non-null, which is a
 * client-side over-constraint, not a server requirement.
 */
export const createMatRequestSchema = z.object({
    name: z.string(),
    judge_count: z.number().int().optional(),
});
export type CreateMatRequest = z.infer<typeof createMatRequestSchema>;

/**
 * `POST /mat/:matCode/join` — `mat/usersController.js:126`.
 *
 * `name` is optional: an anonymous join with an empty body is valid and the
 * server falls back to the literal name `'Anonymous'`
 * (`http.mat.join.viewerCode.noName.anonymous` posts `{}`). `models.kt`'s
 * `JoinMatRequest` declares `name` non-null, which again over-constrains the
 * client only. The body is ignored entirely when the caller is already
 * authenticated.
 */
export const joinMatRequestSchema = z.object({
    name: z.string().optional(),
});
export type JoinMatRequest = z.infer<typeof joinMatRequestSchema>;

/**
 * A competitor in `POST /mat/:matCode/matches`: an existing user by `id`, or
 * a new one by `name`. `MatchesController#validateCreation` requires at least
 * one of the two and errors on BOTH sub-keys when neither is given
 * (`http.matches.create.missingCompetitors.400`).
 */
export const competitorRequestSchema = z
    .object({
        id: idSchema.optional(),
        name: z.string().optional(),
    })
    .refine(value => value.id !== undefined || value.name !== undefined, {
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
 * `PATCH /match/:matchId/rounds/result` — `match/roundsController.js:37`.
 *
 * ⚠️ **F-24: `winner` is `.optional()`, NOT `.nullable()`.** The server
 * validates `isEnum: { enums: [undefined, 'red', 'blue'] }` and
 * `validateIsEnum` does `enums.includes(value)`, so an explicit
 * `{"winner": null}` is REJECTED with
 * `400 {"winner":["must be one of [red, blue]"]}`
 * (`http.rounds.result.explicitNull.400`). Only an OMITTED key clears a
 * declared result (`http.rounds.result.clear`, which posts
 * `{"stoppage": false}`).
 *
 * `CLAUDE.md` item 12 and `server/README.md` both document the body as
 * `{ winner: "red"|"blue"|null, … }`, which is wrong. The Kotlin client
 * escapes by accident: `EndRoundRequest.winner` defaults to `null` and its
 * `Json {}` leaves `encodeDefaults = false`, so the null is omitted rather
 * than serialised. Modelling `winner` as nullable here would encode a request
 * shape the server itself rejects. Task 18 decides whether to start accepting
 * `null`.
 *
 * `stoppage` is not validated by the server at all — any value is accepted
 * and read for truthiness. Typed as an optional boolean to match
 * `models.kt`'s `stoppage: Boolean? = null`.
 */
export const endRoundRequestSchema = z.object({
    winner: competitorColorSchema.optional(),
    stoppage: z.boolean().optional(),
});
export type EndRoundRequest = z.infer<typeof endRoundRequestSchema>;

/**
 * `POST /match/:matchId/ridingTime` — `match/ridingTimeVoteController.js:128`.
 * Required; anything else yields `400 {"rider":["must be one of [red, blue]"]}`.
 */
export const startRidingTimeVoteRequestSchema = z.object({
    rider: competitorColorSchema,
});
export type StartRidingTimeVoteRequest = z.infer<typeof startRidingTimeVoteRequestSchema>;
