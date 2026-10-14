/**
 * Shared setup for the repository tests (server-ts task 10). Not a test file.
 *
 * Every DB is an in-memory bun:sqlite database built by applying ./drizzle
 * through the real migrator — no mocks, no real sqlite file touched.
 *
 * Ids and codes mirror `test/contract/seed.ts` (IDS / CODES) so the two
 * fixture sets read alike. seed.ts itself is NOT required here: it loads the
 * Sequelize models, which open the configured legacy DB file. Only the
 * differential test uses it, against a temp legacy-migrated DB.
 */
const { createDb, migrateDb, schema } = require('../../../src/db');

const uuid = (suffix) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const ID = {
    creator:  uuid('c0'),
    judgeA:   uuid('c1'),
    judgeB:   uuid('c2'),
    viewer:   uuid('c3'),
    red:      uuid('d0'),
    blue:     uuid('d1'),
    tokenCreator: uuid('a1c0'),
    tokenJudgeA:  uuid('a1c1'),
    matMain:  uuid('e0'),
    matEmpty: uuid('e1'),
    matchDone:  uuid('f0'),
    matchOpen:  uuid('f3'),
    matchBreak: uuid('f5'),
};

const CODE = {
    mainAdmin:  'alpha.bravo.charlie',
    mainViewer: 'delta.echo.foxtrot',
};

const T0 = Date.parse('2026-01-01T12:00:00.000Z');
const at = (seconds) => new Date(T0 + seconds * 1000);
const stampsAt = (seconds) => ({ created_at: at(seconds), updated_at: at(seconds) });

function freshDb() {
    const db = createDb({ path: ':memory:' });
    migrateDb(db);
    return db;
}

/** Insert raw rows with explicit timestamps (bypasses the repositories under test). */
function insertRows(db, table, rows) {
    return db.insert(schema[table]).values(rows).run();
}

/** Users, one mat with both codes; returns nothing. Deterministic timestamps. */
function seedBase(db) {
    insertRows(db, 'users', [
        { id: ID.creator, name: 'Casey Creator', api_token: ID.tokenCreator, ...stampsAt(0) },
        { id: ID.judgeA,  name: 'Jordan Judge',  api_token: ID.tokenJudgeA,  ...stampsAt(1) },
        { id: ID.judgeB,  name: 'Jamie Judge',   api_token: uuid('a1c2'),    ...stampsAt(2) },
        { id: ID.viewer,  name: 'Val Viewer',    api_token: uuid('a1c3'),    ...stampsAt(3) },
        { id: ID.red,     name: 'Rory Red',      api_token: uuid('a1d0'),    ...stampsAt(6) },
        { id: ID.blue,    name: 'Blair Blue',    api_token: uuid('a1d1'),    ...stampsAt(7) },
    ]);
    insertRows(db, 'mats', [
        { id: ID.matMain,  name: 'Main Mat',  creator_id: ID.creator, judge_count: 2, ...stampsAt(10) },
        { id: ID.matEmpty, name: 'Empty Mat', creator_id: ID.creator, ...stampsAt(11) },
    ]);
    insertRows(db, 'mat_codes', [
        { id: uuid('e101'), mat_id: ID.matMain, code: CODE.mainViewer, role: 'viewer', ...stampsAt(10) },
        { id: uuid('e100'), mat_id: ID.matMain, code: CODE.mainAdmin,  role: 'admin',  ...stampsAt(10) },
    ]);
}

module.exports = { ID, CODE, T0, at, stampsAt, uuid, freshDb, insertRows, seedBase, schema };
