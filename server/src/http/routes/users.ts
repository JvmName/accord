/**
 * `POST /users`: user registration.
 */
import { routeResponses } from '../../contract/responses';
import { createUserRequestSchema } from '../../contract/requests';
import { insertUser } from '../../db/repositories/users';
import { serializeUser } from '../../serialize';
import { assertLegacyModelValid } from '../legacyModelValidation';
import { defineRoute } from '../route';
import { createUserBody } from './requests';

/**
 * The only route that needs no authentication by design. `name` is checked
 * for presence only, so an object `name` gets past validation and fails at
 * the insert with a 500.
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
    handler: async ctx => {
        const name = ctx.body.name;
        assertLegacyModelValid('User', [{ field: 'name', value: name, notNull: true, string: true }]);

        const user = await insertUser(ctx.db, { name: name as string });
        // The response carries the name as it was sent (a number stays a
        // number), not the text SQLite stored, as the legacy model rendered it.
        return { user: serializeUser({ id: user.id, name: name as string }), api_token: user.api_token };
    },
});

export const userRoutes = [postUsers] as const;
