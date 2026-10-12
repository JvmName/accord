/**
 * Task 12 — route-table parity of the typed route registry.
 *
 * The registry DECLARES every route; it must declare exactly the routes the
 * legacy reflection-based router registers, with identical method and path
 * (task-12 success criterion 3), and each route's authorization must be the
 * one its legacy controller enforces. That second table is a SECURITY
 * BOUNDARY: a route declared with a weaker level than its controller
 * enforced would be a silent authorization downgrade.
 *
 * Three independent references are compared against the registry:
 *   1. `.ai/plans/server-ts/artifacts/route-table.txt` (task 01, `{param}` form);
 *   2. `test/characterization/fixtures/routeTable.txt` (task 02b, raw `:param`
 *      paths plus the DEV flag), read-only;
 *   3. the LIVE legacy table, computed the way `ApplicationServer` registers it
 *      (System + Docs + autoloaded controllers' reflected actions).
 *
 * Order is not compared (F-04): legacy order is filesystem-dependent under bun.
 * The registry's order is the explicit array in `src/http/routes/index.ts`.
 */
import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { routeResponses } from '../../src/contract/responses';
import { NotImplementedError } from '../../src/http/errors';
import { routes } from '../../src/http/routes';
import type { AuthorizeSpec } from '../../src/http/types';

const ARTIFACT = path.join(__dirname, '..', '..', '..', '.ai', 'plans', 'server-ts', 'artifacts', 'route-table.txt');
const FIXTURE  = path.join(__dirname, '..', 'characterization', 'fixtures', 'routeTable.txt');

const toOpenApiPath = (p: string) => p.replace(/:(\w+)/g, '{$1}');
const key = (r: { method: string; path: string }) => `${r.method.toUpperCase()} ${r.path}`;

function artifactLines(): string[] {
    return fs.readFileSync(ARTIFACT, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('TOTAL:'))
        .sort();
}

function fixtureEntries(): Array<{ key: string; owner: string; dev: boolean }> {
    return fs.readFileSync(FIXTURE, 'utf8')
        .split('\n')
        .map(l => l.trimEnd())
        .filter(l => l && !l.startsWith('#'))
        .map(l => {
            const [methodAndPath, owner, flag] = l.split('\t');
            return { key: methodAndPath, owner, dev: flag === 'DEV' };
        });
}

/** The legacy table exactly as `ApplicationServer#registerControllers` builds it. */
function legacyLiveTable(): Array<{ key: string; owner: string }> {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { ApplicationServer } = require('../../lib/server/applicationServer');
    const { SystemController }  = require('../../lib/server/systemController');
    const { DocsController }    = require('../../lib/server/docsController');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const classes = [SystemController, DocsController, ...new ApplicationServer().controllerClasses];
    const rows: Array<{ key: string; owner: string }> = [];
    for (const cls of classes) {
        for (const action of cls.actions) rows.push({ key: `${action.method} ${action.path}`, owner: `${cls.name}#${action.action}` });
    }
    return rows;
}

/**
 * THE per-route authorization table, written from the legacy controllers
 * (callbacks + unconditional `authorize()` at the top of each action). See
 * `src/http/types.ts` (AuthorizeSpec) for the expansion of each variant and
 * the route-registry notes for the reasoning per row.
 */
const EXPECTED_AUTHORIZATION: Record<string, { owner: string; authorize: AuthorizeSpec }> = {
    'GET /':                               { owner: 'SystemController#getIndex',                    authorize: { scope: 'none', level: 'public' } },
    'GET /system/healthCheck':             { owner: 'SystemController#getHealthCheck',              authorize: { scope: 'none', level: 'public' } },
    'GET /docs':                           { owner: 'DocsController#getDocs',                       authorize: { scope: 'none', level: 'public' } },
    'GET /docs.json':                      { owner: 'DocsController#getDocsJson',                   authorize: { scope: 'none', level: 'public' } },
    'GET /async-docs.json':                { owner: 'DocsController#getAsyncDocsJson',              authorize: { scope: 'none', level: 'public' } },
    'POST /users':                         { owner: 'UsersController#postIndex',                    authorize: { scope: 'none', level: 'public' } },
    'POST /mats':                          { owner: 'MatsController#postIndex',                     authorize: { scope: 'newMat', level: 'create' } },
    'GET /mat/:matId':                     { owner: 'MatsController#getMat',                        authorize: { scope: 'mat', level: 'view' } },
    'POST /mat/:matCode/join':             { owner: 'UsersController#postJoin',                     authorize: { scope: 'matCode', level: 'public' } },
    'DELETE /mat/:matCode/join':           { owner: 'UsersController#deleteJoin',                   authorize: { scope: 'matCode', level: 'view' } },
    'GET /mat/:matCode/judges':            { owner: 'UsersController#getJudges',                    authorize: { scope: 'matCode', level: 'view' } },
    'GET /mat/:matCode/viewers':           { owner: 'UsersController#getViewers',                   authorize: { scope: 'matCode', level: 'view' } },
    'POST /mat/:matCode/matches':          { owner: 'MatchesController#postIndex',                  authorize: { scope: 'matCode', level: 'create a match' } },
    'GET /match/:matchId':                 { owner: 'MatchesController#getMatch',                   authorize: { scope: 'match', level: 'view' } },
    'POST /match/:matchId/start':          { owner: 'MatchesController#postStartMatch',             authorize: { scope: 'match', level: 'manage' } },
    'POST /match/:matchId/end':            { owner: 'MatchesController#postEndMatch',               authorize: { scope: 'match', level: 'manage' } },
    'POST /match/:matchId/rounds':         { owner: 'RoundsController#postStartRound',              authorize: { scope: 'match', level: 'manage' } },
    'POST /match/:matchId/rounds/end':     { owner: 'RoundsController#postEndRound',                authorize: { scope: 'match', level: 'manage' } },
    'PATCH /match/:matchId/rounds/result': { owner: 'RoundsController#patchRoundResult',            authorize: { scope: 'match', level: 'manage' } },
    'POST /match/:matchId/rounds/pause':   { owner: 'RoundsController#postPauseRound',              authorize: { scope: 'match', level: 'pause' } },
    'POST /match/:matchId/rounds/resume':  { owner: 'RoundsController#postResumeRound',             authorize: { scope: 'match', level: 'pause' } },
    'POST /match/:matchId/ridingTime':     { owner: 'RidingTimeVoteController#postStartRidingTime', authorize: { scope: 'match', level: 'judge', round: 'open' } },
    'DELETE /match/:matchId/ridingTime':   { owner: 'RidingTimeVoteController#deleteEndRidingTime', authorize: { scope: 'match', level: 'judge', round: 'open' } },
};

describe('route registry: route-table parity', () => {
    const declared = routes.map(key).sort();

    it('declares exactly the task-01 baseline (23 routes, `{param}` form)', () => {
        expect(routes.map(r => `${r.method.toUpperCase()} ${toOpenApiPath(r.path)}`).sort()).toEqual(artifactLines());
        expect(routes).toHaveLength(23);
    });

    it('declares exactly the task-02b fixture (raw Express paths), with the same DEV-only set', () => {
        const fixture = fixtureEntries();
        expect(declared).toEqual(fixture.map(e => e.key).sort());
        expect(routes.filter(r => r.devOnly).map(key).sort())
            .toEqual(fixture.filter(e => e.dev).map(e => e.key).sort());
    });

    it('declares exactly what the LIVE legacy router registers, method and path', () => {
        expect(declared).toEqual(legacyLiveTable().map(r => r.key).sort());
    });

    it('has no duplicate (method, path) pairs', () => {
        expect(new Set(declared).size).toBe(declared.length);
    });

    it('uses literal Express paths whose params schema declares exactly the path parameters', () => {
        for (const route of routes) {
            const pathParams = [...route.path.matchAll(/:(\w+)/g)].map(m => m[1]).sort();
            const schemaKeys = Object.keys((route.request.params as { shape?: object }).shape ?? {}).sort();
            expect({ route: key(route), params: schemaKeys }).toEqual({ route: key(route), params: pathParams });
        }
    });
});

describe('route registry: per-route authorization (SECURITY BOUNDARY)', () => {
    it('has an expected authorization for every declared route and no extra rows', () => {
        expect(Object.keys(EXPECTED_AUTHORIZATION).sort()).toEqual(routes.map(key).sort());
    });

    it('maps every route to the legacy controller action that owns it', () => {
        const owners = Object.fromEntries(legacyLiveTable().map(r => [r.key, r.owner]));
        for (const [routeKey, expected] of Object.entries(EXPECTED_AUTHORIZATION)) {
            expect({ routeKey, owner: owners[routeKey] }).toEqual({ routeKey, owner: expected.owner });
        }
    });

    it('declares on every route exactly the authorization its legacy controller enforces', () => {
        for (const route of routes) {
            expect({ route: key(route), authorize: route.authorize })
                .toEqual({ route: key(route), authorize: EXPECTED_AUTHORIZATION[key(route)].authorize });
        }
    });

    it('leaves only the legacy-public routes unauthenticated', () => {
        // Routes that run NO user check before the handler. POST /mat/:matCode/join
        // and GET /mat/:matId are public in legacy (F-15 decided intentional).
        const unauthenticated = routes
            .filter(r => r.authorize.level === 'public' || (r.authorize.scope === 'mat' && r.authorize.level === 'view'))
            .map(key)
            .sort();
        expect(unauthenticated).toEqual([
            'GET /',
            'GET /async-docs.json',
            'GET /docs',
            'GET /docs.json',
            'GET /mat/:matId',
            'GET /system/healthCheck',
            'POST /mat/:matCode/join',
            'POST /users',
        ]);
    });
});

describe('route registry: response schemas and placeholders', () => {
    it('uses the task-05 success envelope from `routeResponses` for every envelope route', () => {
        for (const route of routes.filter(r => r.render === 'envelope')) {
            const contractKey = `${route.method.toUpperCase()} ${toOpenApiPath(route.path)}` as keyof typeof routeResponses;
            expect(routeResponses[contractKey]).toBeDefined();
            expect(route.response === routeResponses[contractKey]).toBe(true);
        }
    });

    it('renders the DEV-only docs routes raw (json/html), not enveloped', () => {
        expect(Object.fromEntries(routes.filter(r => r.render !== 'envelope').map(r => [key(r), r.render]))).toEqual({
            'GET /async-docs.json': 'json',
            'GET /docs':            'html',
            'GET /docs.json':       'json',
        });
    });

    it('carries a NOT-IMPLEMENTED placeholder handler on every route (ported in 13a/13b/13c)', async () => {
        for (const route of routes) {
            let thrown: unknown;
            try {
                await route.handler({} as never);
            } catch (err) {
                thrown = err;
            }
            expect(thrown).toBeInstanceOf(NotImplementedError);
        }
    });
});

describe('route registry: no reflection', () => {
    function sourceFiles(dir: string): string[] {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
            const full = path.join(dir, entry.name);
            return entry.isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
        });
    }

    it('src/http has no readdirSync, prototype scanning or string-keyed method dispatch', () => {
        const files = sourceFiles(path.join(__dirname, '..', '..', 'src', 'http'));
        expect(files.length).toBeGreaterThan(5);
        for (const file of files) {
            const code = fs.readFileSync(file, 'utf8')
                // comments may NAME the legacy mechanisms; only code is checked
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^\s*\/\/.*$/gm, '');
            expect({ file, readdir: /readdir/.test(code) }).toEqual({ file, readdir: false });
            expect({ file, proto: /getOwnPropertyNames|\.prototype\b/.test(code) }).toEqual({ file, proto: false });
            expect({ file, dispatch: /\[\s*['"`]_['"`]\s*\+|app\[\s*\w+\s*\]/.test(code) }).toEqual({ file, dispatch: false });
        }
    });
});
