/**
 * Response payloads, and the route → response-schema table.
 *
 * The payload schemas describe the `data` member of the success envelope;
 * `routeResponses` maps each route to the full envelope, so a caller (the
 * golden test today, the typed route registry in task 12) can look up the
 * exact shape a route produces.
 *
 * Route keys are written exactly as `artifacts/route-table.txt` and the
 * task-04 goldens spell them (`METHOD /path/{param}`).
 */
import { z } from 'zod';
import { envelope } from './envelope';
import { matSchema } from './mat';
import { matchSchema } from './match';
import { userSchema } from './user';

/** `POST /users` — the only endpoint that hands out a raw api token. */
export const createUserResponseSchema = z.strictObject({
    user: userSchema,
    api_token: z.string(),
});

/** `{ mat }` — mat creation, mat fetch, leaving a mat. */
export const matResponseSchema = z.strictObject({ mat: matSchema });

/** `{ match }` — every match, round and riding-time mutation and fetch. */
export const matchResponseSchema = z.strictObject({ match: matchSchema });

/** `POST /mat/:matCode/join` — `JoinMatResult` in `models.kt`. */
export const joinMatResponseSchema = z.strictObject({
    mat: matSchema,
    user: userSchema,
    api_token: z.string(),
});

export const judgesResponseSchema = z.strictObject({ judges: z.array(userSchema) });
export const viewersResponseSchema = z.strictObject({ viewers: z.array(userSchema) });

/** `GET /` renders a bare version-banner string inside the envelope. */
export const rootResponseSchema = z.string();

/** `GET /system/healthCheck` renders an empty object, not a null. */
export const healthCheckResponseSchema = z.strictObject({});

/**
 * Every route's SUCCESS envelope. Error responses are not route-specific —
 * they all use `errorEnvelopeSchema`.
 */
export const routeResponses = {
    'GET /': envelope(rootResponseSchema),
    'GET /system/healthCheck': envelope(healthCheckResponseSchema),

    'POST /users': envelope(createUserResponseSchema),

    'POST /mats': envelope(matResponseSchema),
    'GET /mat/{matId}': envelope(matResponseSchema),
    'POST /mat/{matCode}/join': envelope(joinMatResponseSchema),
    'DELETE /mat/{matCode}/join': envelope(matResponseSchema),
    'GET /mat/{matCode}/judges': envelope(judgesResponseSchema),
    'GET /mat/{matCode}/viewers': envelope(viewersResponseSchema),

    'POST /mat/{matCode}/matches': envelope(matchResponseSchema),
    'GET /match/{matchId}': envelope(matchResponseSchema),
    'POST /match/{matchId}/start': envelope(matchResponseSchema),
    'POST /match/{matchId}/end': envelope(matchResponseSchema),

    'POST /match/{matchId}/rounds': envelope(matchResponseSchema),
    'POST /match/{matchId}/rounds/end': envelope(matchResponseSchema),
    'PATCH /match/{matchId}/rounds/result': envelope(matchResponseSchema),
    'POST /match/{matchId}/rounds/pause': envelope(matchResponseSchema),
    'POST /match/{matchId}/rounds/resume': envelope(matchResponseSchema),

    'POST /match/{matchId}/ridingTime': envelope(matchResponseSchema),
    'DELETE /match/{matchId}/ridingTime': envelope(matchResponseSchema),
} as const;

export type RouteKey = keyof typeof routeResponses;
