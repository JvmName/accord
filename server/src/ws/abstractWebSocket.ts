/**
 * Behavior shared by the two kinds of socket the server accepts: a client
 * (`WebSocket`, authenticated by API token) and the worker process
 * (`WorkerWebSocket`).
 */
import { present } from '../domain/present';
import type { Socket } from 'socket.io';
import type { Adapter } from 'socket.io-adapter';
import type { Logger } from 'pino';
import type { DbOrTx } from '../db/repositories/internal';
import type { SocketEvent } from '../contract/websocket';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger }: { logger: Logger } = require('../../lib/logger');

/** What a socket needs from the server that accepted it. */
export interface SocketHost {
    emit(room: string, eventName: SocketEvent, eventData: unknown): void;
    readonly db: DbOrTx;
}

export type SocketEventHandler = (...args: any[]) => unknown;

/** A handshake the server refuses; the client sees `connect_error` with this message. */
export class SocketAuthError extends Error {
    constructor() {
        super('unauthorized');
        this.name = 'SocketAuthError';
    }
}

export class AbstractWebSocket {
    #ioSocket: Socket;
    #server: SocketHost;

    constructor(ioSocket: Socket, server: SocketHost) {
        this.#ioSocket = ioSocket;
        this.#server   = server;
    }

    async init(): Promise<void> {
        this.resetSocket();

        this.on('disconnect', ()             => { logger.info(`Web socket disconnected (${this.id})`) });

        // The adapter belongs to the namespace, not to this socket: these
        // replace the listeners every previously initialized socket added
        // (resetSocket clears them), so only the newest socket logs room changes.
        this.#adapter.on('join-room',  this.#handleRoomJoined.bind(this));
        this.#adapter.on('leave-room', this.#handleRoomLeft.bind(this));

        this.addEventHandlers();
    }

    close(): void {
        this.#ioSocket.disconnect();
    }

    resetSocket(): void {
        for (const eventName of this.#ioSocket.eventNames()) {
            this.#ioSocket.removeAllListeners(eventName);
        }
        for (const eventName of this.#adapter.eventNames()) {
            this.#adapter.removeAllListeners(eventName);
        }
    }

    addEventHandlers(): void {}

    /**
     * Registers a socket event handler. socket.io does not await handlers, so
     * a throw or rejection would be an unhandled rejection that ends the
     * process; it is logged and dropped instead.
     */
    on(eventName: string, eventHandler: SocketEventHandler): void {
        const handler = eventHandler.bind(this);
        this.#ioSocket.on(eventName, async (...args: unknown[]) => {
            try {
                await handler(...args);
            } catch (err) {
                logger.error(`Socket handler for ${eventName} failed (${this.id}): ${err instanceof Error ? err.message : String(err)}`);
            }
        });
    }

    emitToRoom(room: string, eventName: SocketEvent, eventData: unknown): void {
        this.#server.emit(room, eventName, eventData);
    }

    join(room: string): void {
        this.#ioSocket.join(room);
    }

    leave(room: string): void {
        this.#ioSocket.leave(room);
    }

    #handleRoomJoined(room: string, id: string): void {
        if (this.id == room) return;

        const numConnections = present(this.#adapter.rooms.get(room), `room ${room}`).size; // socket.io emits join/leave before it drops an empty room
        logger.info(`Web socket joined room ${room}.${numConnections} - (${id})`);
    }

    #handleRoomLeft(room: string, id: string): void {
        if (this.id == room) return;
        const numConnections = present(this.#adapter.rooms.get(room), `room ${room}`).size; // socket.io emits join/leave before it drops an empty room
        logger.info(`Web socket left room ${room}.${numConnections} - (${id})`);
    }

    /** The namespace's adapter, which socket.io's types keep private on the socket. */
    get #adapter(): Adapter {
        return (this.#ioSocket as unknown as { adapter: Adapter }).adapter;
    }

    roomForMatch(matchId: unknown): string {
        return `match:${matchId}`;
    }

    /** Client-supplied: any JSON value, or absent. */
    get apiToken(): unknown { return this.#ioSocket.handshake.auth?.apiToken; }
    get id(): string        { return this.#ioSocket.id; }
    get db(): DbOrTx        { return this.#server.db; }
}
