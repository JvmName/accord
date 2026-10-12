/**
 * Match routes (legacy `controllers/matchesController.js`, routed by its
 * `static get routes()`). Declarations only: handlers are ported in task 13b.
 */
import { routeResponses } from '../../contract/responses';
import { createMatchRequestSchema } from '../../contract/requests';
import { defineRoute, notImplemented } from '../route';
import { createMatchBody, matCodeParams, matchIdParams } from './requests';

// ---------------------------------------------------------------------------
// MatchesController
// ---------------------------------------------------------------------------

/**
 * `MatchesController#postIndex` (`routes: {postIndex: '/mat/:matCode/matches'}`).
 * Authenticated; the request's mat code must be the ADMIN code of the mat
 * (`create a match` + `assign`); membership is irrelevant. The per-competitor
 * `authorize('assign', user)` (null user -> 401) is in the handler.
 */
export const postMatches = defineRoute({
    method:    'post',
    path:      '/mat/:matCode/matches',
    authorize: { scope: 'matCode', level: 'create a match' },
    request:   { params: matCodeParams, body: createMatchBody },
    response:  routeResponses['POST /mat/{matCode}/matches'],
    tags:      ['matches'],
    openapi:   { description: 'Create a new match on a mat', body: createMatchRequestSchema },
    handler:   notImplemented('13b'),
});

/** `MatchesController#getMatch`. Any authenticated user; unknown match -> 404. */
export const getMatch = defineRoute({
    method:    'get',
    path:      '/match/:matchId',
    authorize: { scope: 'match', level: 'view' },
    request:   { params: matchIdParams },
    response:  routeResponses['GET /match/{matchId}'],
    tags:      ['matches'],
    openapi:   { description: 'Get a match by ID' },
    handler:   notImplemented('13b'),
});

/** `MatchesController#postStartMatch`: the mat creator (master) only. */
export const postStartMatch = defineRoute({
    method:    'post',
    path:      '/match/:matchId/start',
    authorize: { scope: 'match', level: 'manage' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/start'],
    tags:      ['matches'],
    openapi:   { description: 'Start a match, assign judges from the mat, and begin the first round', errors: [400] },
    handler:   notImplemented('13b'),
});

/** `MatchesController#postEndMatch`: the master only. */
export const postEndMatch = defineRoute({
    method:    'post',
    path:      '/match/:matchId/end',
    authorize: { scope: 'match', level: 'manage' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/end'],
    tags:      ['matches'],
    openapi:   { description: 'End a match and its current active round', errors: [400] },
    handler:   notImplemented('13b'),
});

export const matchRoutes = [postMatches, getMatch, postStartMatch, postEndMatch] as const;
