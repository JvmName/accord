/**
 * Mat membership routes (legacy `controllers/mat/usersController.js`, routed
 * by its `static get routes()`). Declarations only: handlers are ported in
 * task 13a.
 */
import { routeResponses } from '../../contract/responses';
import { joinMatRequestSchema } from '../../contract/requests';
import { defineRoute, notImplemented } from '../route';
import { joinMatBody, matCodeParams } from './requests';

/**
 * `mat/UsersController#postJoin`. No authentication (`except: 'postJoin'`): an
 * anonymous caller is created as a user. The unknown-code 404 and the
 * role-dependent `assign` / `be assigned judge` checks are in the handler.
 */
export const postMatJoin = defineRoute({
    method:    'post',
    path:      '/mat/:matCode/join',
    authorize: { scope: 'matCode', level: 'public' },
    request:   { params: matCodeParams, body: joinMatBody },
    response:  routeResponses['POST /mat/{matCode}/join'],
    tags:      ['mat/users'],
    openapi:   { description: 'Join a mat as a viewer or judge using a mat code', body: joinMatRequestSchema, errors: [400, 404] },
    handler:   notImplemented('13a'),
});

/**
 * `mat/UsersController#deleteJoin`. Authenticated; missing mat -> 404 (wins
 * over the 401, F-74). The admin-role branch's `assign` / `be assigned judge`
 * checks are in the handler (always granted there: the mat comes from the same
 * admin code).
 */
export const deleteMatJoin = defineRoute({
    method:    'delete',
    path:      '/mat/:matCode/join',
    authorize: { scope: 'matCode', level: 'view' },
    request:   { params: matCodeParams },
    response:  routeResponses['DELETE /mat/{matCode}/join'],
    tags:      ['mat/users'],
    openapi:   { description: 'Leave a mat (remove self as viewer or judge)' },
    handler:   notImplemented('13a'),
});

/** `mat/UsersController#getJudges`. Any authenticated user (F-74 ordering). */
export const getMatJudges = defineRoute({
    method:    'get',
    path:      '/mat/:matCode/judges',
    authorize: { scope: 'matCode', level: 'view' },
    request:   { params: matCodeParams },
    response:  routeResponses['GET /mat/{matCode}/judges'],
    tags:      ['mat/users'],
    openapi:   { description: 'Get the list of judges for a mat' },
    handler:   notImplemented('13a'),
});

/** `mat/UsersController#getViewers`. Any authenticated user (F-74 ordering). */
export const getMatViewers = defineRoute({
    method:    'get',
    path:      '/mat/:matCode/viewers',
    authorize: { scope: 'matCode', level: 'view' },
    request:   { params: matCodeParams },
    response:  routeResponses['GET /mat/{matCode}/viewers'],
    tags:      ['mat/users'],
    openapi:   { description: 'Get the list of viewers for a mat' },
    handler:   notImplemented('13a'),
});

export const matUserRoutes = [postMatJoin, deleteMatJoin, getMatJudges, getMatViewers] as const;
