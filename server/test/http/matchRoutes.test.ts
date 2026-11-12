/**
 * Match, round and riding-time routes served by the running application:
 * behavior the contract goldens do not cover, kept exactly as the legacy
 * controllers had it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import net from 'net';

/* eslint-disable @typescript-eslint/no-require-imports */
import * as Http from '../helpers/httpServer';
// Before anything opens a database connection.
Http.useTemporaryDatabase('accord-match-routes');
/* eslint-enable @typescript-eslint/no-require-imports */

const UNKNOWN_ID = '11111111-2222-4333-8444-555555555555';

let booted: { server: any; origin: string; port: number };
let request: (method: string, path: string, options?: { token?: string; body?: unknown }) => Promise<{ status: number; body: any }>;

async function createUser(name: string): Promise<string> {
    const res = await request('POST', '/users', { body: { name } });
    expect(res.status).toBe(200);
    return res.body.data.api_token;
}

/** A mat with one or two judges and a match on it, created by `master`. */
async function createMatch(judgeCount: 1 | 2) {
    const master = await createUser('master');
    const judges = [await createUser('judge a'), await createUser('judge b')].slice(0, judgeCount);
    const mat = (await request('POST', '/mats', { token: master, body: { name: 'Mat' } })).body.data.mat;
    const adminCode = mat.codes.find((c: { role: string }) => c.role === 'admin').code;
    for (const judge of judges) expect((await request('POST', `/mat/${adminCode}/join`, { token: judge })).status).toBe(200);
    const created = await request('POST', `/mat/${adminCode}/matches`, { token: master, body: { red: { name: 'Red' }, blue: { name: 'Blue' } } });
    expect(created.status).toBe(200);
    return { master, judges, adminCode, match: created.body.data.match };
}

beforeAll(async () => {
    await Http.migrate();
    booted = await Http.startServer();
    request = Http.makeClient(booted.origin);
}, 30000);

afterAll(() => booted?.server.close());

describe('match routes', () => {
    const userCount = () => booted.server.db.$client.query('SELECT count(*) AS n FROM users').get().n;

    it('answers 400 for a competitor id that is not a UUID string, and creates nobody (F-91)', async () => {
        const { master, adminCode } = await createMatch(1);
        const usersBefore = userCount();

        for (const [color, id] of [['red', true], ['red', { a: 1 }], ['red', [1, 2]], ['red', 5], ['blue', 'not-a-uuid']] as const) {
            const body = color === 'red' ? { red: { id }, blue: { name: 'B' } } : { red: { name: 'R' }, blue: { id } };
            const res = await request('POST', `/mat/${adminCode}/matches`, { token: master, body });
            expect(res).toEqual({ status: 400, body: { data: { errors: { [`${color}.id`]: ['must be a UUID'] } }, status: 'bad request' } });
        }
        expect(userCount()).toBe(usersBefore);
    });

    it('answers 401 for an unknown competitor id, and creates nobody even when the other competitor is new (F-91)', async () => {
        const { master, adminCode } = await createMatch(1);
        const usersBefore = userCount();

        for (const body of [
            { red: { id: UNKNOWN_ID }, blue: { name: 'B' } },
            { red: { name: 'Created before the refusal' }, blue: { id: UNKNOWN_ID } },
        ]) {
            const res = await request('POST', `/mat/${adminCode}/matches`, { token: master, body });
            expect(res).toEqual({ status: 401, body: { data: null, status: 'unauthorized' } });
        }
        expect(userCount()).toBe(usersBefore);
    });

    it('treats a blank competitor name as missing', async () => {
        const { master, adminCode } = await createMatch(1);
        const res = await request('POST', `/mat/${adminCode}/matches`, { token: master, body: { red: { name: '' }, blue: { name: 'B' } } });
        expect(res).toEqual({ status: 400, body: { data: { errors: { red: ['id or name required'] } }, status: 'bad request' } });
    });

    it('ending the match during the final round ends it and answers 200 (F-54)', async () => {
        const { master, match } = await createMatch(1);
        expect((await request('POST', `/match/${match.id}/start`, { token: master })).status).toBe(200);
        for (let round = 1; round < 3; round++) {
            expect((await request('POST', `/match/${match.id}/rounds/end`, { token: master })).status).toBe(200);
            expect((await request('POST', `/match/${match.id}/rounds`, { token: master })).status).toBe(200);
        }

        const ended = await request('POST', `/match/${match.id}/end`, { token: master });
        expect(ended.status).toBe(200);
        expect(ended.body.data.match.ended_at).not.toBeNull();
        expect(ended.body.data.match.break_started_at).toBeNull();

        const after = (await request('GET', `/match/${match.id}`, { token: master })).body.data.match;
        expect(after.ended_at).not.toBeNull();
        expect(after.rounds).toHaveLength(3);
        expect(after.rounds.every((round: { ended_at: string | null }) => round.ended_at !== null)).toBe(true);
    });

    it('refuses to open a round on a match that has not started (F-56)', async () => {
        const { master, match } = await createMatch(1);

        const res = await request('POST', `/match/${match.id}/rounds`, { token: master });
        expect(res).toEqual({ status: 400, body: { data: { errors: { matchId: ['Cannot start a round on a match that has not started'] } }, status: 'bad request' } });

        const after = (await request('GET', `/match/${match.id}`, { token: master })).body.data.match;
        expect(after.rounds).toHaveLength(0);
    });

    it('refuses to open a round on a match that has ended (F-56)', async () => {
        const { master, match } = await createMatch(1);
        expect((await request('POST', `/match/${match.id}/start`, { token: master })).status).toBe(200);
        expect((await request('POST', `/match/${match.id}/end`, { token: master })).status).toBe(200);

        const res = await request('POST', `/match/${match.id}/rounds`, { token: master });
        expect(res).toEqual({ status: 400, body: { data: { errors: { matchId: ['Cannot start a round on a match that has ended'] } }, status: 'bad request' } });
        expect((await request('GET', `/match/${match.id}`, { token: master })).body.data.match.rounds).toHaveLength(1);
    });

    it('omits `judges` from round and riding-time payloads, unlike GET/start/end', async () => {
        const { master, judges, match } = await createMatch(2);
        const started = await request('POST', `/match/${match.id}/start`, { token: master });
        expect(started.body.data.match.judges).toHaveLength(2);

        const vote = await request('POST', `/match/${match.id}/ridingTime`, { token: judges[0], body: { rider: 'red' } });
        const paused = await request('POST', `/match/${match.id}/rounds/pause`, { token: master });
        for (const res of [vote, paused]) {
            expect(res.status).toBe(200);
            expect('judges' in res.body.data.match).toBe(false);
            expect(res.body.data.match.rounds).toHaveLength(1);
            expect(res.body.data.match.mat).toBeDefined();
        }
        expect((await request('GET', `/match/${match.id}`, { token: master })).body.data.match.judges).toHaveLength(2);
    });

    it('ends the judge\'s open vote whatever `rider` says', async () => {
        const { master, judges, match } = await createMatch(1);
        expect((await request('POST', `/match/${match.id}/start`, { token: master })).status).toBe(200);
        expect((await request('POST', `/match/${match.id}/ridingTime`, { token: judges[0], body: { rider: 'red' } })).status).toBe(200);

        expect((await request('DELETE', `/match/${match.id}/ridingTime?rider=blue`, { token: judges[0] })).status).toBe(200);
        const again = await request('DELETE', `/match/${match.id}/ridingTime?rider=red`, { token: judges[0] });
        expect(again).toEqual({ status: 400, body: { data: { errors: { matchId: ['Riding time is not active'] } }, status: 'bad request' } });
    });

    it('keeps a keep-alive connection usable after a 404 for an unknown match', async () => {
        const token = await createUser('keep-alive');
        const socket = net.connect(booted.port, '127.0.0.1');
        let received = '';
        let closed = false;
        socket.on('data', chunk => { received += chunk; });
        socket.on('close', () => { closed = true; });
        await new Promise(resolve => socket.on('connect', resolve));

        const waitFor = async (count: number) => {
            for (let i = 0; i < 100 && (received.match(/HTTP\/1\.1 \d+/g) ?? []).length < count && !closed; i++) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };

        socket.write(`GET /match/${UNKNOWN_ID} HTTP/1.1\r\nHost: test\r\nx-api-token: ${token}\r\nConnection: keep-alive\r\n\r\n`);
        await waitFor(1);
        // Give a socket teardown (what the legacy double render caused) time to land.
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(closed).toBe(false);

        const body = JSON.stringify({ name: 'same socket' });
        socket.write(`POST /users HTTP/1.1\r\nHost: test\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`);
        await waitFor(2);
        socket.destroy();

        expect(received.match(/HTTP\/1\.1 \d+/g)).toEqual(['HTTP/1.1 404', 'HTTP/1.1 200']);
    });
});
