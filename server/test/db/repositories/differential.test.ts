import { afterAll, beforeAll, describe, expect, it, setSystemTime } from 'bun:test';
/**
 * The Drizzle repositories' reads over the contract seed against the
 * `repositories` snapshot fixture: content and order of every result, and
 * `undefined` vs `null` for a missing row (see ./differentialQueries.ts and
 * test/fixtures/frozen/README.md).
 */
import { createDb, migrateDb } from '../../../src/db';
import * as Matches from '../../../src/db/repositories/matches';
import * as D from '../../support/rowDelta';
import * as F from '../../support/frozen';
import * as Q from './differentialQueries';

let seedModule;
let db;
let records;
let fixture;

const drizzleGraph = (g) => JSON.parse(JSON.stringify(g));

beforeAll(async () => {
    seedModule = require('../../contract/seed.ts');
    db = createDb({ path: ':memory:' });
    migrateDb(db);
    await seedModule.seed({ set: (ms) => setSystemTime(new Date(ms)) }, db);
    setSystemTime();
    const seedRows = D.dumpRows(db.$client);
    const labels = D.seedLabels(seedRows, new Set(Object.values(seedModule.IDS)));
    records = new Map((await Q.recordQueries(seedModule, Q.repositoryReader(db), Q.rowEncoder(seedRows, labels))).map((r) => [r.key, F.asStored(r)]));
    fixture = F.readFixture('repositories');
}, 30000);

afterAll(() => {
    setSystemTime();
    if (db) db.$client.close();
});

const keysWith = (prefix) => Object.keys(seedModule.IDS).filter((k) => k.startsWith(prefix));
const expectRecords = (prefix) => {
    const keys = [...fixture.records.keys()].filter((k) => k.startsWith(prefix));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect({ key, record: records.get(key) }).toEqual({ key, record: fixture.records.get(key) });
    return keys.length;
};

describe('repositories snapshot: reads over the seeded contract graph', () => {
    it('the fixture holds exactly the queries defined', () => {
        expect([...fixture.records.keys()].sort()).toEqual([...records.keys()].sort());
    });

    it('the fixture graph is non-trivial (guards against a vacuous comparison)', async () => {
        const counts = Object.fromEntries(['matches', 'rounds', 'riding_time_votes', 'round_pauses', 'judges_matches', 'judges_mats', 'mats_viewers']
            .map((t) => [t, db.$client.query(`SELECT count(*) AS n FROM ${t}`).get().n]));
        for (const [table, n] of Object.entries(counts)) expect({ table, n }).toEqual({ table, n: expect.any(Number) });
        expect(counts.matches).toBeGreaterThanOrEqual(20);
        expect(counts.rounds).toBeGreaterThanOrEqual(15);
        expect(counts.riding_time_votes).toBeGreaterThan(0);
        expect(counts.round_pauses).toBeGreaterThan(0);
        expect(counts.judges_matches).toBeGreaterThan(0);
    });

    it('HOT PATH: findMatchGraph (match, mat, competitors, judges, rounds with votes and pauses), for every match', () => {
        expect(keysWith('match:').length).toBeGreaterThanOrEqual(20);
        expect(expectRecords('matchGraph ')).toBe(keysWith('match:').length);
        const roundsCompared = [...fixture.records.values()].filter((r) => r.key.startsWith('matchGraph ')).reduce((n, r) => n + r.rounds.length, 0);
        expect(roundsCompared).toBeGreaterThanOrEqual(15);
    });

    it('HOT PATH: findMatchGraphsByIds over every match equals the per-match graphs', async () => {
        const ids = keysWith('match:').map((k) => seedModule.IDS[k]);
        const graphs = await Matches.findMatchGraphsByIds(db, ids);
        expect(graphs.size).toBe(ids.length);
        for (const id of ids) {
            expect(drizzleGraph(graphs.get(id))).toEqual(drizzleGraph(await Matches.findMatchGraph(db, id)));
        }
    });

    it('worker queries: findOpenRounds and findMatchesInBreak', () => {
        expectRecords('openRounds');
        expectRecords('matchesInBreak');
        expect(fixture.records.get('matchesInBreak').rows.length).toBeGreaterThan(0);
    });

    it('per-round and per-match helpers: findLastRound, findMatchJudges, findOpenRoundVotes, findCurrentPause, findOpenVoteForJudge', () => {
        expect(expectRecords('matchHelpers ')).toBe(keysWith('match:').length);
    });

    it('mats: judges, viewers, codes, incomplete matches, graph — content and order', async () => {
        expect(expectRecords('mat ')).toBeGreaterThanOrEqual(5);
        const Mats = require('../../../src/db/repositories/mats');
        for (const key of keysWith('mat:')) {
            const recorded = fixture.records.get(`mat ${key}`);
            const graph = await Mats.findMatGraph(db, seedModule.IDS[key]);
            const enc = Q.rowEncoder(D.dumpRows(db.$client), new Map());
            expect(F.asStored([enc.one(graph, 'mats'), enc.all(graph.judges, 'users'), enc.all(graph.matCodes, 'mat_codes'), enc.all(graph.incompleteMatches, 'matches')]))
                .toEqual([recorded.mat, recorded.judges, recorded.codes, recorded.incompleteMatches]);
        }
    });

    it('auth and code lookups: findUserByApiToken / findMatCodeByCode / findMatByCode / findUserById', () => {
        expectRecords('userByApiToken ');
        expectRecords('userById ');
        expectRecords('code ');
        expect(fixture.records.get('userByApiToken nope').user).toBeNull();
        expect(fixture.records.get('code no.such.code').mat).toBeNull();
        expectRecords('CODE_REGEXP');
    });
});
