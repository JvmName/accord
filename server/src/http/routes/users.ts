/**
 * `POST /users`: user registration.
 */
import { routeResponses } from '../../contract/responses';
import { createUserRequestSchema } from '../../contract/requests';
import { insertUser } from '../../db/repositories/users';
import { serializeUser } from '../../serialize';
import { defineRoute } from '../route';
import { createUserBody } from './requests';

/** The only route that needs no authentication by design. */
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
    handler: async ctx => {
        const user = await insertUser(ctx.db, { name: ctx.body.name });
        return { user: serializeUser(user), api_token: user.api_token };
    },
});

export const userRoutes = [postUsers] as const;
