/**
 * The seam between the legacy `ApplicationServer` (lib/server) and the typed
 * route registry while both serve the API.
 *
 * The legacy server keeps an explicit list of the controllers whose routes
 * the registry now serves (`PORTED_CONTROLLERS` in applicationServer.js). For
 * each listed controller it skips the autoloaded class and mounts the route
 * group below instead, so one list decides both halves and a path can never be
 * served by both systems, or by neither.
 */
import type { IRouter } from 'express';
import { isPlaceholder } from './route';
import { registerRoutes, type HttpDeps } from './router';
import { matRoutes } from './routes/mats';
import { matchRoutes } from './routes/matches';
import { matUserRoutes } from './routes/matUsers';
import { ridingTimeVoteRoutes } from './routes/ridingTimeVotes';
import { roundRoutes } from './routes/rounds';
import { userRoutes } from './routes/users';
import type { AnyRouteDefinition } from './types';

/**
 * The routes that replace each legacy controller, keyed by the controller's
 * class name prefixed with its directory under `controllers/`. The prefix is
 * needed because `controllers/usersController.js` and
 * `controllers/mat/usersController.js` both define a `UsersController`.
 */
export const ROUTES_BY_LEGACY_CONTROLLER: Readonly<Record<string, readonly AnyRouteDefinition[]>> = Object.freeze({
    'UsersController':     userRoutes,
    'MatsController':      matRoutes,
    'mat/UsersController': matUserRoutes,
    'match/RidingTimeVoteController': ridingTimeVoteRoutes,
    'match/RoundsController':         roundRoutes,
    'MatchesController':              matchRoutes,
});

/**
 * The route definitions that replace `controllerKeys`, in list order. Throws
 * for a controller that has no route group, or whose group still has a
 * placeholder handler, so a half-ported controller can never be switched over.
 */
export function portedRoutes(controllerKeys: readonly string[]): AnyRouteDefinition[] {
    return controllerKeys.flatMap(key => {
        if (!Object.hasOwn(ROUTES_BY_LEGACY_CONTROLLER, key)) {
            throw new Error(`no ported routes for legacy controller "${key}"`);
        }
        const group = ROUTES_BY_LEGACY_CONTROLLER[key];
        for (const route of group) {
            if (isPlaceholder(route.handler)) {
                throw new Error(`${route.method.toUpperCase()} ${route.path} (legacy "${key}") has no handler yet`);
            }
        }
        return [...group];
    });
}

/** Registers the routes that replace `controllerKeys` on `app`. */
export function mountPortedRoutes(app: IRouter, controllerKeys: readonly string[], deps: HttpDeps): void {
    registerRoutes(app, portedRoutes(controllerKeys), deps);
}
