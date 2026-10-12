/**
 * Match routes: create a match on a mat, read it, start it, end it.
 */
import { routeResponses } from '../../contract/responses';
import { createMatchRequestSchema } from '../../contract/requests';
import { insertMatch } from '../../db/repositories/matches';
import { findUserById, insertUser } from '../../db/repositories/users';
import type { DbOrTx } from '../../db/repositories/internal';
import type { User } from '../../db/types';
import { endMatch, startMatch } from '../../services/matchLifecycle';
import { assertLegacyModelValid } from '../legacyModelValidation';
import { defineRoute } from '../route';
import { FULL_MATCH, NEW_MATCH, renderMatch } from './matchPayload';
import { createMatchBody, matCodeParams, matchIdParams, type LegacyCompetitor } from './requests';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger } = require('../../../lib/logger');

/**
 * Looks a competitor up by id the way the legacy model lookup did: a string or
 * number is looked up (a number never matches a UUID), any other truthy value
 * (`true`, an object, an array) is refused with a 500 carrying this message.
 */
async function findCompetitorById(db: DbOrTx, id: unknown): Promise<User | null> {
    if (typeof id !== 'string' && typeof id !== 'number') {
        throw new Error(`Argument passed to findByPk is invalid: ${id}`);
    }
    return await findUserById(db, id as string);
}

/**
 * An existing user when `id` is given (`null` if unknown), otherwise a new
 * user named `name`. The new user is created even if the request is refused
 * afterwards.
 */
async function fetchCompetitor(db: DbOrTx, competitor: LegacyCompetitor): Promise<User | null> {
    if (competitor.id) return await findCompetitorById(db, competitor.id);

    assertLegacyModelValid('User', [{ field: 'name', value: competitor.name, notNull: true, string: true }]);
    return await insertUser(db, { name: competitor.name as string });
}

/**
 * Needs a user holding THIS mat's admin code; mat membership does not matter.
 * Each competitor is an existing user (`id`) or a new one (`name`); an
 * unknown id answers 401 after both competitors were looked up or created.
 */
export const postMatches = defineRoute({
    method:    'post',
    path:      '/mat/:matCode/matches',
    authorize: { scope: 'matCode', level: 'create a match' },
    request:   { params: matCodeParams, body: createMatchBody },
    response:  routeResponses['POST /mat/{matCode}/matches'],
    tags:      ['matches'],
    openapi:   { description: 'Create a new match on a mat', body: createMatchRequestSchema },
    handler: async ctx => {
        const red  = await fetchCompetitor(ctx.db, ctx.body.red);
        const blue = await fetchCompetitor(ctx.db, ctx.body.blue);

        await ctx.authorize('assign', { kind: 'user', user: red });
        await ctx.authorize('assign', { kind: 'user', user: blue });

        const match = await insertMatch(ctx.db, {
            mat_id:             ctx.currentMat.id,
            creator_id:         ctx.currentUser.id,
            red_competitor_id:  red.id,
            blue_competitor_id: blue.id,
        });

        return { match: await renderMatch(ctx.db, match.id, NEW_MATCH) };
    },
});

/** Any authenticated user may read any match. */
export const getMatch = defineRoute({
    method:    'get',
    path:      '/match/:matchId',
    authorize: { scope: 'match', level: 'view' },
    request:   { params: matchIdParams },
    response:  routeResponses['GET /match/{matchId}'],
    tags:      ['matches'],
    openapi:   { description: 'Get a match by ID' },
    handler:   async ctx => ({ match: await renderMatch(ctx.db, ctx.currentMatch.id, FULL_MATCH) }),
});

/**
 * Master only. Copies the mat's judges onto the match and opens round one.
 * Errors after the first write (e.g. a round already open) answer 500 and
 * leave the earlier writes in place.
 */
export const postStartMatch = defineRoute({
    method:    'post',
    path:      '/match/:matchId/start',
    authorize: { scope: 'match', level: 'manage' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/start'],
    tags:      ['matches'],
    openapi:   { description: 'Start a match, assign judges from the mat, and begin the first round', errors: [400] },
    handler: async ctx => {
        const match = ctx.currentMatch;
        if (match.started_at) return ctx.renderErrors({ matchId: ['match has already started'] });

        await startMatch(ctx.db, match);
        logger.info(`Match started: match=${match.id} by user=${ctx.currentUser.id}`);
        return { match: await renderMatch(ctx.db, match.id, FULL_MATCH) };
    },
});

/**
 * Master only. Ends the match and its open round. Ending during the final
 * round writes everything and then fails with a 500 ("This match has already
 * ended"), because ending that round ends the match a second time.
 */
export const postEndMatch = defineRoute({
    method:    'post',
    path:      '/match/:matchId/end',
    authorize: { scope: 'match', level: 'manage' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/end'],
    tags:      ['matches'],
    openapi:   { description: 'End a match and its current active round', errors: [400] },
    handler: async ctx => {
        const match = ctx.currentMatch;
        if (!match.started_at) return ctx.renderErrors({ matchId: ['this match has not started'] });
        if (match.ended_at)    return ctx.renderErrors({ matchId: ['this match has already ended'] });

        await endMatch(ctx.db, match);
        logger.info(`Match ended: match=${match.id} by user=${ctx.currentUser.id}`);
        return { match: await renderMatch(ctx.db, match.id, FULL_MATCH) };
    },
});

export const matchRoutes = [postMatches, getMatch, postStartMatch, postEndMatch] as const;
