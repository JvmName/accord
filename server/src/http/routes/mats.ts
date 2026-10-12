/**
 * Mat routes (legacy `controllers/matsController.js`). Declarations only:
 * handlers are ported in task 13a.
 */
import { routeResponses } from '../../contract/responses';
import { createMatRequestSchema } from '../../contract/requests';
import { defineRoute, notImplemented } from '../route';
import { createMatBody, matIdParams } from './requests';

/**
 * `MatsController#postIndex` (`POST /mats`). `authorize('create', Mat)` with
 * the Mat CLASS: any authenticated user; no `authenticateRequest` callback on
 * this controller, the 401 comes from the permission.
 */
export const postMats = defineRoute({
    method:    'post',
    path:      '/mats',
    authorize: { scope: 'newMat', level: 'create' },
    request:   { body: createMatBody },
    response:  routeResponses['POST /mats'],
    tags:      ['mats'],
    openapi:   { description: 'Create a new mat', body: createMatRequestSchema },
    handler:   notImplemented('13a'),
});

/**
 * `MatsController#getMat` (`routes: {getMat: '/mat/:matId'}`). `:matId` is a
 * mat id OR a mat code (CODE_REGEXP discrimination). INTENTIONALLY PUBLIC
 * (F-15, decision 2026-10-11). Missing mat -> 401 (F-16).
 */
export const getMat = defineRoute({
    method:    'get',
    path:      '/mat/:matId',
    authorize: { scope: 'mat', level: 'view' },
    request:   { params: matIdParams },
    response:  routeResponses['GET /mat/{matId}'],
    tags:      ['mats'],
    openapi:   { description: 'Get a mat by ID or mat code' },
    handler:   notImplemented('13a'),
});

export const matRoutes = [postMats, getMat] as const;
