const { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest, mock, spyOn, test } = require('bun:test');
/**
 * Drizzle schema baseline (server-ts task 09). In-memory bun:sqlite only:
 * applies ./drizzle through the real migrator and asserts the physical shape
 * the legacy-migrated database has (table list, columns, NOT NULL on the
 * Kotlin-value-class columns, unique indexes), plus round-trips and the
 * relational query API. Never touches a real sqlite file.
 */
const { createDb, migrateDb, schema } = require('../../src/db');

const EXPECTED_COLUMNS = {
    users:             ['id', 'name', 'api_token', 'created_at', 'updated_at'],
    mats:              ['id', 'name', 'judge_count', 'creator_id', 'created_at', 'updated_at'],
    mat_codes:         ['id', 'mat_id', 'code', 'role', 'created_at', 'updated_at'],
    matches:           ['id', 'creator_id', 'mat_id', 'red_competitor_id', 'blue_competitor_id', 'red_score', 'blue_score',
                        'started_at', 'ended_at', 'created_at', 'updated_at', 'break_started_at', 'break_duration'],
    rounds:            ['id', 'match_id', 'ended_at', 'created_at', 'updated_at', 'declared_winner_id', 'stoppage'],
    riding_time_votes: ['id', 'round_id', 'judge_id', 'competitor_id', 'ended_at', 'created_at', 'updated_at'],
    round_pauses:      ['id', 'round_id', 'paused_at', 'resumed_at', 'created_at', 'updated_at'],
    judges_mats:       ['mat_id', 'user_id', 'created_at', 'updated_at'],
    mats_viewers:      ['mat_id', 'user_id', 'created_at', 'updated_at'],
    judges_matches:    ['match_id', 'user_id', 'created_at', 'updated_at'],
};

// Columns backing NON-nullable Kotlin value classes (UserId, MatId, MatchId, RoundId, AuthToken).
const NOT_NULL_VALUE_CLASS_COLUMNS = {
    users:             ['id', 'api_token'],
    mats:              ['id', 'creator_id'],
    matches:           ['id', 'creator_id', 'mat_id', 'red_competitor_id', 'blue_competitor_id'],
    rounds:            ['id'],
    riding_time_votes: ['judge_id', 'competitor_id'],
};

const TS = new Date('2026-04-24T20:50:38.866Z'); // datetime columns are Date-typed (isoDateTime, F-39)
const stamps = { created_at: TS, updated_at: TS };

let db;
let sqlite;

beforeEach(() => {
    db = createDb({ path: ':memory:' });
    sqlite = db.$client;
    migrateDb(db);
});

afterEach(() => {
    sqlite.close();
});

const columnInfo = (table) => sqlite.query(`PRAGMA table_info(\`${table}\`)`).all();

describe('baseline migration', () => {
    it('creates exactly the 10 application tables (no migration_versions)', () => {
        const tables = sqlite
            .query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'`)
            .all()
            .map((r) => r.name)
            .sort();
        expect(tables).toEqual(Object.keys(EXPECTED_COLUMNS).sort());
        expect(tables).not.toContain('migration_versions');
    });

    for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
        it(`${table} has exactly the expected columns, in order`, () => {
            expect(columnInfo(table).map((c) => c.name)).toEqual(columns);
        });
    }

    for (const [table, columns] of Object.entries(NOT_NULL_VALUE_CLASS_COLUMNS)) {
        it(`${table} keeps Kotlin-value-class columns NOT NULL`, () => {
            const info = columnInfo(table);
            for (const column of columns) {
                expect(info.find((c) => c.name === column).notnull).toBe(1);
            }
        });
    }

    it('has UNIQUE indexes on mat_codes.code and users.api_token', () => {
        const uniqueOn = (table) =>
            sqlite.query(`PRAGMA index_list(\`${table}\`)`).all()
                .filter((i) => i.unique === 1)
                .map((i) => sqlite.query(`PRAGMA index_info(\`${i.name}\`)`).all().map((c) => c.name));
        expect(uniqueOn('mat_codes')).toContainEqual(['code']);
        expect(uniqueOn('users')).toContainEqual(['api_token']);
    });
});

describe('round trips', () => {
    it('users', async () => {
        const [row] = await db.insert(schema.users).values({ name: 'Ann', api_token: 'tok-1', ...stamps }).returning();
        expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
        const [found] = await db.select().from(schema.users);
        expect(found).toEqual({ id: row.id, name: 'Ann', api_token: 'tok-1', created_at: TS, updated_at: TS });
    });

    it('mats (judge_count defaults to 1)', async () => {
        const [mat] = await db.insert(schema.mats).values({ name: 'M', creator_id: 'u1', ...stamps }).returning();
        expect(mat.judge_count).toBe(1);
        expect(mat.creator_id).toBe('u1');
    });

    it('matches (null datetimes and break fields)', async () => {
        const [m] = await db.insert(schema.matches)
            .values({ creator_id: 'u', mat_id: 'm', red_competitor_id: 'r', blue_competitor_id: 'b', ...stamps })
            .returning();
        expect(m.red_score).toBe(0);
        expect(m.blue_score).toBe(0);
        expect(m.started_at).toBeNull();
        expect(m.ended_at).toBeNull();
        expect(m.break_started_at).toBeNull();
        expect(m.break_duration).toBeNull();
    });

    it('rounds (stoppage is a nullable boolean; datetimes round-trip as Date)', async () => {
        const [r] = await db.insert(schema.rounds).values({ match_id: 'x', ended_at: TS, stoppage: true, ...stamps }).returning();
        expect(r.stoppage).toBe(true);
        expect(r.ended_at).toEqual(TS);
        expect(r.declared_winner_id).toBeNull();
        const [r2] = await db.insert(schema.rounds).values({ match_id: 'x', ...stamps }).returning();
        expect(r2.stoppage).toBeNull();
    });

    it('riding_time_votes and round_pauses', async () => {
        const [v] = await db.insert(schema.riding_time_votes)
            .values({ round_id: 'r', judge_id: 'j', competitor_id: 'c', ...stamps }).returning();
        expect(v.ended_at).toBeNull();
        const [p] = await db.insert(schema.round_pauses).values({ round_id: 'r', paused_at: TS, ...stamps }).returning();
        expect(p.paused_at).toEqual(TS);
        expect(p.resumed_at).toBeNull();
    });

    it('join tables', async () => {
        await db.insert(schema.judges_mats).values({ mat_id: 'm', user_id: 'u', ...stamps });
        await db.insert(schema.mats_viewers).values({ mat_id: 'm', user_id: 'u', ...stamps });
        await db.insert(schema.judges_matches).values({ match_id: 'x', user_id: 'u', ...stamps });
        expect(await db.select().from(schema.judges_mats)).toHaveLength(1);
        expect(await db.select().from(schema.mats_viewers)).toHaveLength(1);
        expect(await db.select().from(schema.judges_matches)).toHaveLength(1);
        // composite unique: the same pair twice is rejected
        expect(() => db.insert(schema.judges_mats).values({ mat_id: 'm', user_id: 'u', ...stamps }).run()).toThrow();
    });

    it('rejects NULL in a NOT NULL value-class column', () => {
        expect(() => sqlite.run(`INSERT INTO users (id, name, api_token, created_at, updated_at) VALUES ('i', 'n', NULL, 't', 't')`)).toThrow();
    });
});

describe('constraints', () => {
    it('rejects a duplicate mat code', async () => {
        await db.insert(schema.mat_codes).values({ mat_id: 'm1', code: 'a.b.c', role: 'admin', ...stamps });
        expect(() => db.insert(schema.mat_codes).values({ mat_id: 'm2', code: 'a.b.c', role: 'admin', ...stamps }).run()).toThrow();
    });

    it('rejects a duplicate api_token', async () => {
        await db.insert(schema.users).values({ name: 'A', api_token: 't', ...stamps });
        expect(() => db.insert(schema.users).values({ name: 'B', api_token: 't', ...stamps }).run()).toThrow();
    });
});

describe('relational queries', () => {
    it('match -> rounds', async () => {
        const [match] = await db.insert(schema.matches)
            .values({ creator_id: 'u', mat_id: 'm', red_competitor_id: 'r', blue_competitor_id: 'b', ...stamps }).returning();
        await db.insert(schema.rounds).values([
            { match_id: match.id, ...stamps },
            { match_id: match.id, ...stamps },
            { match_id: 'other', ...stamps },
        ]);
        const found = await db.query.matches.findMany({ with: { rounds: true } });
        expect(found).toHaveLength(1);
        expect(found[0].rounds).toHaveLength(2);
    });

    it('mat -> matCodes and mat -> creator', async () => {
        const [user] = await db.insert(schema.users).values({ name: 'Ann', api_token: 't', ...stamps }).returning();
        const [mat] = await db.insert(schema.mats).values({ name: 'M', creator_id: user.id, ...stamps }).returning();
        await db.insert(schema.mat_codes).values([
            { mat_id: mat.id, code: 'one', role: 'admin', ...stamps },
            { mat_id: mat.id, code: 'two', role: 'viewer', ...stamps },
        ]);
        const found = await db.query.mats.findFirst({ where: (m, { eq }) => eq(m.id, mat.id), with: { matCodes: true, creator: true } });
        expect(found.matCodes.map((c) => c.code).sort()).toEqual(['one', 'two']);
        expect(found.creator.name).toBe('Ann');
    });

    it('match -> redCompetitor / blueCompetitor resolve to distinct users', async () => {
        const [red] = await db.insert(schema.users).values({ name: 'Red', api_token: 'r', ...stamps }).returning();
        const [blue] = await db.insert(schema.users).values({ name: 'Blue', api_token: 'b', ...stamps }).returning();
        await db.insert(schema.matches)
            .values({ creator_id: red.id, mat_id: 'm', red_competitor_id: red.id, blue_competitor_id: blue.id, ...stamps });
        const found = await db.query.matches.findFirst({ with: { redCompetitor: true, blueCompetitor: true } });
        expect(found.redCompetitor.name).toBe('Red');
        expect(found.blueCompetitor.name).toBe('Blue');
    });
});
