/**
 * The web process: Express with the global middleware, every route from the
 * route table, and Socket.IO attached to the same `http.Server`.
 */
import { randomUUID } from 'crypto';
import { Server } from 'http';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import pinoHttp from 'pino-http';
import responseTime from 'response-time';
import { createLazyDb, type Db } from '../db';
import { assertImplemented, registerRoutes } from './router';
import { routes } from './routes';
import { generatedOpenApiDocument } from './routes/system';

/* eslint-disable @typescript-eslint/no-require-imports */
const CONSTANTS           = require('../../lib/constants');
const { logger }          = require('../../lib/logger');
const { WebSocketServer } = require('../../lib/server/webSocketServer');
/* eslint-enable @typescript-eslint/no-require-imports */

/** Set to `0` to turn the DEV OpenAPI validator off, or `1` to turn it on outside development (tests). */
export const OPENAPI_VALIDATION_ENV = 'ACCORD_OPENAPI_VALIDATION';

export interface ApplicationServerOptions {
    port?: number | string;
    /** The database every route runs against. Defaults to the configured file, opened on the first query. */
    db?: Db;
    /** Shared with the worker process so it can identify itself on the socket. Defaults to a random UUID. */
    workerToken?: string;
    /** Serve the docs routes and log 500s. Defaults to `NODE_ENV=development`. */
    dev?: boolean;
    /** Validate requests and responses against the generated OpenAPI document. Never on in production. */
    openApiValidation?: boolean;
}

/**
 * Whether the OpenAPI validator runs: never in production; otherwise the
 * option, else the environment switch, else only in development.
 */
export function openApiValidationEnabled(option: boolean | undefined, dev: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
    if (CONSTANTS.ENV === 'production') return false;
    if (option !== undefined) return option;
    if (env[OPENAPI_VALIDATION_ENV] === '0') return false;
    if (env[OPENAPI_VALIDATION_ENV] === '1') return true;
    return dev;
}

export class ApplicationServer {
    readonly #app: Express;
    readonly #httpServer: Server;
    readonly #port: number | string;
    readonly #dev: boolean;
    readonly #openApiValidation: boolean;
    #db: Db | undefined;
    #workerToken: string | undefined;
    #webSocketServer: { listen(): void } | undefined;
    #routesMounted = false;

    constructor({ port, db, workerToken, dev, openApiValidation }: ApplicationServerOptions = {}) {
        this.#port              = port || process.env.PORT || 3000;
        this.#db                = db;
        this.#workerToken       = workerToken;
        this.#dev               = dev ?? CONSTANTS.DEV;
        this.#openApiValidation = openApiValidationEnabled(openApiValidation, this.#dev);
        this.#app               = express();
        // Socket.IO attaches to this server, so HTTP and WebSocket share one port.
        this.#httpServer        = new Server(this.#app);
        this.setupMiddleware();
    }

    async listen(): Promise<void> {
        this.mountRoutes();
        this.startWebSocketServer();

        this.#httpServer.on('error', this.onError.bind(this));
        this.#httpServer.listen(this.#port, () => {
            const { address, port } = this.#httpServer.address() as { address: string; port: number };
            logger.info(`Server is running on ${address}:${port}`);
        });
    }

    close(): void {
        this.#httpServer.close();
        this.#httpServer.closeAllConnections();
    }

    get port()              { return this.#port; }
    get logger()            { return logger; }
    get dev()               { return this.#dev; }
    get openApiValidation() { return this.#openApiValidation; }
    get expressApp()        { return this.#app; }
    get httpServer()        { return this.#httpServer; }

    onError(error: NodeJS.ErrnoException): void {
        if (error.syscall !== 'listen') {
            throw error;
        }

        switch (error.code) {
            case 'EACCES':
                logger.error('Port requires elevated privileges');
                process.exit(1);
                break;
            case 'EADDRINUSE':
                logger.error('Port is already in use');
                process.exit(1);
                break;
            default:
                throw error;
        }
    }

    /** The database the routes use: the injected one, else the configured file, opened on the first query. */
    get db(): Db {
        this.#db ??= createLazyDb();
        return this.#db;
    }

    get workerToken(): string {
        this.#workerToken ??= randomUUID();
        return this.#workerToken;
    }

    get corsOrigin(): string[] {
        const origins = ['http://localhost:8080'];
        if (process.env.WEB_ORIGIN) {
            origins.push(process.env.WEB_ORIGIN);
        }
        return origins;
    }

    startWebSocketServer(): void {
        if (this.#webSocketServer) return;
        this.#webSocketServer = new WebSocketServer(this.#httpServer, this.corsOrigin);
        this.#webSocketServer!.listen();
    }

    /**
     * Registers the OpenAPI validator (when enabled) and then every route, once.
     * Refuses to start if a route still has a placeholder handler.
     */
    mountRoutes(): void {
        if (this.#routesMounted) return;
        assertImplemented(routes);
        this.#routesMounted = true;

        if (this.#openApiValidation) this.use(...openApiValidatorMiddleware());
        registerRoutes(this.#app, routes, { db: this.db, dev: this.#dev, logger });
    }

    setupMiddleware(): void {
        this.use(cors({ origin: this.corsOrigin, credentials: true }));
        // AWS sends `text/plain` for its notifications, so that is parsed as JSON too.
        this.use(express.json({ type: ['application/json', 'text/plain'] }));
        this.use(express.urlencoded({ extended: true }));
        this.use(responseTime());
        this.use(express.static('public'));
        this.use(loggingMiddleware());
        this.use('/static', express.static(`${process.cwd()}/public`));
        this.use(connectionAbortedMiddleware);
    }

    /** `app.use()`, for middleware that must sit in front of the routes. */
    use(...handlers: unknown[]): void {
        (this.#app.use as (...args: unknown[]) => Express).apply(this.#app, handlers);
    }
}

function loggingMiddleware(): RequestHandler {
    return pinoHttp({
        logger,
        // pino-http passes (req, res, err), so this reads the REQUEST's
        // statusCode, which is always null: every request logs at info. Kept
        // as it has always behaved.
        customLogLevel: req => {
            const statusCode = (req as { statusCode?: number | null }).statusCode;
            if (statusCode >= 500) return 'error';
            if (statusCode >= 400) return 'warn';
            return 'info';
        },
        serializers: {
            req: req => `Request: ${req.method} ${req.url}`,
            res: res => `statusCode=${res.statusCode}, responseTime=${res.get('X-Response-Time')}`,
        },
        wrapSerializers: false,
    }) as RequestHandler;
}

/** A client that hangs up mid-request gets an empty 400 instead of an error log. */
const connectionAbortedMiddleware: ErrorRequestHandler = async function (err, _req, res, next) {
    if (err && err.code === 'ECONNABORTED') {
        return res.status(400).end();
    }
    next();
};

/**
 * Request and response validation against the generated OpenAPI document.
 * Paths the document does not describe (the docs pages, unknown URLs) are
 * left alone.
 */
function openApiValidatorMiddleware(): RequestHandler[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OpenApiValidator = require('express-openapi-validator');
    return OpenApiValidator.middleware({
        // The validator rewrites the document it is given; /docs.json keeps the original.
        apiSpec:            structuredClone(generatedOpenApiDocument()),
        // Every route ignores query parameters it does not read, so the
        // validator must not reject them either.
        validateRequests:   { allowUnknownQueryParameters: true },
        validateResponses:  true,
        ignoreUndocumented: true,
    });
}
