const { afterAll, beforeAll, describe, expect, it, setSystemTime } = require('bun:test');
/**
 * DIFFERENTIAL test (task 10): the Drizzle repositories return the same
 * content, in the same order, as the legacy Sequelize models for the same data.
 *
 * The DB is a temp file created by the LEGACY migrations and seeded through the
 * legacy models with the contract fixture graph (test/contract/seed.ts). The
 * Sequelize stack is never pointed at a Drizzle-baseline DB (FINDINGS F-47);
 * Drizzle only reads this legacy-migrated file. No real sqlite file is touched.
 */
const Http = require('../../helpers/httpServer');

// Must happen before any model module opens a connection.
const previousDatabasePath = process.env.DATABASE_PATH;
const file = Http.useTemporaryDatabase('accord-repo-diff');

const { getTableColumns } = require('drizzle-orm');
const { createDb, schema } = require('../../../src/db');
const Users    = require('../../../src/db/repositories/users');
const Mats     = require('../../../src/db/repositories/mats');
const MatCodes = require('../../../src/db/repositories/matCodes');
const Matches  = require('../../../src/db/repositories/matches');
const Rounds   = require('../../../src/db/repositories/rounds');
const Votes    = require('../../../src/db/repositories/votes');

let legacy; // { User, Mat, MatCode, Match, Round }
let IDS;
let CODES;
let db;

const COLUMNS = Object.fromEntries(
    ['users', 'mats', 'mat_codes', 'matches', 'rounds', 'riding_time_votes', 'round_pauses']
        .map((t) => [t, Object.keys(getTableColumns(schema[t]))]),
);

/** A Sequelize instance (or a Drizzle row) reduced to exactly the table's columns. */
function plain(record, table) {
    if (record == null) return record;
    const isSequelize = typeof record.get === 'function';
    const source = isSequelize ? record.get({ plain: true }) : record;
    const out = Object.fromEntries(COLUMNS[table].map((c) => [c, source[c]]));
    // The ONE known representation difference (FINDINGS F-51): on a legacy-migrated
    // DB (`stoppage TINYINT(1)`) Sequelize returns 0/1, Drizzle's boolean column
    // returns false/true. Only truthiness is ever read (domain scoring), so map
    // 0/1 -> false/true on the legacy side, and assert it really is 0/1/null.
    if (table === 'rounds' && isSequelize) {
        expect([0, 1, null]).toContain(out.stoppage);
        out.stoppage = out.stoppage === null ? null : Boolean(out.stoppage);
    }
    return out;
}
const plainAll = (records, table) => records.map((r) => plain(r, table));

async function legacyMatchGraph(match) {
    const rounds = [];
    for (const round of await match.getRounds()) {
        rounds.push({
            ...plain(round, 'rounds'),
            ridingTimeVotes: plainAll(await round.getRidingTimeVotes(), 'riding_time_votes'),
            pauses:          plainAll(await round.getPauses(), 'round_pauses'),
        });
    }
    return {
        ...plain(match, 'matches'),
        mat:            plain(await match.getMat(), 'mats'),
        redCompetitor:  plain(await match.getRedCompetitor(), 'users'),
        blueCompetitor: plain(await match.getBlueCompetitor(), 'users'),
        judges:         plainAll(await match.getJudges(), 'users'),
        rounds,
    };
}

function drizzleMatchGraph(g) {
    return {
        ...plain(g, 'matches'),
        mat:            plain(g.mat, 'mats'),
        redCompetitor:  plain(g.redCompetitor, 'users'),
        blueCompetitor: plain(g.blueCompetitor, 'users'),
        judges:         plainAll(g.judges, 'users'),
        rounds: g.rounds.map((r) => ({
            ...plain(r, 'rounds'),
            ridingTimeVotes: plainAll(r.ridingTimeVotes, 'riding_time_votes'),
            pauses:          plainAll(r.pauses, 'round_pauses'),
        })),
    };
}

const keysWith = (prefix) => Object.keys(IDS).filter((k) => k.startsWith(prefix));

beforeAll(async () => {
    await Http.migrate();
    const seedModule = require('../../contract/seed.ts');
    IDS = seedModule.IDS;
    CODES = seedModule.CODES;
    await seedModule.seed({ set: (ms) => setSystemTime(new Date(ms)) });
    setSystemTime(); // back to the real clock
    legacy = {
        User:    require('../../../models/user').User,
        Mat:     require('../../../models/mat').Mat,
        MatCode: require('../../../models/matCode').MatCode,
        Match:   require('../../../models/match').Match,
        Round:   require('../../../models/round').Round,
    };
    db = createDb({ path: file });
}, 30000);

afterAll(() => {
    setSystemTime();
    if (db) db.$client.close();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
});

describe('DIFFERENTIAL: Drizzle repositories vs Sequelize models (seeded contract graph)', () => {
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

    it('HOT PATH: findMatchGraph == match + getMat/getRed/BlueCompetitor/getJudges/getRounds/votes/pauses, for every match', async () => {
        const matchKeys = keysWith('match:');
        expect(matchKeys.length).toBeGreaterThanOrEqual(20);
        let roundsCompared = 0;
        for (const key of matchKeys) {
            const id = IDS[key];
            const expected = await legacyMatchGraph(await legacy.Match.find(id));
            const actual   = drizzleMatchGraph(await Matches.findMatchGraph(db, id));
            expect({ key, graph: actual }).toEqual({ key, graph: expected });
            roundsCompared += expected.rounds.length;
        }
        expect(roundsCompared).toBeGreaterThanOrEqual(15);
    });

    it('HOT PATH: findMatchGraphsByIds over every match equals the per-match graphs', async () => {
        const ids = keysWith('match:').map((k) => IDS[k]);
        const graphs = await Matches.findMatchGraphsByIds(db, ids);
        expect(graphs.size).toBe(ids.length);
        for (const id of ids) {
            expect(drizzleMatchGraph(graphs.get(id))).toEqual(drizzleMatchGraph(await Matches.findMatchGraph(db, id)));
        }
    });

    it('worker queries: findOpenRounds == Round.getOpenRounds(), findMatchesInBreak == Match.where(break...)', async () => {
        const Op = legacy.Match.Operators;
        expect(plainAll(await Rounds.findOpenRounds(db), 'rounds'))
            .toEqual(plainAll(await legacy.Round.getOpenRounds(), 'rounds'));
        const legacyBreaks = await legacy.Match.where({ break_started_at: { [Op.ne]: null }, ended_at: null });
        expect(legacyBreaks.length).toBeGreaterThan(0);
        expect(plainAll(await Matches.findMatchesInBreak(db), 'matches')).toEqual(plainAll(legacyBreaks, 'matches'));
    });

    it('per-round and per-match helpers equal their legacy counterparts', async () => {
        for (const key of keysWith('match:')) {
            const match = await legacy.Match.find(IDS[key]);
            const rounds = await match.getRounds();
            expect(plain(await Rounds.findLastRound(db, match.id), 'rounds')).toEqual(plain(await match.getLastRound(), 'rounds'));
            expect(plainAll(await Matches.findMatchJudges(db, match.id), 'users')).toEqual(plainAll(await match.getJudges(), 'users'));
            for (const round of rounds) {
                expect(plainAll(await Votes.findOpenRoundVotes(db, round.id), 'riding_time_votes'))
                    .toEqual(plainAll(await round.getRidingTimeVotes({ where: { ended_at: null } }), 'riding_time_votes'));
                expect(plain(await Rounds.findCurrentPause(db, round.id), 'round_pauses'))
                    .toEqual(plain(await round.getCurrentPause(), 'round_pauses'));
                for (const judgeKey of ['user:judgeA', 'user:judgeB']) {
                    const judge = { id: IDS[judgeKey] };
                    const legacyVote = await round.currentRidingTimeVoteForJudge(judge);
                    const vote = await Votes.findOpenVoteForJudge(db, round.id, judge.id);
                    expect(vote === undefined).toBe(legacyVote === undefined);
                    expect(plain(vote, 'riding_time_votes')).toEqual(plain(legacyVote, 'riding_time_votes'));
                }
            }
        }
    });

    it('mats: judges, viewers, codes, incomplete matches, graph — content and order', async () => {
        const matKeys = keysWith('mat:');
        expect(matKeys.length).toBeGreaterThanOrEqual(5);
        for (const key of matKeys) {
            const mat = await legacy.Mat.find(IDS[key]);
            const judges   = plainAll(await mat.getJudges(), 'users');
            const viewers  = plainAll(await mat.getViewers(), 'users');
            const codes    = plainAll(await mat.getMatCodes(), 'mat_codes');
            const matches  = plainAll(await mat.getIncompleteMatches(), 'matches');
            expect(plain(await Mats.findMatById(db, mat.id), 'mats')).toEqual(plain(mat, 'mats'));
            expect(plainAll(await Mats.findMatJudges(db, mat.id), 'users')).toEqual(judges);
            expect(plainAll(await Mats.findMatViewers(db, mat.id), 'users')).toEqual(viewers);
            expect(plainAll(await MatCodes.findMatCodesForMat(db, mat.id), 'mat_codes')).toEqual(codes);
            expect(plainAll(await Mats.findIncompleteMatchesForMat(db, mat.id), 'matches')).toEqual(matches);
            const graph = await Mats.findMatGraph(db, mat.id);
            expect([plain(graph, 'mats'), plainAll(graph.judges, 'users'), plainAll(graph.matCodes, 'mat_codes'), plainAll(graph.incompleteMatches, 'matches')])
                .toEqual([plain(mat, 'mats'), judges, codes, matches]);
            const viewerId = IDS['user:viewer'];
            expect(plainAll(await Mats.findMatViewers(db, mat.id, { userId: viewerId }), 'users'))
                .toEqual(plainAll(await mat.getViewers({ where: { id: viewerId } }), 'users'));
        }
    });

    it('auth and code lookups: findUserByApiToken / findMatCodeByCode / findMatByCode / findUserById', async () => {
        for (const key of keysWith('token:')) {
            expect(plain(await Users.findUserByApiToken(db, IDS[key]), 'users'))
                .toEqual(plain(await legacy.User.findByApiToken(IDS[key]), 'users'));
        }
        expect(await Users.findUserByApiToken(db, 'nope')).toBe(await legacy.User.findByApiToken('nope'));
        for (const key of keysWith('user:')) {
            expect(plain(await Users.findUserById(db, IDS[key]), 'users')).toEqual(plain(await legacy.User.find(IDS[key]), 'users'));
        }
        expect(await Users.findUserById(db, 'nope')).toBe(await legacy.User.find('nope'));
        for (const code of [...Object.values(CODES), 'no.such.code']) {
            expect(plain(await MatCodes.findMatCodeByCode(db, code), 'mat_codes'))
                .toEqual(plain(await legacy.MatCode.findByCode(code), 'mat_codes'));
            const [mine, theirs] = [await Mats.findMatByCode(db, code), await legacy.Mat.findByCode(code)];
            expect(mine === undefined).toBe(theirs === undefined);
            expect(plain(mine, 'mats')).toEqual(plain(theirs, 'mats'));
        }
        expect(legacy.MatCode.CODE_REGEXP.source).toBe(require('../../../src/domain/matCode').CODE_REGEXP.source);
    });
});
