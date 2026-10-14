/**
 * Socket.IO, attached to the web process's `http.Server` so HTTP and
 * WebSocket share one port. Each match has a room, `match:<id>`.
 *
 * A connection is a client when its handshake `auth.apiToken` is truthy,
 * otherwise the worker when its handshake query carries a truthy
 * `workerToken`. The worker token is not compared with anything.
 */
import type { Server as HttpServer } from 'http';
import type { Server as IoServer, Socket } from 'socket.io';
import type { Logger } from 'pino';
import type { SocketEvent } from '../contract/websocket';
import { createLazyDb } from '../db';
import type { DbOrTx } from '../db/repositories/internal';
import type { SocketHost } from './abstractWebSocket';
import { WebSocket } from './webSocket';
import { WorkerWebSocket } from './workerWebSocket';

/* eslint-disable @typescript-eslint/no-require-imports */
const CONSTANTS                      = require('../../lib/constants');
const { logger }: { logger: Logger } = require('../../lib/logger');
// Required, not imported, so this is the same CommonJS module tests mock or spy on.
const { Server }: { Server: typeof IoServer } = require('socket.io');
/* eslint-enable @typescript-eslint/no-require-imports */

type Next = (err?: Error) => void;

export class WebSocketServer implements SocketHost {
    #corsOrigin: string[] | undefined;
    #httpServer: HttpServer | undefined;
    #db: DbOrTx | undefined;
    #_ioServer: IoServer | undefined;

    constructor(httpServer?: HttpServer, corsOrigin?: string[], db?: DbOrTx) {
        this.#httpServer = httpServer;
        this.#corsOrigin = corsOrigin;
        this.#db         = db;
    }

    listen(): void {
        this.on('connection', this.#handleWebSocketConnection);
    }

    close(): void {
        this.#_ioServer.close();
    }

    #handleWebSocketConnection(ioSocket: Socket): void {
        logger.info(`Web socket connected (${ioSocket.id})`);
    }

    emit(room: string, eventName: SocketEvent, eventData: unknown): void {
        this.#ioServer.to(room).emit(eventName, eventData);
    }

    on(eventName: string, eventHandler: (...args: any[]) => unknown): void {
        this.#ioServer.on(eventName, eventHandler.bind(this));
    }

    /** The database the client sockets look users and matches up in. */
    get db(): DbOrTx {
        this.#db ??= createLazyDb();
        return this.#db;
    }

    get #ioServer(): IoServer {
        if (!this.#_ioServer) this.#initializeIoServer();
        return this.#_ioServer;
    }

    #initializeIoServer(): void {
        this.#_ioServer = new Server(this.#httpServer, {
            cors: { origin: this.#corsOrigin, credentials: true },
        });

        this.#_ioServer.use(this._initWebSocket.bind(this));
    }

    async _initWebSocket(ioSocket: Socket, next: Next): Promise<void> {
        const auth  = ioSocket.handshake.auth;
        const query = ioSocket.handshake.query;
        let socket: WebSocket | WorkerWebSocket;

        if (auth?.apiToken) {
            socket = new WebSocket(ioSocket, this);
        } else if (query?.workerToken) {
            socket = new WorkerWebSocket(ioSocket, this);
        } else {
            logger.warn(`WebSocket rejected: no token (${ioSocket.id})`);
            // Not connected yet, so this does not stop the connection.
            ioSocket.disconnect();
            return next();
        }

        try {
            await socket.init();
            const type = auth?.apiToken ? 'client' : 'worker';
            logger.info(`WebSocket initialized as ${type} (${ioSocket.id})`);
            next();
        } catch (err) {
            if (CONSTANTS.ENV != 'test') logger.error(err);
            return next(err);
        }
    }

    numClientsInRoom(room: string): number {
        const clients = this.#ioServer.sockets.adapter.rooms.get(room);
        return clients ? clients.size : 0;
    }
}
