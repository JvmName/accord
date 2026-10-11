const { afterEach, beforeEach, describe, expect, it } = require('bun:test');
/** mats repository (task 10): lookups, judge/viewer joins, graph, writes. Real in-memory SQLite. */
const { CODE, ID, at, freshDb, insertRows, seedBase, stampsAt } = require('./support');
const Mats = require('../../../src/db/repositories/mats');

let db;
beforeEach(() => { db = freshDb(); seedBase(db); });
afterEach(() => db.$client.close());

const ids = (rows) => rows.map((r) => r.id);

function match(id, overrides = {}) {
    return {
        id, mat_id: ID.matMain, creator_id: ID.creator,
        red_competitor_id: ID.red, blue_competitor_id: ID.blue, ...stampsAt(20), ...overrides,
    };
}

describe('findMatById / findMatByCode', () => {
    it('finds a mat by id; null when missing or nullish', async () => {
        expect(await Mats.findMatById(db, ID.matMain)).toMatchObject({ name: 'Main Mat', judge_count: 2, creator_id: ID.creator });
        expect(await Mats.findMatById(db, 'missing')).toBeNull();
        expect(await Mats.findMatById(db, undefined)).toBeNull();
    });

    it('findMatByCode resolves code -> mat', async () => {
        expect((await Mats.findMatByCode(db, CODE.mainViewer)).id).toBe(ID.matMain);
    });

    it('findMatByCode: unknown code -> undefined (legacy `return;`)', async () => {
        expect(await Mats.findMatByCode(db, 'no.such.code')).toBeUndefined();
    });

    it('findMatByCode: code whose mat row is gone -> null (legacy code.getMat())', async () => {
        insertRows(db, 'mat_codes', [{ id: 'orphan', mat_id: 'gone', code: 'orphan.code.here', role: 'admin', ...stampsAt(1) }]);
        expect(await Mats.findMatByCode(db, 'orphan.code.here')).toBeNull();
    });
});

describe('judges and viewers (join rows)', () => {
    it('addMatJudge/findMatJudges: ordered by user_id, not join order; idempotent add', async () => {
        await Mats.addMatJudge(db, ID.matMain, ID.judgeB);
        await Mats.addMatJudge(db, ID.matMain, ID.judgeA);
        await Mats.addMatJudge(db, ID.matMain, ID.judgeA);
        expect(ids(await Mats.findMatJudges(db, ID.matMain))).toEqual([ID.judgeA, ID.judgeB]);
        expect(db.$client.query('SELECT count(*) AS n FROM judges_mats').get().n).toBe(2);
    });

    it('re-adding keeps the original join row timestamps (belongsToMany#add semantics)', async () => {
        insertRows(db, 'judges_mats', [{ mat_id: ID.matMain, user_id: ID.judgeA, ...stampsAt(14) }]);
        await Mats.addMatJudge(db, ID.matMain, ID.judgeA);
        const row = db.$client.query('SELECT created_at FROM judges_mats').get();
        expect(row.created_at).toBe(at(14).toISOString());
    });

    it('returns full User rows (incl. api_token: stripping is serialisation, task 11)', async () => {
        await Mats.addMatJudge(db, ID.matMain, ID.judgeA);
        const [judge] = await Mats.findMatJudges(db, ID.matMain);
        expect(Object.keys(judge).sort()).toEqual(['api_token', 'created_at', 'id', 'name', 'updated_at']);
        expect(judge.created_at).toBeInstanceOf(Date);
    });

    it('a join row with a missing user is skipped (INNER JOIN)', async () => {
        insertRows(db, 'judges_mats', [{ mat_id: ID.matMain, user_id: 'ghost', ...stampsAt(14) }]);
        expect(await Mats.findMatJudges(db, ID.matMain)).toEqual([]);
    });

    it('removeMatJudge deletes only that pair; no-op when absent', async () => {
        await Mats.addMatJudge(db, ID.matMain, ID.judgeA);
        await Mats.addMatJudge(db, ID.matEmpty, ID.judgeA);
        await Mats.removeMatJudge(db, ID.matMain, ID.judgeA);
        await Mats.removeMatJudge(db, ID.matMain, ID.judgeA);
        expect(await Mats.findMatJudges(db, ID.matMain)).toEqual([]);
        expect(ids(await Mats.findMatJudges(db, ID.matEmpty))).toEqual([ID.judgeA]);
    });

    it('viewers: add/find/filter by user/remove', async () => {
        await Mats.addMatViewer(db, ID.matMain, ID.viewer);
        await Mats.addMatViewer(db, ID.matMain, ID.judgeA);
        expect(ids(await Mats.findMatViewers(db, ID.matMain))).toEqual([ID.judgeA, ID.viewer]);
        expect(ids(await Mats.findMatViewers(db, ID.matMain, { userId: ID.viewer }))).toEqual([ID.viewer]);
        expect(await Mats.findMatViewers(db, ID.matMain, { userId: ID.judgeB })).toEqual([]);
        await Mats.removeMatViewer(db, ID.matMain, ID.viewer);
        expect(ids(await Mats.findMatViewers(db, ID.matMain))).toEqual([ID.judgeA]);
        // judges and viewers are separate tables
        expect(await Mats.findMatJudges(db, ID.matMain)).toEqual([]);
    });
});

describe('findIncompleteMatchesForMat', () => {
    it('excludes ended matches and other mats; insertion order, NOT created_at order', async () => {
        insertRows(db, 'matches', [
            match('m-late',  { ...stampsAt(90) }),
            match('m-ended', { ended_at: at(50) }),
            match('m-early', { ...stampsAt(30) }),
            match('m-other', { mat_id: ID.matEmpty }),
        ]);
        expect(ids(await Mats.findIncompleteMatchesForMat(db, ID.matMain))).toEqual(['m-late', 'm-early']);
    });
});

describe('findMatGraph', () => {
    it('loads judges, codes and incomplete matches in one query, with the per-association ordering', async () => {
        await Mats.addMatJudge(db, ID.matMain, ID.judgeB);
        await Mats.addMatJudge(db, ID.matMain, ID.judgeA);
        insertRows(db, 'matches', [match('m-2', { ...stampsAt(40) }), match('m-x', { ended_at: at(1) }), match('m-1')]);
        const graph = await Mats.findMatGraph(db, ID.matMain);
        expect(graph).toMatchObject({ id: ID.matMain, name: 'Main Mat', judge_count: 2 });
        expect(ids(graph.judges)).toEqual([ID.judgeA, ID.judgeB]);
        expect(graph.matCodes.map((c) => c.role)).toEqual(['admin', 'viewer']);
        expect(ids(graph.incompleteMatches)).toEqual(['m-2', 'm-1']);
        expect(graph.created_at).toBeInstanceOf(Date);
        expect(graph.incompleteMatches[0].created_at).toBeInstanceOf(Date);
        expect(graph).not.toHaveProperty('judgesMats');
        // same content as the single-purpose functions
        expect(graph.judges).toEqual(await Mats.findMatJudges(db, ID.matMain));
        expect(graph.incompleteMatches).toEqual(await Mats.findIncompleteMatchesForMat(db, ID.matMain));
    });

    it('returns null for an unknown mat, empty arrays for an empty one', async () => {
        expect(await Mats.findMatGraph(db, 'missing')).toBeNull();
        const empty = await Mats.findMatGraph(db, ID.matEmpty);
        expect([empty.judges, empty.matCodes, empty.incompleteMatches]).toEqual([[], [], []]);
    });
});

describe('insertMat', () => {
    it('defaults judge_count to 1 when omitted (DB default, as Mat.create)', async () => {
        const mat = await Mats.insertMat(db, { name: 'New', creator_id: ID.creator });
        expect(mat.judge_count).toBe(1);
        expect(mat.updated_at).toEqual(mat.created_at);
        expect(await Mats.findMatById(db, mat.id)).toEqual(mat);
    });

    it('keeps an explicit judge_count', async () => {
        expect((await Mats.insertMat(db, { name: 'Two', creator_id: ID.creator, judge_count: 3 })).judge_count).toBe(3);
    });
});
