/**
 * Round routes, all for the mat creator (the master) only.
 *
 * Ending a round takes two calls. `POST .../rounds/end` (no body) stops the
 * clock and starts the break at once. `PATCH .../rounds/result` then records
 * who won the round that just ended, and is accepted only during the break or
 * after the match has ended. A master who dismisses the result dialog never
 * sends the PATCH, so a round can stay without a result; that is a valid
 * state, not an error.
 *
 * A failed command answers 400 with its message under `matchId`. The 422s
 * are the routes' own preconditions; their bodies carry no `status` key,
 * which the client cannot decode, but that is what it receives today.
 */
import { routeResponses } from '../../contract/responses';
import { endRoundRequestSchema } from '../../contract/requests';
import { findLastRound } from '../../db/repositories/rounds';
import type { Match } from '../../db/types';
import { endRound, startRound } from '../../services/matchLifecycle';
import { pauseRound, resumeRound, setRoundResult } from '../../services/roundLifecycle';
import { defineRoute } from '../route';
import { MATCH_WITHOUT_JUDGES, renderMatch } from './matchPayload';
import { matchIdParams, roundResultBody } from './requests';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger } = require('../../../lib/logger');

const UNPROCESSABLE = 422;

/** A round result may be recorded while the match is in a break or once it has ended. */
function isResultWindowOpen(match: Pick<Match, 'break_started_at' | 'ended_at'>): boolean {
    return match.break_started_at != null || match.ended_at != null;
}

/**
 * Adds a round even to a match that has not started or has already ended;
 * the only check is that the last round is not still open.
 */
export const postStartRound = defineRoute({
    method:    'post',
    path:      '/match/:matchId/rounds',
    authorize: { scope: 'match', level: 'manage' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/rounds'],
    tags:      ['match/rounds'],
    openapi:   { description: 'Start a new round for the specified match.', errors: [400] },
    handler: async ctx => {
        try {
            await startRound(ctx.db, ctx.currentMatch.id);
            logger.info(`Round started: match=${ctx.currentMatch.id} by user=${ctx.currentUser.id}`);
            return { match: await renderMatch(ctx.db, ctx.currentMatch.id, MATCH_WITHOUT_JUDGES) };
        } catch (err) {
            return ctx.renderErrors({ matchId: [(err as Error).message] });
        }
    },
});

/** Step one of ending a round. Any request body is ignored. */
export const postEndRound = defineRoute({
    method:    'post',
    path:      '/match/:matchId/rounds/end',
    authorize: { scope: 'match', level: 'manage' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/rounds/end'],
    tags:      ['match/rounds'],
    openapi:   { description: 'End the current round for the specified match.', errors: [400] },
    handler: async ctx => {
        try {
            await endRound(ctx.db, ctx.currentMatch.id, { safe: false });
            logger.info(`Round ended: match=${ctx.currentMatch.id} by user=${ctx.currentUser.id}`);
            return { match: await renderMatch(ctx.db, ctx.currentMatch.id, MATCH_WITHOUT_JUDGES) };
        } catch (err) {
            return ctx.renderErrors({ matchId: [(err as Error).message] });
        }
    },
});

/**
 * Step two of ending a round: sets or clears the result of the last round.
 * An omitted `winner` clears it; an explicit `null` is rejected by
 * validation. `stoppage` is not validated. Validation runs after the master
 * check.
 */
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
    handler: async ctx => {
        const match = ctx.currentMatch;
        if (!isResultWindowOpen(match)) {
            return ctx.renderErrors({ matchId: ['Round result can only be set during the break or at match end'] }, UNPROCESSABLE);
        }

        const lastRound = await findLastRound(ctx.db, match.id);
        if (!lastRound || !lastRound.ended_at) {
            return ctx.renderErrors({ matchId: ['No ended round to update'] }, UNPROCESSABLE);
        }

        const { winner, stoppage } = ctx.body;
        try {
            await setRoundResult(ctx.db, lastRound, { winner, stoppage: stoppage as boolean | null | undefined });
            const winLog = winner ? ` winner=${winner} stoppage=${stoppage}` : '';
            logger.info(`Round result set: match=${match.id} round=${lastRound.id} by user=${ctx.currentUser.id}${winLog}`);
            return { match: await renderMatch(ctx.db, match.id, MATCH_WITHOUT_JUDGES) };
        } catch (err) {
            return ctx.renderErrors({ matchId: [(err as Error).message] });
        }
    },
});

/**
 * Master only. The permission level is named `pause` and would also admit
 * match judges, but the master check runs first, so judges are refused.
 * Only the master may pause or resume.
 */
export const postPauseRound = defineRoute({
    method:    'post',
    path:      '/match/:matchId/rounds/pause',
    authorize: { scope: 'match', level: 'pause' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/rounds/pause'],
    tags:      ['match/rounds'],
    openapi:   { description: 'Pause the current active round for the specified match.', errors: [400, 422] },
    handler: async ctx => {
        const round = await findLastRound(ctx.db, ctx.currentMatch.id);
        if (!round || !round.created_at || round.ended_at) {
            return ctx.renderErrors({ matchId: ['No active round to pause'] }, UNPROCESSABLE);
        }

        try {
            await pauseRound(ctx.db, round);
            logger.info(`Round paused: match=${ctx.currentMatch.id} round=${round.id} by user=${ctx.currentUser.id}`);
            return { match: await renderMatch(ctx.db, ctx.currentMatch.id, MATCH_WITHOUT_JUDGES) };
        } catch (err) {
            return ctx.renderErrors({ matchId: [(err as Error).message] });
        }
    },
});

/** Master only, like pause. */
export const postResumeRound = defineRoute({
    method:    'post',
    path:      '/match/:matchId/rounds/resume',
    authorize: { scope: 'match', level: 'pause' },
    request:   { params: matchIdParams },
    response:  routeResponses['POST /match/{matchId}/rounds/resume'],
    tags:      ['match/rounds'],
    openapi:   { description: 'Resume the currently paused round for the specified match.', errors: [400, 422] },
    handler: async ctx => {
        const round = await findLastRound(ctx.db, ctx.currentMatch.id);
        if (!round || !round.created_at || round.ended_at) {
            return ctx.renderErrors({ matchId: ['No active round to resume'] }, UNPROCESSABLE);
        }

        try {
            await resumeRound(ctx.db, round);
            logger.info(`Round resumed: match=${ctx.currentMatch.id} round=${round.id} by user=${ctx.currentUser.id}`);
            return { match: await renderMatch(ctx.db, ctx.currentMatch.id, MATCH_WITHOUT_JUDGES) };
        } catch (err) {
            return ctx.renderErrors({ matchId: [(err as Error).message] });
        }
    },
});

export const roundRoutes = [postStartRound, postEndRound, patchRoundResult, postPauseRound, postResumeRound] as const;
