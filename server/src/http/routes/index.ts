/**
 * THE route table (server-ts task 12).
 *
 * Every HTTP route the server has is imported here, explicitly. There is no
 * filesystem discovery: a route that is not in this list does not exist, and
 * the list's order is the registration order (F-04: the legacy order came from
 * bun's unsorted `readdirSync`). `test/http/routeTable.test.ts` asserts this
 * list equals `.ai/plans/server-ts/artifacts/route-table.txt` exactly (as a
 * sorted set) and that each route's authorization equals what its legacy
 * controller enforces.
 *
 * All 23 routes are declared here. The users, mats and mat membership routes
 * have real handlers and are served by the running app (`mountPorted.ts`);
 * the match, round, riding-time, system and docs routes still carry a
 * placeholder handler that throws `NotImplementedError` and are served by the
 * legacy controllers.
 */
import { matRoutes } from './mats';
import { matUserRoutes } from './matUsers';
import { matchRoutes } from './matches';
import { ridingTimeVoteRoutes } from './ridingTimeVotes';
import { roundRoutes } from './rounds';
import { docsRoutes, systemRoutes } from './system';
import { userRoutes } from './users';
import type { AnyRouteDefinition } from '../types';

export const routes: readonly AnyRouteDefinition[] = [
    ...systemRoutes,
    ...docsRoutes,
    ...userRoutes,
    ...matRoutes,
    ...matUserRoutes,
    ...matchRoutes,
    ...roundRoutes,
    ...ridingTimeVoteRoutes,
];
