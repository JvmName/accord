const { afterAll, beforeAll, describe, expect, it } = require('bun:test');
/**
 * The Socket.IO tier (src/ws) over real sockets, against the `webSocketTier`
 * snapshot fixture: what every client script observes (connected or not, the
 * connect_error message, which room broadcasts reached it), how the throwing
 * `match.join` handler calls fail, and how a token or match id of every JSON
 * type is looked up. See ./webSocketScripts.js and
 * test/fixtures/frozen/README.md.
 */
const H = require('../services/support');
const F = require('../support/frozen');
const W = require('./webSocketScripts');
const { createDb, migrateDb } = require('../../src/db');

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
        expect(fixture.records.size).toBe(W.SCRIPTS.length + W.HANDLER_CASES.length + W.TOKEN_VALUES.length + W.MATCH_VALUES.length);
    });

    it('every client script observes the recorded transcript', () => {
        expectSection('script ', 25);

        // Not vacuous: the scripts reach every outcome.
        const seen = (name) => {
            const { key, ...rest } = fixture.records.get(`script ${name}`);
            return rest;
        };
        expect(seen('a judge joins the match').received).toEqual(['match.update:the match', 'round.tech-fall:the match', 'break.ended:the match']);
        expect(seen('connected but not joined').received).toEqual([]);
        expect(seen('join then leave').received).toEqual([]);
        expect(seen('unknown token still connects; room.join works').received).toHaveLength(3);
        expect(seen('no token: connects, has no handlers')).toEqual({ connected: true, connectError: null, received: [] });
        expect(seen('object token: connect_error')).toEqual({ connected: false, connectError: 'Invalid value {}', received: [] });
        expect(seen('array token [junk, token]').received).toHaveLength(3);
    }, 60000);

    it('handler calls that throw do so as recorded (each would be an unhandled rejection in the web process)', () => {
        expectSection('handler ', 7);
        expect([...fixture.records.values()].filter((r) => r.key.startsWith('handler ') && !r.outcome.ok).map((r) => r.key.slice('handler '.length))).toEqual([
            'unknown token, existing match', 'valid token, true', 'valid token, object', 'valid token, array', 'valid token, empty array',
        ]);
    });

    it('token lookups: findUserForToken answers as recorded for every JSON type', () => {
        expectSection('token ', 24);
    });

    it('match lookups: findMatchForId answers as recorded for every JSON type', () => {
        expectSection('match ', 12);
    });
});
