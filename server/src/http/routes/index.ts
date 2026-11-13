/**
 * THE route table.
 *
 * Every HTTP route the server has is imported here, explicitly. There is no
 * filesystem discovery: a route that is not in this list does not exist, and
 * the list's order is the registration order (never the filesystem's).
 * `test/http/routeTable.test.ts` asserts this list equals
 * `.ai/plans/server-ts/artifacts/route-table.txt` exactly (as a sorted set).
 *
 * All 23 routes are declared here, and the application (`../server.ts`)
 * serves every one of them; the three docs routes only in development.
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
