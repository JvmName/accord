/**
 * Mat routes: create a mat, read a mat.
 */
import { routeResponses } from '../../contract/responses';
import { createMatRequestSchema } from '../../contract/requests';
import { findMatCodesForMat, insertMatCode } from '../../db/repositories/matCodes';
import { findMatchGraphsByIds } from '../../db/repositories/matches';
import { findIncompleteMatchesForMat, findMatJudges, insertMat } from '../../db/repositories/mats';
import type { MatchGraph } from '../../db/repositories/matches';
import type { MatCodeModule } from '../../domain/types';
import { serializeMat } from '../../serialize';
import { defineRoute } from '../route';
import { createMatBody, matIdParams } from './requests';

/* eslint-disable @typescript-eslint/no-require-imports */
const MatCodes: MatCodeModule = require('../../domain/matCode');
const { WordGenerator } = require('../../../lib/external_api/word_generator');
/* eslint-enable @typescript-eslint/no-require-imports */

/** Words in a generated mat code (`morning.coffee.bicycle`). */
const MAT_CODE_WORDS = 3;

/** A mat created without a `judge_count` gets one judge. */
const DEFAULT_JUDGE_COUNT = 1;

function generateMatCode(): string {
    return new WordGenerator().getWords(MAT_CODE_WORDS).join('.');
}

/**
 * Any authenticated user may create a mat. The mat row and its two codes are
 * separate writes, not one transaction (the legacy transaction never wrapped
 * them either): a failed code insert leaves the mat behind.
 */
export const postMats = defineRoute({
    method:    'post',
    path:      '/mats',
    authorize: { scope: 'newMat', level: 'create' },
    request:   { body: createMatBody },
    response:  routeResponses['POST /mats'],
    tags:      ['mats'],
    openapi:   { description: 'Create a new mat', body: createMatRequestSchema },
    handler: async ctx => {
        const { name, judge_count: judgeCount } = ctx.body;

        const mat = await insertMat(ctx.db, {
            creator_id:  ctx.currentUser.id,
            name,
            judge_count: judgeCount ?? DEFAULT_JUDGE_COUNT,
        });
        await insertMatCode(ctx.db, { mat_id: mat.id, code: generateMatCode(), role: MatCodes.ROLES.ADMIN });
        await insertMatCode(ctx.db, { mat_id: mat.id, code: generateMatCode(), role: MatCodes.ROLES.VIEWER });

        const judges = await findMatJudges(ctx.db, mat.id);
        const codes  = await findMatCodesForMat(ctx.db, mat.id);
        return { mat: serializeMat(mat, { judges, codes }) };
    },
});

/**
 * `:matId` is a mat id or a mat code (`requestState.ts` tells them apart).
 * Public on purpose: anyone who knows a mat id or code may read the mat, its
 * judges and its matches. An unknown mat answers 404.
 */
export const getMat = defineRoute({
    method:    'get',
    path:      '/mat/:matId',
    authorize: { scope: 'mat', level: 'view' },
    request:   { params: matIdParams },
    response:  routeResponses['GET /mat/{matId}'],
    tags:      ['mats'],
    openapi:   { description: 'Get a mat by ID or mat code' },
    handler: async ctx => {
        const mat     = ctx.currentMat;
        const judges  = await findMatJudges(ctx.db, mat.id);
        const matches = await findIncompleteMatchesForMat(ctx.db, mat.id);
        const graphs  = await findMatchGraphsByIds(ctx.db, matches.map(match => match.id));
        const incompleteMatches = matches.map(match => graphs.get(match.id)).filter((graph): graph is MatchGraph => graph !== undefined);
        return { mat: serializeMat(mat, { judges, incompleteMatches }) };
    },
});

export const matRoutes = [postMats, getMat] as const;
