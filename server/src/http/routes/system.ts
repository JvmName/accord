/**
 * System and docs routes (legacy `lib/server/systemController.js`,
 * `lib/server/docsController.js`), which the legacy server registers outside
 * the autoloader (`#registerDefaultControllers`). Declarations only: task 13c
 * re-homes them when it removes the autoloader (its step 4).
 *
 * Paths are verbatim from the legacy `static get routes()` overrides and the
 * reflection rule (`getHealthCheck` on `SystemController` -> `/system/healthCheck`).
 */
import { z } from 'zod';
import { routeResponses } from '../../contract/responses';
import { defineRoute, notImplemented } from '../route';

/** `SystemController#getIndex` (`routes: {getIndex: '/'}`): the version banner. */
export const getRoot = defineRoute({
    method:    'get',
    path:      '/',
    authorize: { scope: 'none', level: 'public' },
    response:  routeResponses['GET /'],
    tags:      ['system'],
    openapi:   { description: 'Version banner.' },
    handler:   notImplemented('13c'),
});

/** `SystemController#getHealthCheck`: renders `{}` (not null) inside the envelope. */
export const getHealthCheck = defineRoute({
    method:    'get',
    path:      '/system/healthCheck',
    authorize: { scope: 'none', level: 'public' },
    response:  routeResponses['GET /system/healthCheck'],
    tags:      ['system'],
    openapi:   { description: 'Liveness probe.' },
    handler:   notImplemented('13c'),
});

/**
 * `DocsController#getDocsJson`: DEV only. Legacy overrode `formatJSONBody`, so
 * the spec is sent raw, WITHOUT the `{ data, status }` envelope.
 */
export const getDocsJson = defineRoute({
    method:    'get',
    path:      '/docs.json',
    authorize: { scope: 'none', level: 'public' },
    response:  z.unknown(),
    render:    'json',
    devOnly:   true,
    tags:      ['docs'],
    handler:   notImplemented('13c'),
});

/** `DocsController#getAsyncDocsJson`: DEV only, raw JSON (no envelope). */
export const getAsyncDocsJson = defineRoute({
    method:    'get',
    path:      '/async-docs.json',
    authorize: { scope: 'none', level: 'public' },
    response:  z.unknown(),
    render:    'json',
    devOnly:   true,
    tags:      ['docs'],
    handler:   notImplemented('13c'),
});

/** `DocsController#getDocs`: DEV only, an HTML page (`renderHtml`). */
export const getDocs = defineRoute({
    method:    'get',
    path:      '/docs',
    authorize: { scope: 'none', level: 'public' },
    response:  z.string(),
    render:    'html',
    devOnly:   true,
    tags:      ['docs'],
    handler:   notImplemented('13c'),
});

export const systemRoutes = [getRoot, getHealthCheck] as const;
export const docsRoutes   = [getDocsJson, getAsyncDocsJson, getDocs] as const;
