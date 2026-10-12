/**
 * `POST /users` (legacy `controllers/usersController.js`). Declaration only:
 * the handler is ported in task 13a.
 */
import { routeResponses } from '../../contract/responses';
import { createUserRequestSchema } from '../../contract/requests';
import { defineRoute, notImplemented } from '../route';
import { createUserBody } from './requests';

/**
 * `UsersController#postIndex`. The ONLY route that needs no authentication by
 * design (`beforeCallback('authenticateRequest', {except: 'postIndex'})`).
 * Validation: presence of `name` only (see `requests.ts`; an object `name`
 * passes validation and fails at insert with a 500, golden
 * `http.users.create.objectName.500`).
 */
export const postUsers = defineRoute({
    method:    'post',
    path:      '/users',
    authorize: { scope: 'none', level: 'public' },
    request:   { body: createUserBody },
    response:  routeResponses['POST /users'],
    tags:      ['users'],
    openapi:   {
        description: 'Register a new user and receive an API token',
        body:        createUserRequestSchema,
    },
    handler:   notImplemented('13a'),
});

export const userRoutes = [postUsers] as const;
