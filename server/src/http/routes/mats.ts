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
import { assertLegacyModelValid } from '../legacyModelValidation';
import { defineRoute } from '../route';
import { createMatBody, matIdParams } from './requests';

/* eslint-disable @typescript-eslint/no-require-imports */
const MatCodes: MatCodeModule = require('../../domain/matCode');
const { WordGenerator } = require('../../../lib/external_api/word_generator');
/* eslint-enable @typescript-eslint/no-require-imports */

/** Words in a generated mat code (`morning.coffee.bicycle`). */
const MAT_CODE_WORDS = 3;

/**
 * What a new mat's `judge_count` renders as when the request omits it: the
 * legacy model's default, which is the STRING "1" (the DB stores 1). A
 * request that sends `judge_count: null` does not get the default and fails.
 */
const OMITTED_JUDGE_COUNT_RENDERED = '1';

function generateMatCode(): string {
    return new WordGenerator().getWords(MAT_CODE_WORDS).join('.');
}

/**
 * `judge_count` is not validated, so any JSON value reaches the insert. The
 * sqlite3 driver stored an object or array as its string form
 * (`'[object Object]'`, `'1,2'`); bun:sqlite refuses to bind one.
 */
function storedJudgeCount(value: unknown): number | undefined {
    if (typeof value === 'object' && value !== null) return String(value) as unknown as number;
    return value as number | undefined;
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
        const renderedJudgeCount = judgeCount === undefined ? OMITTED_JUDGE_COUNT_RENDERED : judgeCount;
        assertLegacyModelValid('Mat', [
            { field: 'name',        value: name,               notNull: true, string: true },
            { field: 'judge_count', value: renderedJudgeCount, notNull: true },
        ]);

        const mat = await insertMat(ctx.db, {
            creator_id:  ctx.currentUser.id,
            name:        name as string,
            judge_count: storedJudgeCount(judgeCount),
        });
        await insertMatCode(ctx.db, { mat_id: mat.id, code: generateMatCode(), role: MatCodes.ROLES.ADMIN });
        await insertMatCode(ctx.db, { mat_id: mat.id, code: generateMatCode(), role: MatCodes.ROLES.VIEWER });

        const judges = await findMatJudges(ctx.db, mat.id);
        const codes  = await findMatCodesForMat(ctx.db, mat.id);
        // Rendered with the values as sent (`name: 5` stays a number), as the
        // legacy model rendered the instance it had just built.
        const rendered = {
            id:          mat.id,
            name:        name as string,
            judge_count: renderedJudgeCount as number,
            creator_id:  mat.creator_id,
        };
        return { mat: serializeMat(rendered, { judges, codes }) };
    },
});

/**
 * `:matId` is a mat id or a mat code (`requestState.ts` tells them apart).
 * Public on purpose: anyone who knows a mat id or code may read the mat, its
 * judges and its matches. An unknown mat answers 401, not 404.
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
