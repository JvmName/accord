/**
 * WebSocket payloads.
 *
 * All three server→client events carry a **bare Match — no envelope**. The
 * worker process renders the payload and `notifyServer()` hands it straight
 * to socket.io, so the payload is the same safe match shape the HTTP routes
 * render (`matchSchema`): competitors are `{ id, name }`, never `api_token`.
 *
 * `SocketClient.kt`'s `observeMatch()` subscribes to exactly these three.
 */
import { z } from 'zod';
import { matchSchema } from './match';

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
export const matchUpdatePayloadSchema = matchSchema;

/** Fired once when the tech-fall threshold is reached and the round is ended. */
export const roundTechFallPayloadSchema = matchSchema;

/** Fired once when a break expires and the next round has been auto-started. */
export const breakEndedPayloadSchema = matchSchema;

/** Event name → payload schema. */
export const socketPayloads = {
    'match.update': matchUpdatePayloadSchema,
    'round.tech-fall': roundTechFallPayloadSchema,
    'break.ended': breakEndedPayloadSchema,
} as const;
