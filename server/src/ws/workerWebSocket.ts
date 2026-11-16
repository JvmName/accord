/**
 * The worker process's socket. Every real-time event reaches clients through
 * here: the worker emits a match payload, and this relays it unchanged to that
 * match's room.
 */
import type { Logger } from 'pino';
import type { SocketEvent } from '../contract/websocket';
import { AbstractWebSocket } from './abstractWebSocket';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger }: { logger: Logger } = require('../../lib/logger');

export const EVENTS = {
    TECH_FALL:    'round.tech-fall',
    MATCH_UPDATE: 'match.update',
    BREAK_ENDED:  'break.ended',
} as const satisfies Record<string, SocketEvent>;

/** The relayed payload: whatever the worker sent, routed by its `id`. */
interface RelayedMatch {
    id: unknown;
}

export class WorkerWebSocket extends AbstractWebSocket {
    addEventHandlers(): void {
        this.on(EVENTS.TECH_FALL, (match: RelayedMatch) => {
            const room = this.roomForMatch(match.id);
            logger.info(`Emitting round.tech-fall to room match:${match.id}`);
            this.emitToRoom(room, EVENTS.TECH_FALL, match);
        });
        this.on(EVENTS.MATCH_UPDATE, (match: RelayedMatch) => {
            const room = this.roomForMatch(match.id);
            logger.debug(`Emitting match.update to room match:${match.id}`);
            this.emitToRoom(room, EVENTS.MATCH_UPDATE, match);
        });
        this.on(EVENTS.BREAK_ENDED, (match: RelayedMatch) => {
            const room = this.roomForMatch(match.id);
            logger.info(`Emitting break.ended to room match:${match.id}`);
            this.emitToRoom(room, EVENTS.BREAK_ENDED, match);
        });
    }
}
