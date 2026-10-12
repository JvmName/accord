/**
 * Round routes (legacy `controllers/match/roundsController.js`, routed by its
 * `static get routes()`). Declarations only: handlers are ported in task 13b.
 */
import { routeResponses } from '../../contract/responses';
import { endRoundRequestSchema } from '../../contract/requests';
import { defineRoute, notImplemented } from '../route';
import { matchIdParams, roundResultBody } from './requests';

// ---------------------------------------------------------------------------
// RoundsController: `authenticateMatch` requires `manage` for EVERY action.
// ---------------------------------------------------------------------------

export const postStartRound = defineRoute({
    method:    'post',
    path:      '/match/:matchId/rounds',
    authorize: { scope: 'match', level: 'manage' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/rounds'],
    tags:      ['match/rounds'],
    openapi:   { description: 'Start a new round for the specified match.', errors: [400] },
    handler:   notImplemented('13b'),
});

export const postEndRound = defineRoute({
    method:    'post',
    path:      '/match/:matchId/rounds/end',
    authorize: { scope: 'match', level: 'manage' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/rounds/end'],
    tags:      ['match/rounds'],
    openapi:   { description: 'End the current round for the specified match.', errors: [400] },
    handler:   notImplemented('13b'),
});

/** Validation (`winner`) runs after `manage`, as in legacy. */
export const patchRoundResult = defineRoute({
    method:    'patch',
    path:      '/match/:matchId/rounds/result',
    authorize: { scope: 'match', level: 'manage' },
    request:   { params: matchIdParams, body: roundResultBody },
    response:  routeResponses['PATCH /match/{matchId}/rounds/result'],
    tags:      ['match/rounds'],
    openapi:   {
        description: 'Record the result of the most recently ended round. Only valid during the break or after the match has ended.',
        body:        endRoundRequestSchema,
        errors:      [422],
    },
    handler:   notImplemented('13b'),
});

/** `pause`: effectively master-only (F-11; `manage` is checked first). */
export const postPauseRound = defineRoute({
    method:    'post',
    path:      '/match/:matchId/rounds/pause',
    authorize: { scope: 'match', level: 'pause' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/rounds/pause'],
    tags:      ['match/rounds'],
    openapi:   { description: 'Pause the current active round for the specified match.', errors: [400, 422] },
    handler:   notImplemented('13b'),
});

/** `pause`: effectively master-only (F-11). */
export const postResumeRound = defineRoute({
    method:    'post',
    path:      '/match/:matchId/rounds/resume',
    authorize: { scope: 'match', level: 'pause' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/rounds/resume'],
    tags:      ['match/rounds'],
    openapi:   { description: 'Resume the currently paused round for the specified match.', errors: [400, 422] },
    handler:   notImplemented('13b'),
});

export const roundRoutes = [postStartRound, postEndRound, patchRoundResult, postPauseRound, postResumeRound] as const;
