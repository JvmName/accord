/**
 * Socket.IO, attached to the web process's `http.Server` so HTTP and
 * WebSocket share one port. Each match has a room, `match:<id>`.
 *
 * A connection is a client when its handshake `auth.apiToken` is present and
 * names a user, or the worker when its handshake query carries the server's
 * `workerToken`. Any other handshake is refused with a `connect_error`.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Server as HttpServer } from 'http';
import type { Server as IoServer, Socket } from 'socket.io';
import type { Logger } from 'pino';
import type { SocketEvent } from '../contract/websocket';
import { createLazyDb } from '../db';
import type { DbOrTx } from '../db/repositories/internal';
import type { SocketHost } from './abstractWebSocket';
import { SocketAuthError } from './abstractWebSocket';
import { WebSocket } from './webSocket';
import { WorkerWebSocket } from './workerWebSocket';

/* eslint-disable @typescript-eslint/no-require-imports */
const CONSTANTS                      = require('../../lib/constants');
const { logger }: { logger: Logger } = require('../../lib/logger');
// Required, not imported, so this is the same CommonJS module tests mock or spy on.
const { Server }: { Server: typeof IoServer } = require('socket.io');
/* eslint-enable @typescript-eslint/no-require-imports */

type Next = (err?: Error) => void;

/** Constant-time string comparison (hashing first makes the buffers equal length). */
function safeEqual(a: string, b: string): boolean {
    return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

export class WebSocketServer implements SocketHost {
    #corsOrigin: string[] | undefined;
    #httpServer: HttpServer | undefined;
    #db: DbOrTx | undefined;
    #workerToken: string | undefined;
    #_ioServer: IoServer | undefined;
    #workerSockets = new Set<string>();

    constructor(httpServer?: HttpServer, corsOrigin?: string[], db?: DbOrTx, workerToken?: string) {
        this.#httpServer  = httpServer;
        this.#corsOrigin  = corsOrigin;
        this.#db          = db;
        this.#workerToken = workerToken;
    }

    listen(): void {
        this.on('connection', this.#handleWebSocketConnection);
    }

    close(): void {
        this.#_ioServer?.close();
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
        return this.#_ioServer ?? this.#initializeIoServer();
    }

    #initializeIoServer(): IoServer {
        const server = this.#_ioServer = new Server(this.#httpServer, {
            cors: { origin: this.#corsOrigin, credentials: true },
        });

        server.use(this._initWebSocket.bind(this));
        return server;
    }

    async _initWebSocket(ioSocket: Socket, next: Next): Promise<void> {
        const apiToken    = ioSocket.handshake.auth?.apiToken;
        const workerToken = ioSocket.handshake.query?.workerToken;
        let socket: WebSocket | WorkerWebSocket;
        let type: 'client' | 'worker';

        if (apiToken) {
            socket = new WebSocket(ioSocket, this);
            type   = 'client';
        } else if (workerToken && this.#isWorkerToken(workerToken)) {
            socket = new WorkerWebSocket(ioSocket, this);
            type   = 'worker';
        } else {
            logger.warn(`WebSocket refused: no valid token (${ioSocket.id})`);
            return next(new SocketAuthError());
        }

        try {
            await socket.init();
            logger.info(`WebSocket initialized as ${type} (${ioSocket.id})`);
            if (type === 'worker') this.#trackWorker(ioSocket);
            next();
        } catch (err) {
            if (err instanceof SocketAuthError) {
                logger.warn(`WebSocket refused: unknown api token (${ioSocket.id})`);
            } else if (CONSTANTS.ENV != 'test') {
                logger.error(err);
            }
            return next(err as Error); // socket.io's `next` takes an Error; whatever was thrown is passed on
        }
    }

    #trackWorker(ioSocket: Socket): void {
        this.#workerSockets.add(ioSocket.id);
        ioSocket.on('disconnect', () => this.#workerSockets.delete(ioSocket.id));
    }

    /** Whether any socket of the worker process is connected. */
    hasWorker(): boolean {
        return this.#workerSockets.size > 0;
    }

    #isWorkerToken(token: unknown): boolean {
        return typeof token === 'string' && this.#workerToken !== undefined && safeEqual(token, this.#workerToken);
    }

    numClientsInRoom(room: string): number {
        const clients = this.#ioServer.sockets.adapter.rooms.get(room);
        return clients ? clients.size : 0;
    }
}
