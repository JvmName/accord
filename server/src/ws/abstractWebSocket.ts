/**
 * Behavior shared by the two kinds of socket the server accepts: a client
 * (`WebSocket`, authenticated by API token) and the worker process
 * (`WorkerWebSocket`).
 */
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
        this.on('room.join',  (room: string) => { this.join(room)  });
        this.on('room.leave', (room: string) => { this.leave(room) });

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

    on(eventName: string, eventHandler: SocketEventHandler): void {
        this.#ioSocket.on(eventName, eventHandler.bind(this));
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

        const numConnections = this.#adapter.rooms.get(room).size;
        logger.info(`Web socket joined room ${room}.${numConnections} - (${id})`);
    }

    #handleRoomLeft(room: string, id: string): void {
        if (this.id == room) return;
        const numConnections = this.#adapter.rooms.get(room).size;
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
