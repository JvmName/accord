import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
/**
 * The Socket.IO tier (src/ws) over real sockets, against the `webSocketTier`
 * snapshot fixture: what every client script observes (connected or not, the
 * connect_error message, which room broadcasts reached it), how the throwing
 * `match.join` handler calls fail, and how a token or match id of every JSON
 * type is looked up. See ./webSocketScripts.ts and
 * test/fixtures/frozen/README.md.
 */
import * as H from '../services/support';
import * as F from '../support/frozen';
import * as W from './webSocketScripts';
import { createDb, migrateDb } from '../../src/db';

let db;
let tier;
let records;
let fixture;

beforeAll(async () => {
    db = createDb({ path: ':memory:' });
    migrateDb(db);
    H.installAudit(db.$client);
    W.seedRows((table, rows) => H.insertRaw(db.$client, table, rows));
    tier = await W.modernTier(db);
    records = new Map((await W.recordTier(tier)).map((r) => [r.key, F.asStored(r)]));
    fixture = F.readFixture('webSocketTier');
}, 60000);

afterAll(() => {
    tier?.close();
    if (db) db.$client.close();
});

const expectSection = (prefix, count) => {
    const keys = [...fixture.records.keys()].filter((k) => k.startsWith(prefix));
    expect(keys).toHaveLength(count);
    expect(keys.map((key) => ({ key, record: records.get(key) }))).toEqual(keys.map((key) => ({ key, record: fixture.records.get(key) })));
};

describe('webSocketTier snapshot: src/ws', () => {
    it('the fixture holds exactly the scripts, handler cases and lookups defined', () => {
        expect([...fixture.records.keys()].sort()).toEqual([...records.keys()].sort());
        expect(fixture.records.size).toBe(W.SCRIPTS.length + 1 + W.HANDLER_CASES.length + W.TOKEN_VALUES.length + W.MATCH_VALUES.length);
    });

    it('every client script observes the recorded transcript', () => {
        expectSection('script ', W.SCRIPTS.length);

        // Not vacuous: the scripts reach every outcome.
        const seen = (name) => {
            const { key, ...rest } = fixture.records.get(`script ${name}`);
            return rest;
        };
        const everything = ['match.update:the match', 'round.tech-fall:the match', 'break.ended:the match'];
        const refused = { connected: false, connectError: 'unauthorized', received: [] };
        expect(seen('a judge joins the match').received).toEqual(everything);
        expect(seen('connected but not joined').received).toEqual([]);
        expect(seen('join then leave').received).toEqual([]);
        expect(seen('join with an object does not stop the socket').received).toEqual(everything);
        expect(seen('room.join is not a handler').received).toEqual([]);
        expect(seen('client token AND worker token: treated as a client').received).toEqual(everything);
        for (const name of ['unknown token is refused', 'unknown token, connect only', 'no token is refused', 'empty-string token is no token',
            'array token [token] is refused', 'array token [] is refused', 'object token is refused', 'true token is refused',
            'wrong worker token is refused', 'non-string worker token is refused']) {
            expect(seen(name)).toEqual(refused);
        }
        expect(seen('worker socket: room.join is not a handler')).toEqual({ connected: true, connectError: null, received: [] });
    }, 60000);

    it('a handler call never throws: unknown tokens are refused at init, bad arguments are denied', () => {
        expectSection('handler ', W.HANDLER_CASES.length);
        expect([...fixture.records.values()].filter((r) => r.key.startsWith('handler ') && !r.outcome.ok)).toEqual([]);
        expect(fixture.records.get('init unknown token').outcome).toEqual({ error: 'SocketAuthError', message: 'unauthorized' });
    });

    it('token lookups: findUserForToken answers as recorded for every JSON type', () => {
        expectSection('token ', W.TOKEN_VALUES.length);
    });

    it('match lookups: findMatchForId answers as recorded for every JSON type', () => {
        expectSection('match ', W.MATCH_VALUES.length);
    });
});
