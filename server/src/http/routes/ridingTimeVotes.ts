/**
 * Riding-time vote routes (legacy `controllers/match/ridingTimeVoteController.js`,
 * routed by its `static get routes()`). Declarations only: handlers are ported
 * in task 13b.
 */
import { z } from 'zod';
import { routeResponses } from '../../contract/responses';
import { startRidingTimeVoteRequestSchema } from '../../contract/requests';
import { competitorColorSchema } from '../../contract/scalars';
import { defineRoute, notImplemented } from '../route';
import { endRidingTimeQuery, matchIdParams, startRidingTimeBody } from './requests';

// ---------------------------------------------------------------------------
// RidingTimeVoteController: open round (400) before `judge` (401).
// ---------------------------------------------------------------------------

export const postStartRidingTime = defineRoute({
    method:    'post',
    path:      '/match/:matchId/ridingTime',
    authorize: { scope: 'match', level: 'judge', round: 'open' },
    request:   { params: matchIdParams, body: startRidingTimeBody },
    response:  routeResponses['POST /match/{matchId}/ridingTime'],
    tags:      ['match/ridingTime'],
    openapi:   {
        description: 'Start the riding time clock for the specified rider in the current round.',
        body:        startRidingTimeVoteRequestSchema,
    },
    handler:   notImplemented('13b'),
});

/** `rider` is accepted and ignored (F-55; the decision keeps tolerating it). */
export const deleteEndRidingTime = defineRoute({
    method:    'delete',
    path:      '/match/:matchId/ridingTime',
    authorize: { scope: 'match', level: 'judge', round: 'open' },
    request:   { params: matchIdParams, query: endRidingTimeQuery },
    response:  routeResponses['DELETE /match/{matchId}/ridingTime'],
    tags:      ['match/ridingTime'],
    openapi:   {
        description: 'End the riding time clock for the specified rider in the current round.',
        query:       z.object({ rider: competitorColorSchema.optional() }),
    },
    handler:   notImplemented('13b'),
});

export const ridingTimeVoteRoutes = [postStartRidingTime, deleteEndRidingTime] as const;
