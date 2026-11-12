/**
 * Match routes: create a match on a mat, read it, start it, end it.
 */
import { routeResponses } from '../../contract/responses';
import { createMatchRequestSchema } from '../../contract/requests';
import { insertMatch } from '../../db/repositories/matches';
import { findUserById, insertUser } from '../../db/repositories/users';
import { endMatch, startMatch } from '../../services/matchLifecycle';
import type { User } from '../../db/types';
import { present } from '../../domain/present';
import { defineRoute } from '../route';
import { FULL_MATCH, NEW_MATCH, renderMatch } from './matchPayload';
import { createMatchBody, matCodeParams, matchIdParams } from './requests';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger } = require('../../../lib/logger');

/**
 * Needs a user holding THIS mat's admin code; mat membership does not matter.
 * Each competitor is an existing user (`id`) or a new one (`name`). Existing
 * users are looked up and authorized first (an unknown id answers 401), and
 * new users are created only once both competitors are accepted, so a refused
 * request leaves no user behind (F-91).
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
        const found = { red: null as User | null, blue: null as User | null };
        for (const color of ['red', 'blue'] as const) {
            const { id } = ctx.body[color];
            if (!id) continue;
            found[color] = await findUserById(ctx.db, id);
            await ctx.authorize('assign', { kind: 'user', user: found[color] });
        }
        const red  = found.red  ?? await insertUser(ctx.db, { name: present(ctx.body.red.name, 'the red competitor name') });
        const blue = found.blue ?? await insertUser(ctx.db, { name: present(ctx.body.blue.name, 'the blue competitor name') });

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
