/**
 * Mat membership routes: join or leave a mat with a mat code, list its judges
 * and viewers. The admin code makes the caller a judge (of the mat, and of the
 * match in progress if there is one); the viewer code makes them a viewer.
 */
import { routeResponses } from '../../contract/responses';
import { joinMatRequestSchema } from '../../contract/requests';
import { addMatchJudge, findMatchJudges, removeMatchJudge } from '../../db/repositories/matches';
import {
    addMatJudge,
    addMatViewer,
    findIncompleteMatchesForMat,
    findMatJudges,
    findMatViewers,
    removeMatJudge,
    removeMatViewer,
} from '../../db/repositories/mats';
import { findMatchRounds } from '../../db/repositories/rounds';
import { insertUser } from '../../db/repositories/users';
import { findOpenVoteForJudge } from '../../db/repositories/votes';
import type { DbOrTx } from '../../db/repositories/internal';
import type { Mat, MatCode, User } from '../../db/types';
import type { MatCodeModule } from '../../domain/types';
import { serializeMat, serializeUser, serializeUsers } from '../../serialize';
import { endVote } from '../../services/ridingTimeVotes';
import type { Rendered } from '../envelope';
import { assertLegacyModelValid } from '../legacyModelValidation';
import type { Subject } from '../permissions';
import { defineRoute } from '../route';
import type { ContextHelpers } from '../types';
import { joinMatBody, matCodeParams } from './requests';

/* eslint-disable @typescript-eslint/no-require-imports */
const MatCodes: MatCodeModule = require('../../domain/matCode');
const { logger } = require('../../../lib/logger');
/* eslint-enable @typescript-eslint/no-require-imports */

/** The part of a handler context the membership commands use. */
export type MembershipContext = Pick<ContextHelpers, 'db' | 'authorize' | 'renderErrors'> & {
    currentMat: Mat;
    currentMatCode: MatCode | null;
};

/** The first started match among the mat's incomplete matches, in insertion order (not by `created_at`). */
async function matchInProgress(db: DbOrTx, mat: Mat) {
    const incompleteMatches = await findIncompleteMatchesForMat(db, mat.id);
    return incompleteMatches.find(match => Boolean(match.started_at));
}

/**
 * Makes `user` a judge of the mat and of the match in progress. A match in
 * progress with exactly one judge refuses a second one (it would change the
 * consensus threshold from 1 to 2 mid-match), but only AFTER the user was
 * added to the mat's judges, and that addition stays.
 */
export async function addAsJudge(ctx: MembershipContext, user: User): Promise<Rendered | null> {
    const mat = ctx.currentMat;
    // The permission is evaluated for the user being added, who may have just
    // been created for this request.
    const subject: Subject = { user, matCode: ctx.currentMatCode };
    await ctx.authorize('assign',            { kind: 'mat', mat } as const, subject);
    await ctx.authorize('be assigned judge', { kind: 'mat', mat } as const, subject);

    const judges = await findMatJudges(ctx.db, mat.id);
    if (!judges.some(judge => judge.id == user.id)) {
        await addMatJudge(ctx.db, mat.id, user.id);
        logger.info(`Judge added: user=${user.id} mat=${mat.id}`);
    }

    const activeMatch = await matchInProgress(ctx.db, mat);
    if (activeMatch) {
        const matchJudges = await findMatchJudges(ctx.db, activeMatch.id);
        if (matchJudges.length === 1) {
            return ctx.renderErrors({ matCode: ['cannot join a solo match in progress'] });
        }
        if (!matchJudges.some(judge => judge.id == user.id)) {
            await addMatchJudge(ctx.db, activeMatch.id, user.id);
        }
    }
    return null;
}

/** Makes `user` a viewer of the mat; a second join with the viewer code is refused. */
export async function addAsViewer(ctx: MembershipContext, user: User): Promise<Rendered | null> {
    const mat = ctx.currentMat;
    const viewers = await findMatViewers(ctx.db, mat.id, { userId: user.id });
    if (viewers.length) {
        return ctx.renderErrors({ matCode: ['user is already a viewer'] });
    }
    await addMatViewer(ctx.db, mat.id, user.id);
    logger.info(`Viewer added: user=${user.id} mat=${mat.id}`);
    return null;
}

/**
 * Removes `user` from the mat in the role of the code used. A judge leaving
 * while a match is in progress first has their open riding-time vote in the
 * open round ended, then is removed from that match's judges.
 */
export async function removeUser(ctx: MembershipContext, user: User, role: string): Promise<void> {
    const mat = ctx.currentMat;
    if (role == MatCodes.ROLES.ADMIN) {
        await ctx.authorize('assign',            { kind: 'mat', mat } as const);
        await ctx.authorize('be assigned judge', { kind: 'mat', mat } as const);

        const currentMatch = await matchInProgress(ctx.db, mat);
        if (currentMatch) {
            const rounds = await findMatchRounds(ctx.db, currentMatch.id);
            const openRound = rounds.find(round => !round.ended_at);
            if (openRound) {
                const activeVote = await findOpenVoteForJudge(ctx.db, openRound.id, user.id);
                if (activeVote) await endVote(ctx.db, activeVote);
            }
            await removeMatchJudge(ctx.db, currentMatch.id, user.id);
        }

        await removeMatJudge(ctx.db, mat.id, user.id);
        logger.info(`Judge removed: user=${user.id} mat=${mat.id}`);
    } else {
        await removeMatViewer(ctx.db, mat.id, user.id);
        logger.info(`Viewer removed: user=${user.id} mat=${mat.id}`);
    }
}

/**
 * No authentication: a caller without a (valid) token is created as a user,
 * named `name` or "Anonymous", and gets that user's api token back. Unknown
 * code -> 404 with an `errors` object.
 */
export const postMatJoin = defineRoute({
    method:    'post',
    path:      '/mat/:matCode/join',
    authorize: { scope: 'matCode', level: 'public' },
    request:   { params: matCodeParams, body: joinMatBody },
    response:  routeResponses['POST /mat/{matCode}/join'],
    tags:      ['mat/users'],
    openapi:   { description: 'Join a mat as a viewer or judge using a mat code', body: joinMatRequestSchema, errors: [400, 404] },
    handler: async ctx => {
        const matCode = ctx.currentMatCode;
        if (!matCode) return ctx.renderErrors({ matCode: ['not found'] }, 404);

        let user = ctx.currentUser;
        if (!user) {
            const name = ctx.body.name || 'Anonymous';
            assertLegacyModelValid('User', [{ field: 'name', value: name, notNull: true, string: true }]);
            const created = await insertUser(ctx.db, { name: name as string });
            // Rendered with the name as sent (a number stays a number), not the stored text.
            user = { ...created, name: name as string };
        }

        const refused = matCode.role == MatCodes.ROLES.ADMIN
            ? await addAsJudge(ctx, user)
            : await addAsViewer(ctx, user);
        if (refused) return refused;

        const judges = await findMatJudges(ctx.db, ctx.currentMat.id);
        return { mat: serializeMat(ctx.currentMat, { judges }), user: serializeUser(user), api_token: user.api_token };
    },
});

/**
 * Authenticated. An unknown code answers 404 even without a token; a known
 * code without a token answers 401.
 */
export const deleteMatJoin = defineRoute({
    method:    'delete',
    path:      '/mat/:matCode/join',
    authorize: { scope: 'matCode', level: 'view' },
    request:   { params: matCodeParams },
    response:  routeResponses['DELETE /mat/{matCode}/join'],
    tags:      ['mat/users'],
    openapi:   { description: 'Leave a mat (remove self as viewer or judge)' },
    handler: async ctx => {
        if (!ctx.currentMatCode) {
            // Reachable only with `?matCode=&matId=<id>`: the mat resolves from
            // the id and there is no code. The legacy controller dereferenced the
            // missing code, and this 500 with the engine's message is what went out.
            throw new TypeError("null is not an object (evaluating 'this.currentMatCode.role')");
        }
        await removeUser(ctx, ctx.currentUser, ctx.currentMatCode.role);

        const judges = await findMatJudges(ctx.db, ctx.currentMat.id);
        return { mat: serializeMat(ctx.currentMat, { judges }) };
    },
});

/** Any authenticated user. */
export const getMatJudges = defineRoute({
    method:    'get',
    path:      '/mat/:matCode/judges',
    authorize: { scope: 'matCode', level: 'view' },
    request:   { params: matCodeParams },
    response:  routeResponses['GET /mat/{matCode}/judges'],
    tags:      ['mat/users'],
    openapi:   { description: 'Get the list of judges for a mat' },
    handler: async ctx => ({ judges: serializeUsers(await findMatJudges(ctx.db, ctx.currentMat.id)) }),
});

/** Any authenticated user. */
export const getMatViewers = defineRoute({
    method:    'get',
    path:      '/mat/:matCode/viewers',
    authorize: { scope: 'matCode', level: 'view' },
    request:   { params: matCodeParams },
    response:  routeResponses['GET /mat/{matCode}/viewers'],
    tags:      ['mat/users'],
    openapi:   { description: 'Get the list of viewers for a mat' },
    handler: async ctx => ({ viewers: serializeUsers(await findMatViewers(ctx.db, ctx.currentMat.id)) }),
});

export const matUserRoutes = [postMatJoin, deleteMatJoin, getMatJudges, getMatViewers] as const;
