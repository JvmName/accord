/**
 * Routes that write several rows leave nothing behind when a later write
 * fails. The failure is forced with a trigger on the test database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/* eslint-disable @typescript-eslint/no-require-imports */
import * as Http from '../helpers/httpServer';
// Before anything opens a database connection.
Http.useTemporaryDatabase('accord-atomic-routes');
/* eslint-enable @typescript-eslint/no-require-imports */

let booted: { server: any; origin: string; port: number };
let request: (method: string, path: string, options?: { token?: string; body?: unknown }) => Promise<{ status: number; body: any }>;

const sql = () => booted.server.db.$client;
const count = (table: string): number => sql().query(`SELECT count(*) AS n FROM ${table}`).get().n;

async function createUser(name: string): Promise<string> {
    return (await request('POST', '/users', { body: { name } })).body.data.api_token;
}

beforeAll(async () => {
    await Http.migrate();
    booted = await Http.startServer();
    request = Http.makeClient(booted.origin);
}, 30000);

afterAll(() => booted?.server.close());

describe('a route whose later write fails', () => {
    it('POST /mats leaves no mat behind when a code cannot be written', async () => {
        const token = await createUser('creator');
        const mats  = count('mats');
        sql().run("CREATE TRIGGER fail_viewer_code BEFORE INSERT ON mat_codes WHEN NEW.role = 'viewer' BEGIN SELECT RAISE(ABORT, 'forced'); END");
        try {
            const res = await request('POST', '/mats', { token, body: { name: 'Mat' } });
            expect(res.status).not.toBe(200);
        } finally {
            sql().run('DROP TRIGGER fail_viewer_code');
        }

        expect(count('mats')).toBe(mats);
        expect(count('mat_codes')).toBe(0);
    });

    it('POST /match/:id/start leaves the match unstarted when its first round cannot be written', async () => {
        const master = await createUser('master');
        const mat    = (await request('POST', '/mats', { token: master, body: { name: 'Mat' } })).body.data.mat;
        const code   = mat.codes.find((c: { role: string }) => c.role === 'admin').code;
        const judge  = await createUser('judge');
        expect((await request('POST', `/mat/${code}/join`, { token: judge })).status).toBe(200);
        const match  = (await request('POST', `/mat/${code}/matches`, { token: master, body: { red: { name: 'R' }, blue: { name: 'B' } } })).body.data.match;

        sql().run('CREATE TRIGGER fail_round BEFORE INSERT ON rounds BEGIN SELECT RAISE(ABORT, \'forced\'); END');
        try {
            const res = await request('POST', `/match/${match.id}/start`, { token: master });
            expect(res.status).not.toBe(200);
        } finally {
            sql().run('DROP TRIGGER fail_round');
        }

        const row = sql().query('SELECT started_at FROM matches WHERE id = ?').get(match.id);
        expect(row.started_at).toBeNull();
        expect(count('judges_matches')).toBe(0);
    });
});
