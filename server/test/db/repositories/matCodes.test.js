const { afterEach, beforeEach, describe, expect, it } = require('bun:test');
/**
 * matCodes repository + src/domain/matCode.ts (task 10), real in-memory SQLite.
 * Also the require() smoke test for the module formats chosen in task 10.
 */
const { CODE, ID, freshDb, seedBase } = require('./support');
const MatCodes = require('../../../src/db/repositories/matCodes');
const matCode  = require('../../../src/domain/matCode');

let db;
beforeEach(() => { db = freshDb(); seedBase(db); });
afterEach(() => db.$client.close());

describe('module format (require() smoke test)', () => {
    it('src/domain/matCode.ts is CommonJS: require() returns the plain export object', () => {
        expect(Object.keys(matCode).sort()).toEqual(['CODE_REGEXP', 'ROLES', 'isAdminCode', 'isMatCode', 'isViewerCode']);
        expect(matCode.default).toBeUndefined();
    });

    it('every repository module and transaction.ts load through require()', () => {
        for (const name of ['users', 'mats', 'matCodes', 'matches', 'rounds', 'votes']) {
            const mod = require(`../../../src/db/repositories/${name}`);
            expect(Object.values(mod).some((v) => typeof v === 'function')).toBe(true);
        }
        expect(typeof require('../../../src/db/transaction').transaction).toBe('function');
    });
});

describe('CODE_REGEXP (preserved exactly, FINDINGS F-12)', () => {
    it('is byte-for-byte the legacy MatCode.CODE_REGEXP', () => {
        expect(matCode.CODE_REGEXP.source).toBe('\\w+\\.\\w+\\.\\w+');
        expect(matCode.CODE_REGEXP.flags).toBe('');
    });

    it('routes word triples as codes and UUIDs as ids', () => {
        expect(matCode.isMatCode('morning.coffee.bicycle')).toBe(true);
        expect(matCode.isMatCode(ID.matMain)).toBe(false);
    });

    it('QUIRK: is unanchored, so a dotted triple ANYWHERE matches', () => {
        expect(matCode.isMatCode('!!morning.coffee.bicycle!!')).toBe(true);
        expect(matCode.isMatCode('a.b.c.d.e')).toBe(true);
        expect(matCode.isMatCode('1.2.3')).toBe(true);
        expect(matCode.isMatCode('_._._')).toBe(true);
        expect(matCode.isMatCode('a.b')).toBe(false);
        expect(matCode.isMatCode('a..b.c')).toBe(false);
    });

    it('ROLES and the role predicates match the legacy getters', () => {
        expect(matCode.ROLES).toEqual({ ADMIN: 'admin', VIEWER: 'viewer' });
        expect(matCode.isAdminCode({ role: 'admin' })).toBe(true);
        expect(matCode.isAdminCode({ role: 'viewer' })).toBe(false);
        expect(matCode.isViewerCode({ role: 'viewer' })).toBe(true);
    });
});

describe('findMatCodeByCode', () => {
    it('finds by exact code', async () => {
        const row = await MatCodes.findMatCodeByCode(db, CODE.mainAdmin);
        expect(row).toMatchObject({ mat_id: ID.matMain, code: CODE.mainAdmin, role: 'admin' });
        expect(row.created_at).toBeInstanceOf(Date);
    });

    it('returns null when not found, including near-misses the regexp would accept', async () => {
        expect(await MatCodes.findMatCodeByCode(db, 'no.such.code')).toBeNull();
        expect(await MatCodes.findMatCodeByCode(db, `!!${CODE.mainAdmin}!!`)).toBeNull();
        expect(await MatCodes.findMatCodeByCode(db, CODE.mainAdmin.toUpperCase())).toBeNull();
    });

    it('null -> null; undefined throws like Sequelize', async () => {
        expect(await MatCodes.findMatCodeByCode(db, null)).toBeNull();
        await expect(MatCodes.findMatCodeByCode(db, undefined)).rejects.toThrow('WHERE parameter "code"');
    });
});

describe('findMatCodesForMat', () => {
    it('orders by role (legacy index order), not insertion', async () => {
        // seedBase inserts the viewer code first
        const rows = await MatCodes.findMatCodesForMat(db, ID.matMain);
        expect(rows.map((c) => c.role)).toEqual(['admin', 'viewer']);
    });

    it('returns [] for a mat without codes', async () => {
        expect(await MatCodes.findMatCodesForMat(db, ID.matEmpty)).toEqual([]);
    });
});

describe('insertMatCode', () => {
    it('inserts with generated id and timestamps', async () => {
        const row = await MatCodes.insertMatCode(db, { mat_id: ID.matEmpty, code: 'golf.hotel.india', role: 'admin' });
        expect(row.id).toBeString();
        expect(row.updated_at).toEqual(row.created_at);
        expect(await MatCodes.findMatCodeByCode(db, 'golf.hotel.india')).toEqual(row);
    });

    it('rejects a duplicate code and a duplicate (mat, role)', async () => {
        await expect(MatCodes.insertMatCode(db, { mat_id: ID.matEmpty, code: CODE.mainAdmin, role: 'admin' })).rejects.toThrow(/UNIQUE/);
        await expect(MatCodes.insertMatCode(db, { mat_id: ID.matMain, code: 'x.y.z', role: 'admin' })).rejects.toThrow(/UNIQUE/);
    });
});
