/**
 * Route registration over Express 5 (server-ts task 12).
 *
 * `registerRoutes(app, routes, deps)` walks an EXPLICIT array of route
 * definitions (imported from `routes/index.ts`) and registers each one with a
 * fixed middleware chain:
 *
 *   resolve request state -> authorize gates -> validate -> handler -> route error handler
 *
 * No reflection: no `fs.readdirSync`, no prototype scanning, no
 * `this['_' + method]` string-keyed dispatch. The method is a typed union and
 * is dispatched with a `switch`. Registration order is the order of the array,
 * a declaration, which also resolves F-04 (bun's unsorted `readdirSync` made
 * legacy registration order, and so route precedence, filesystem-dependent).
 *
 * The running app mounts only the routes whose legacy controllers are listed
 * as ported (`mountPorted.ts`); the legacy autoloader serves the rest. Global
 * middleware (CORS, body parsers, logging, static files) stays the
 * application's job; `legacyBodyParsers()` exists so tests can mount the
 * registry with the same body parsing legacy has.
 */
import express, {
    type ErrorRequestHandler,
    type IRouter,
    type NextFunction,
    type Request,
    type RequestHandler,
    type Response,
} from 'express';
import type { DbOrTx } from '../db/repositories/internal';
import { Rendered, renderErrors, renderNotFound, renderUnauthorized, sendEnvelope, sendRendered } from './envelope';
import { assertCan, authorizeMiddleware } from './middleware/authorize';
import { errorMiddleware, type ErrorLogger } from './middleware/errors';
import { getRequestState, requestStateMiddleware } from './middleware/requestState';
import { getParsedRequest, validateMiddleware } from './middleware/validate';
import { repositoryLoaders, type Subject } from './permissions';
import type { AnyRouteDefinition, ContextHelpers } from './types';

export interface HttpDeps {
    /** The Drizzle database every repository call runs against. */
    db: DbOrTx;
    /** Register DEV-only routes (the docs routes) and log 400/500 errors, as legacy `CONSTANTS.DEV` did. */
    dev?: boolean;
    logger?: ErrorLogger;
}

/**
 * Builds the handler context and invokes the handler. A `Rendered` result is
 * sent as-is; any other result is the success payload. Legacy rendered
 * `responseBody || {}` when an action returned without rendering, so a falsy
 * result renders `{}`.
 */
function handlerMiddleware(route: AnyRouteDefinition, deps: HttpDeps) {
    const loaders = repositoryLoaders(deps.db);
    return async function invokeHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
        const state  = getRequestState(res);
        const parsed = getParsedRequest(res);

        const helpers: ContextHelpers = {
            db: deps.db,
            renderErrors,
            renderNotFound,
            renderUnauthorized,
            authorize: (action, scope, subject?: Subject) =>
                assertCan(subject ?? { user: state.currentUser, matCode: state.currentMatCode }, action, scope, loaders),
        };

        const ctx = {
            ...helpers,
            params:         parsed.params,
            query:          parsed.query,
            body:           parsed.body,
            currentUser:    state.currentUser,
            currentMat:     state.currentMat,
            currentMatCode: state.currentMatCode,
            currentMatch:   state.currentMatch,
            currentRound:   state.currentRound,
        };

        let result: unknown;
        try {
            // The ctx shape is guaranteed per route by the gates; the cast is the
            // one place the erased route type meets the concrete context.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = await route.handler(ctx as any);
        } catch (err) {
            next(err);
            return;
        }

        if (result instanceof Rendered) {
            sendRendered(res, result);
            return;
        }

        switch (route.render) {
            case 'envelope':
                sendEnvelope(res, 200, result || {});
                return;
            case 'json':
                // Legacy DocsController overrode formatJSONBody: the raw value, no envelope.
                res.json(result);
                return;
            case 'html':
                // Legacy ServerController#renderHtml.
                res.set('Content-Type', 'text/html');
                res.send(result);
                return;
        }
    };
}

/** The middleware chain of one route, in order. Exported for tests. */
export function routeChain(route: AnyRouteDefinition, deps: HttpDeps): Array<RequestHandler | ErrorRequestHandler> {
    return [
        requestStateMiddleware(deps.db, route.authorize),
        authorizeMiddleware(deps.db, route.authorize),
        validateMiddleware(route.request),
        handlerMiddleware(route, deps),
        errorMiddleware({ dev: deps.dev, logger: deps.logger }),
    ];
}

/**
 * Registers `routes` on `app` (an Express application or router), in array
 * order. DEV-only routes are skipped unless `deps.dev`.
 */
export function registerRoutes(app: IRouter, routes: readonly AnyRouteDefinition[], deps: HttpDeps): void {
    for (const route of routes) {
        if (route.devOnly && !deps.dev) continue;
        const chain = routeChain(route, deps);
        switch (route.method) {
            case 'get':    app.get(route.path, ...chain);       break;
            case 'post':   app.post(route.path, ...chain);   break;
            case 'put':    app.put(route.path, ...chain);       break;
            case 'patch':  app.patch(route.path, ...chain);  break;
            case 'delete': app.delete(route.path, ...chain); break;
            default: {
                const unknownMethod: never = route.method;
                throw new Error(`unsupported HTTP method: ${String(unknownMethod)}`);
            }
        }
    }
}

/**
 * The body parsing the legacy application installs globally
 * (`ApplicationServer#setupMiddleware`): JSON for `application/json` AND
 * `text/plain`, plus extended urlencoded. Only for mounting the registry in
 * tests; the application keeps owning its global middleware.
 */
export function legacyBodyParsers() {
    return [
        express.json({ type: ['application/json', 'text/plain'] }),
        express.urlencoded({ extended: true }),
    ] as const;
}
