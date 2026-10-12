/**
 * Test harness for the task-12 route registry. Not a test file.
 *
 * Mounts the REAL route definitions (`src/http/routes`), with their real
 * authorization specs, request schemas and middleware, on a throwaway Express
 * app over a scratch IN-MEMORY Drizzle database (created from the Drizzle
 * baseline). Only the HANDLERS are replaced: every route gets a stub (the
 * real handlers are ported in 13a/13b). No real sqlite file is touched and
 * Sequelize is never involved.
 *
 * The app installs the same global body parsing the legacy app does
 * (`legacyBodyParsers()`), so the request reaching the registry is shaped as
 * it will be in production.
 */
import express from 'express';
import type { AddressInfo } from 'net';
import { createDb, migrateDb, type Db } from '../../../src/db';
import { addMatJudge, addMatViewer, insertMat } from '../../../src/db/repositories/mats';
import { insertMatCode } from '../../../src/db/repositories/matCodes';
import { insertMatch, setMatchJudges, updateMatch } from '../../../src/db/repositories/matches';
import { insertRound, updateRound } from '../../../src/db/repositories/rounds';
import { insertUser } from '../../../src/db/repositories/users';
import type { Mat, Match, User } from '../../../src/db/types';
import { legacyBodyParsers, registerRoutes } from '../../../src/http/router';
import { routes as declaredRoutes } from '../../../src/http/routes';
import type { AnyRouteDefinition } from '../../../src/http/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { makeClient } = require('../../helpers/httpServer');

export type Request = (method: string, path: string, options?: { token?: string; body?: unknown; headers?: Record<string, string> }) =>
    Promise<{ status: number; body: any }>;

export const routeKey = (r: { method: string; path: string }) => `${r.method.toUpperCase()} ${r.path}`;

/** Default stub: reached the handler -> 200 `{ data: { reached: '<METHOD path>' }, status: 'ok' }`. */
export function reachedStub(route: AnyRouteDefinition): AnyRouteDefinition['handler'] {
    return async () => ({ reached: routeKey(route) });
}

export interface RegistryApp {
    db: Db;
    origin: string;
    request: Request;
    close(): void;
}

/**
 * Starts an app with every declared route registered. `handlers` overrides
 * the stub of individual routes, keyed `'METHOD /express/path'`.
 */
export async function startRegistryApp(options: {
    handlers?: Record<string, AnyRouteDefinition['handler']>;
    routes?: readonly AnyRouteDefinition[];
    dev?: boolean;
} = {}): Promise<RegistryApp> {
    const db = createDb({ path: ':memory:' });
    migrateDb(db);

    // Declared routes get stub handlers (their real handlers are placeholders);
    // routes passed in explicitly keep their own handlers.
    const stubbed = (options.routes ?? declaredRoutes).map(route => ({
        ...route,
        handler: options.handlers?.[routeKey(route)] ?? (options.routes ? route.handler : reachedStub(route)),
    })) as AnyRouteDefinition[];

    const app = express();
    app.use(...legacyBodyParsers());
    registerRoutes(app, stubbed, { db, dev: options.dev ?? false });

    const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    return {
        db,
        origin,
        request: makeClient(origin),
        close: () => {
            server.close();
            server.closeAllConnections();
            db.$client.close();
        },
    };
}

// ---------------------------------------------------------------------------
// Fixture builders (repositories only; the legacy equivalents are the HTTP
// calls in test/characterization/authorization.test.js#createWorld).
// ---------------------------------------------------------------------------

let counter = 0;

export async function createUser(db: Db, label: string): Promise<User> {
    return await insertUser(db, { name: `${label}-${++counter}` });
}

export interface World {
    creator: User;
    judge: User;
    viewer: User;
    outsider: User;
    mat: Mat;
    adminCode: string;
    viewerCode: string;
}

/**
 * The task-02b world: creator (mat.creator_id), judge (joined with the ADMIN
 * code -> mat judge), viewer (joined with the VIEWER code), outsider.
 */
export async function createWorld(db: Db): Promise<World> {
    const creator  = await createUser(db, 'creator');
    const judge    = await createUser(db, 'judge');
    const viewer   = await createUser(db, 'viewer');
    const outsider = await createUser(db, 'outsider');

    const n   = ++counter;
    const mat = await insertMat(db, { name: `Mat ${n}`, creator_id: creator.id });
    const adminCode  = `admin.code.w${n}`;
    const viewerCode = `viewer.code.w${n}`;
    await insertMatCode(db, { mat_id: mat.id, code: adminCode,  role: 'admin' });
    await insertMatCode(db, { mat_id: mat.id, code: viewerCode, role: 'viewer' });

    await addMatJudge(db, mat.id, judge.id);
    await addMatViewer(db, mat.id, viewer.id);

    return { creator, judge, viewer, outsider, mat, adminCode, viewerCode };
}

/** A created, NOT started match on the world's mat. */
export async function createMatch(db: Db, world: World): Promise<Match> {
    const red  = await createUser(db, 'red');
    const blue = await createUser(db, 'blue');
    return await insertMatch(db, {
        mat_id:             world.mat.id,
        creator_id:         world.creator.id,
        red_competitor_id:  red.id,
        blue_competitor_id: blue.id,
    });
}

/**
 * A started match with round 1 open, its judges copied from the mat, as
 * `Match#start` leaves it.
 */
export async function createStartedMatch(db: Db, world: World): Promise<Match> {
    const match = await createMatch(db, world);
    await updateMatch(db, match.id, { started_at: new Date() });
    await setMatchJudges(db, match.id, [world.judge.id]);
    await insertRound(db, { match_id: match.id });
    return match;
}

/** A started match whose only round has ended (no open round). */
export async function createMatchWithEndedRound(db: Db, world: World): Promise<Match> {
    const match = await createMatch(db, world);
    await updateMatch(db, match.id, { started_at: new Date() });
    await setMatchJudges(db, match.id, [world.judge.id]);
    const round = await insertRound(db, { match_id: match.id });
    await updateRound(db, round.id, { ended_at: new Date() });
    return match;
}
