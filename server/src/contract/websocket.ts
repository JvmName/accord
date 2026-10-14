/**
 * WebSocket payloads.
 *
 * All three server→client events carry a **bare Match — no envelope**. The
 * worker process renders the payload and `notifyServer()` hands it straight
 * to socket.io, bypassing `ServerController#_formatJSONBody` entirely; that
 * bypass is also the cause of the F-22 `api_token` leak, so every payload
 * here uses `leakedMatchSchema`. See `user.ts`.
 *
 * `SocketClient.kt`'s `observeMatch()` subscribes to exactly these three.
 */
import { z } from 'zod';
import { leakedMatchSchema } from './match';

/**
 * The event names. Exported as a literal union so a typo'd event name is a
 * compile error once task 14 ports the worker/WebSocket tier.
 */
export const socketEventSchema = z.enum([
    'match.update',
    'round.tech-fall',
    'break.ended',
]);
export type SocketEvent = z.infer<typeof socketEventSchema>;

/** Periodic score/state updates while a round is open or a break is running. */
export const matchUpdatePayloadSchema = leakedMatchSchema;

/** Fired once when the tech-fall threshold is reached and the round is ended. */
export const roundTechFallPayloadSchema = leakedMatchSchema;

/** Fired once when a break expires and the next round has been auto-started. */
export const breakEndedPayloadSchema = leakedMatchSchema;

/** Event name → payload schema. */
export const socketPayloads = {
    'match.update': matchUpdatePayloadSchema,
    'round.tech-fall': roundTechFallPayloadSchema,
    'break.ended': breakEndedPayloadSchema,
} as const;
