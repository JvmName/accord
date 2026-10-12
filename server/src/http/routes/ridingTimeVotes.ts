/**
 * Riding-time vote routes: a match judge starts or stops voting that a
 * competitor has control in the open round. The consensus over these votes is
 * computed when the match is rendered, not here.
 *
 * Both routes need an open last round (400 when there is none, checked before
 * the judge check) and a match judge.
 */
import { z } from 'zod';
import { routeResponses } from '../../contract/responses';
import { startRidingTimeVoteRequestSchema } from '../../contract/requests';
import { competitorColorSchema } from '../../contract/scalars';
import { endRidingTime, startRidingTime } from '../../services/ridingTimeVotes';
import { defineRoute } from '../route';
import { MATCH_WITHOUT_JUDGES, renderMatch } from './matchPayload';
import { endRidingTimeQuery, matchIdParams, startRidingTimeBody } from './requests';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger } = require('../../../lib/logger');

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
    handler: async ctx => {
        const round = ctx.currentRound;
        try {
            await startRidingTime(ctx.db, round, ctx.currentUser.id, ctx.body.rider);
        } catch (err) {
            return ctx.renderErrors({ matchId: [(err as Error).message] });
        }

        logger.info(`Vote started: judge=${ctx.currentUser.id} rider=${ctx.body.rider} match=${ctx.currentMatch.id} round=${round.id}`);
        return { match: await renderMatch(ctx.db, ctx.currentMatch.id, MATCH_WITHOUT_JUDGES) };
    },
});

/**
 * Ends the judge's open vote in the round, whichever competitor it is for:
 * `rider` is accepted and ignored. Installed clients still send it, so it
 * must keep being accepted.
 */
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
    handler: async ctx => {
        const round = ctx.currentRound;
        const rider = ctx.query.rider;
        try {
            await endRidingTime(ctx.db, round, ctx.currentUser.id, rider as string | undefined);
        } catch (err) {
            return ctx.renderErrors({ matchId: [(err as Error).message] });
        }

        logger.info(`Vote ended: judge=${ctx.currentUser.id} rider=${rider} match=${ctx.currentMatch.id} round=${round.id}`);
        return { match: await renderMatch(ctx.db, ctx.currentMatch.id, MATCH_WITHOUT_JUDGES) };
    },
});

export const ridingTimeVoteRoutes = [postStartRidingTime, deleteEndRidingTime] as const;
