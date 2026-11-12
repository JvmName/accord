/**
 * Request validation over HTTP, with the request bodies the Kotlin client
 * sends and the malformed ones it never does. `encodeDefaults` is off in the
 * client's JSON, so null defaults (`winner`, `competitor.id`) are omitted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/* eslint-disable @typescript-eslint/no-require-imports */
import * as Http from '../helpers/httpServer';
// Before anything opens a database connection.
Http.useTemporaryDatabase('accord-request-validation');
/* eslint-enable @typescript-eslint/no-require-imports */

let booted: { server: any; origin: string; port: number };
let request: (method: string, path: string, options?: { token?: string; body?: unknown }) => Promise<{ status: number; body: any }>;

const errorsOf = (res: { status: number; body: any }) => ({ status: res.status, errors: res.body.data?.errors });

async function newUser(name = 'master'): Promise<string> {
    return (await request('POST', '/users', { body: { name } })).body.data.api_token;
}

async function newMatch(token: string) {
    const mat = (await request('POST', '/mats', { token, body: { name: 'Mat 1', judge_count: 1 } })).body.data.mat;
    const adminCode = mat.codes.find((c: { role: string }) => c.role === 'admin').code;
    const created = await request('POST', `/mat/${adminCode}/matches`, { token, body: { red: { name: 'Red' }, blue: { name: 'Blue' } } });
    return { mat, adminCode, match: created.body.data.match };
}

beforeAll(async () => {
    await Http.migrate();
    booted = await Http.startServer();
    request = Http.makeClient(booted.origin);
}, 30000);

afterAll(() => booted?.server.close());

describe('POST /users', () => {
    it('creates a user and renders the stored row', async () => {
        const res = await request('POST', '/users', { body: { name: 'Ada' } });
        expect(res.status).toBe(200);
        expect(res.body.data.user).toEqual({ id: expect.any(String), name: 'Ada' });
        expect(res.body.data.api_token).toEqual(expect.any(String));
    });

    it('refuses a name that is not a non-empty string', async () => {
        expect(errorsOf(await request('POST', '/users', { body: {} }))).toEqual({ status: 400, errors: { name: ['required'] } });
        expect(errorsOf(await request('POST', '/users', { body: { name: { nested: true } } }))).toEqual({ status: 400, errors: { name: ['must be a string'] } });
        expect(errorsOf(await request('POST', '/users', { body: { name: 5 } }))).toEqual({ status: 400, errors: { name: ['must be a string'] } });
    });
});

describe('POST /mats', () => {
    it('creates a mat with the judge count the client sent (1-3)', async () => {
        const token = await newUser();
        for (const judgeCount of [1, 2, 3]) {
            const res = await request('POST', '/mats', { token, body: { name: 'Mat 1', judge_count: judgeCount } });
            expect(res.status).toBe(200);
            expect(res.body.data.mat.judge_count).toBe(judgeCount);
            expect(res.body.data.mat.name).toBe('Mat 1');
        }
    });

    it('defaults a missing judge_count to the integer 1, not the string "1"', async () => {
        const token = await newUser();
        const res = await request('POST', '/mats', { token, body: { name: 'No count' } });
        expect(res.status).toBe(200);
        expect(res.body.data.mat.judge_count).toBe(1);
    });

    it('refuses a missing name and a judge_count that is not an integer >= 1', async () => {
        const token = await newUser();
        expect(errorsOf(await request('POST', '/mats', { token, body: {} }))).toEqual({ status: 400, errors: { name: ['required'] } });
        for (const judge_count of [0, -1, 1.5, '2', null, {}, [1]]) {
            expect(errorsOf(await request('POST', '/mats', { token, body: { name: 'M', judge_count } })))
                .toEqual({ status: 400, errors: { judge_count: ['must be an integer greater than or equal to 1'] } });
        }
        expect(errorsOf(await request('POST', '/mats', { token, body: { name: {} } }))).toEqual({ status: 400, errors: { name: ['must be a string'] } });
    });
});

describe('POST /mat/:matCode/join', () => {
    it('joins a blank or missing name as Anonymous (the join screen can send an empty name)', async () => {
        const { adminCode } = await newMatch(await newUser());
        for (const body of [{ name: '' }, {}]) {
            const res = await request('POST', `/mat/${adminCode}/join`, { body });
            expect(res.status).toBe(200);
            expect(res.body.data.user.name).toBe('Anonymous');
        }
        const named = await request('POST', `/mat/${adminCode}/join`, { body: { name: 'Grace' } });
        expect(named.body.data.user.name).toBe('Grace');
    });

    it('refuses a name that is not a string', async () => {
        const { adminCode } = await newMatch(await newUser());
        for (const name of [5, {}, ['x'], null]) {
            expect(errorsOf(await request('POST', `/mat/${adminCode}/join`, { body: { name } })))
                .toEqual({ status: 400, errors: { name: ['must be a string'] } });
        }
    });
});

describe('POST /mat/:matCode/matches', () => {
    it('accepts the bodies the client sends: names, and existing users by id with name omitted', async () => {
        const master = await newUser();
        const { adminCode } = await newMatch(master);
        const other = await request('POST', '/users', { body: { name: 'Existing' } });
        const byId = await request('POST', `/mat/${adminCode}/matches`, {
            token: master, body: { red: { id: other.body.data.user.id }, blue: { name: 'Blue' } },
        });
        expect(byId.status).toBe(200);
        expect(byId.body.data.match.red_competitor).toEqual({ id: other.body.data.user.id, name: 'Existing' });
    });

    it('treats an upper-case UUID as a well-formed id, looked up as written (unknown here: 401)', async () => {
        const master = await newUser();
        const { adminCode } = await newMatch(master);
        const other = await request('POST', '/users', { body: { name: 'Shouty' } });
        const res = await request('POST', `/mat/${adminCode}/matches`, {
            token: master, body: { red: { id: other.body.data.user.id.toUpperCase() }, blue: { name: 'B' } },
        });
        expect(res.status).toBe(401);
    });
});

describe('PATCH /match/:matchId/rounds/result', () => {
    async function inBreak() {
        const master = await newUser();
        const { match } = await newMatch(master);
        expect((await request('POST', `/match/${match.id}/start`, { token: master })).status).toBe(200);
        expect((await request('POST', `/match/${match.id}/rounds/end`, { token: master })).status).toBe(200);
        return { master, match };
    }

    it('accepts what the client sends: stoppage alone, or a winner with a boolean stoppage', async () => {
        const { master, match } = await inBreak();
        for (const body of [{ stoppage: false }, { winner: 'red', stoppage: false }, { winner: 'blue', stoppage: true }]) {
            expect((await request('PATCH', `/match/${match.id}/rounds/result`, { token: master, body })).status).toBe(200);
        }
    });

    it('treats winner: null like an omitted winner (it clears the result)', async () => {
        const { master, match } = await inBreak();
        expect((await request('PATCH', `/match/${match.id}/rounds/result`, { token: master, body: { winner: 'red', stoppage: false } })).status).toBe(200);
        const cleared = await request('PATCH', `/match/${match.id}/rounds/result`, { token: master, body: { winner: null, stoppage: false } });
        expect(cleared.status).toBe(200);
        expect(cleared.body.data.match.rounds[0].result.winner).toBeNull();
    });

    it('refuses a winner that is not red or blue and a stoppage that is not a boolean', async () => {
        const { master, match } = await inBreak();
        expect(errorsOf(await request('PATCH', `/match/${match.id}/rounds/result`, { token: master, body: { winner: 'green' } })))
            .toEqual({ status: 400, errors: { winner: ['must be one of [red, blue]'] } });
        for (const stoppage of ['yes', 'true', 1, 0, {}, null]) {
            expect(errorsOf(await request('PATCH', `/match/${match.id}/rounds/result`, { token: master, body: { winner: 'red', stoppage } })))
                .toEqual({ status: 400, errors: { stoppage: ['must be a boolean'] } });
        }
    });
});

describe('path parameters are the only way to address a resource (F-73)', () => {
    it('ignores matId / matCode / matchId in the query and the body', async () => {
        const master = await newUser();
        const { mat, match } = await newMatch(master);
        const other = await newMatch(await newUser('other master'));

        const viaQuery = await request('GET', `/mat/${mat.id}?matId=${other.mat.id}`);
        expect(viaQuery.body.data.mat.id).toBe(mat.id);

        const matchViaQuery = await request('GET', `/match/${match.id}?matchId=${other.match.id}`, { token: master });
        expect(matchViaQuery.body.data.match.id).toBe(match.id);

        const leave = await request('DELETE', `/mat/${other.adminCode}/join?matCode=&matId=${mat.id}`, { token: master });
        // It used to answer 500 with an engine TypeError (F-84); it now acts on the path code only.
        expect(leave.status).not.toBe(500);
    });

    it('does not JSON-decode string values in the body', async () => {
        const res = await request('POST', '/users', { body: { name: '{"a":1}' } });
        expect(res.status).toBe(200);
        expect(res.body.data.user.name).toBe('{"a":1}');
    });
});
