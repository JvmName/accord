/**
 * Match, round and riding-time routes served by the running application:
 * behavior the contract goldens do not cover, kept exactly as the legacy
 * controllers had it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import net from 'net';

/* eslint-disable @typescript-eslint/no-require-imports */
const Http = require('../helpers/httpServer');
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
    it('answers 500 for a competitor id that is neither a string nor a number, after creating a competitor given by name', async () => {
        const { master, adminCode } = await createMatch(1);
        const usersBefore = booted.server.db.$client.query('SELECT count(*) AS n FROM users').get().n;

        for (const [red, blue, message] of [
            [{ id: true }, { name: 'B' }, 'Argument passed to findByPk is invalid: true'],
            [{ id: { a: 1 } }, { name: 'B' }, 'Argument passed to findByPk is invalid: [object Object]'],
            [{ id: [1, 2] }, { name: 'B' }, 'Argument passed to findByPk is invalid: 1,2'],
            [{ name: 'Created anyway' }, { id: true }, 'Argument passed to findByPk is invalid: true'],
        ] as const) {
            const res = await request('POST', `/mat/${adminCode}/matches`, { token: master, body: { red, blue } });
            expect(res).toEqual({ status: 500, body: { data: { error: message }, status: 'server error' } });
        }

        const usersAfter = booted.server.db.$client.query('SELECT count(*) AS n FROM users').get().n;
        expect(usersAfter - usersBefore).toBe(1);
    });

    it('answers 401 for an unknown or numeric competitor id', async () => {
        const { master, adminCode } = await createMatch(1);
        for (const red of [{ id: UNKNOWN_ID }, { id: 5 }]) {
            const res = await request('POST', `/mat/${adminCode}/matches`, { token: master, body: { red, blue: { name: 'B' } } });
            expect(res).toEqual({ status: 401, body: { data: null, status: 'unauthorized' } });
        }
    });

    it('ending the match during the final round writes the end and then answers 500', async () => {
        const { master, match } = await createMatch(1);
        expect((await request('POST', `/match/${match.id}/start`, { token: master })).status).toBe(200);
        for (let round = 1; round < 3; round++) {
            expect((await request('POST', `/match/${match.id}/rounds/end`, { token: master })).status).toBe(200);
            expect((await request('POST', `/match/${match.id}/rounds`, { token: master })).status).toBe(200);
        }

        const ended = await request('POST', `/match/${match.id}/end`, { token: master });
        expect(ended).toEqual({ status: 500, body: { data: { error: 'This match has already ended' }, status: 'server error' } });

        const after = (await request('GET', `/match/${match.id}`, { token: master })).body.data.match;
        expect(after.ended_at).not.toBeNull();
        expect(after.rounds).toHaveLength(3);
        expect(after.rounds.every((round: { ended_at: string | null }) => round.ended_at !== null)).toBe(true);
    });

    it('starting a match whose round was opened before the start answers 500 after writing the start', async () => {
        const { master, match } = await createMatch(1);
        expect((await request('POST', `/match/${match.id}/rounds`, { token: master })).status).toBe(200);

        const started = await request('POST', `/match/${match.id}/start`, { token: master });
        expect(started).toEqual({ status: 500, body: { data: { error: 'Cannot start a new round while there is an active round' }, status: 'server error' } });

        const after = (await request('GET', `/match/${match.id}`, { token: master })).body.data.match;
        expect(after.started_at).not.toBeNull();
        expect(after.judges).toHaveLength(1);
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
