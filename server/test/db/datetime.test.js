const { afterEach, beforeEach, describe, expect, it } = require('bun:test');
/**
 * ISO 8601 datetime storage across BOTH stacks (FINDINGS F-39).
 *
 * Sequelize (legacy) and Drizzle open the SAME temp-file SQLite DB. The table
 * is created with the legacy DDL (declared DATETIME), as the legacy migrations
 * produce it, because Sequelize only runs its DATE parser for columns declared
 * DATETIME. Never touches a real sqlite file.
 */
// Loading the legacy connection module applies the Sequelize ISO override
// (lib/activeRecord/db/isoDateTime.js) exactly as the app does.
require('../../lib/activeRecord/db/connection');
const { Sequelize, DataTypes, Op } = require('sequelize');
const { asc, eq, gt }              = require('drizzle-orm');
const fs                           = require('node:fs');
const os                           = require('node:os');
const path                         = require('node:path');
const { createDb, schema }         = require('../../src/db');

const ISO_RE    = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const LEGACY_AT = Date.UTC(2026, 3, 24, 20, 50, 38, 866);

const LEGACY_DDL = `CREATE TABLE \`round_pauses\` (
    \`id\` UUID PRIMARY KEY, \`round_id\` UUID NOT NULL,
    \`paused_at\` DATETIME NOT NULL, \`resumed_at\` DATETIME,
    \`created_at\` DATETIME NOT NULL, \`updated_at\` DATETIME NOT NULL)`;

let dir;
let sequelize;
let RoundPause;
let db;

beforeEach(async () => {
    dir       = fs.mkdtempSync(path.join(os.tmpdir(), 'accord-datetime-'));
    const file = path.join(dir, 'test.sqlite');
    sequelize = new Sequelize({ dialect: 'sqlite', storage: file, logging: false });
    RoundPause = sequelize.define('RoundPause', {
        id:         { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        round_id:   { type: DataTypes.UUID, allowNull: false },
        paused_at:  { type: DataTypes.DATE, allowNull: false },
        resumed_at: { type: DataTypes.DATE },
    }, { tableName: 'round_pauses', underscored: true });
    await sequelize.query(LEGACY_DDL);
    db = createDb({ path: file });
});

afterEach(async () => {
    db.$client.close();
    await sequelize.close();
    fs.rmSync(dir, { recursive: true, force: true });
});

const raw = (id) => db.$client.query('SELECT * FROM round_pauses WHERE id = ?').get(id);

const drizzleInsert = (values) => db.insert(schema.round_pauses).values({
    round_id: 'r', created_at: new Date(), updated_at: new Date(), ...values,
}).returning().then(([row]) => row);


describe('codec', () => {
    it('writes Date#toISOString() in both stacks', async () => {
        const d = new Date(LEGACY_AT);
        expect(d.toISOString()).toBe('2026-04-24T20:50:38.866Z');
        const { isoStringify, isoParse } = require('../../lib/activeRecord/db/isoDateTime');
        expect(isoStringify(d)).toBe('2026-04-24T20:50:38.866Z');
        expect(isoParse('2026-04-24T20:50:38.866Z').getTime()).toBe(LEGACY_AT);
        expect(isoStringify(new Date('garbage'))).toBe('Invalid date');
    });
});


describe('raw stored format', () => {
    it('(a) Sequelize writes ISO 8601 text for every DATE column', async () => {
        const row = await RoundPause.create({ round_id: 'r', paused_at: new Date(LEGACY_AT) });
        const stored = raw(row.id);
        expect(stored.paused_at).toBe('2026-04-24T20:50:38.866Z');
        expect(stored.created_at).toMatch(ISO_RE);
        expect(stored.updated_at).toMatch(ISO_RE);

        await row.update({ resumed_at: new Date(LEGACY_AT + 1000) });
        expect(raw(row.id).resumed_at).toBe('2026-04-24T20:50:39.866Z');
        expect(raw(row.id).updated_at).toMatch(ISO_RE);
    });

    it('(b) Drizzle writes ISO 8601 text', async () => {
        const row = await drizzleInsert({ paused_at: new Date(LEGACY_AT) });
        const stored = raw(row.id);
        expect(stored.paused_at).toBe('2026-04-24T20:50:38.866Z');
        expect(stored.created_at).toMatch(ISO_RE);
        expect(stored.updated_at).toMatch(ISO_RE);
        expect(row.paused_at).toBeInstanceOf(Date);
        expect(row.paused_at.getTime()).toBe(LEGACY_AT);
    });
});


describe('(c) cross-stack reads', () => {
    it('Sequelize reads a Drizzle-written row as the same instant', async () => {
        const row = await drizzleInsert({ paused_at: new Date(LEGACY_AT), resumed_at: new Date(LEGACY_AT + 5) });
        const found = await RoundPause.findByPk(row.id);
        expect(found.paused_at).toBeInstanceOf(Date);
        expect(found.paused_at.getTime()).toBe(LEGACY_AT);
        expect(found.resumed_at.getTime()).toBe(LEGACY_AT + 5);
        expect(found.createdAt.getTime()).toBe(row.created_at.getTime()); // Sequelize attr: createdAt
    });

    it('Drizzle reads a Sequelize-written row as the same instant', async () => {
        const row = await RoundPause.create({ round_id: 'r', paused_at: new Date(LEGACY_AT) });
        const [found] = await db.select().from(schema.round_pauses).where(eq(schema.round_pauses.id, row.id));
        expect(found.paused_at).toBeInstanceOf(Date);
        expect(found.paused_at.getTime()).toBe(LEGACY_AT);
        expect(found.created_at.getTime()).toBe(row.createdAt.getTime()); // Sequelize attr: createdAt
    });
});


describe('(e) ordering and comparison across stacks', () => {
    it('ORDER BY / WHERE on the column follow chronological order', async () => {
        const t = (s) => new Date(LEGACY_AT + s * 1000);
        await RoundPause.create({ id: 's3', round_id: 'r', paused_at: t(3) });
        await drizzleInsert({ id: 'd1', paused_at: t(1) });
        await RoundPause.create({ id: 's0', round_id: 'r', paused_at: t(0) });
        await drizzleInsert({ id: 'd2', paused_at: t(2) });

        const viaSql = db.$client.query('SELECT id FROM round_pauses ORDER BY paused_at').all().map((r) => r.id);
        expect(viaSql).toEqual(['s0', 'd1', 'd2', 's3']);

        const viaDrizzle = await db.select().from(schema.round_pauses).orderBy(asc(schema.round_pauses.paused_at));
        expect(viaDrizzle.map((r) => r.id)).toEqual(['s0', 'd1', 'd2', 's3']);

        const viaSequelize = await RoundPause.findAll({ order: [['paused_at', 'ASC']] });
        expect(viaSequelize.map((r) => r.id)).toEqual(['s0', 'd1', 'd2', 's3']);

        // WHERE values go through the same stringifier in both stacks.
        const laterSeq = await RoundPause.findAll({ where: { paused_at: { [Op.gt]: t(1) } }, order: [['paused_at', 'ASC']] });
        expect(laterSeq.map((r) => r.id)).toEqual(['d2', 's3']);
        const laterDrz = await db.select().from(schema.round_pauses)
            .where(gt(schema.round_pauses.paused_at, t(1))).orderBy(asc(schema.round_pauses.paused_at));
        expect(laterDrz.map((r) => r.id)).toEqual(['d2', 's3']);
    });
});


describe('(f) null datetimes', () => {
    it('round-trip as null in both stacks', async () => {
        const s = await RoundPause.create({ round_id: 'r', paused_at: new Date(), resumed_at: null });
        const d = await drizzleInsert({ paused_at: new Date(), resumed_at: null });
        expect(raw(s.id).resumed_at).toBeNull();
        expect(raw(d.id).resumed_at).toBeNull();
        expect(d.resumed_at).toBeNull();

        expect((await RoundPause.findByPk(d.id)).resumed_at).toBeNull();
        const [fromDrizzle] = await db.select().from(schema.round_pauses).where(eq(schema.round_pauses.id, s.id));
        expect(fromDrizzle.resumed_at).toBeNull();
    });
});


describe('caveat: Sequelize on a TEXT-declared column (Drizzle baseline DDL, F-47)', () => {
    it('returns the stored ISO string unparsed, which JSON-serialises identically', async () => {
        await sequelize.query('CREATE TABLE t (id TEXT PRIMARY KEY, at TEXT, created_at TEXT, updated_at TEXT)');
        const T = sequelize.define('T', { id: { type: DataTypes.STRING, primaryKey: true }, at: DataTypes.DATE },
            { tableName: 't', underscored: true });
        await T.create({ id: 'x', at: new Date(LEGACY_AT) });
        const found = await T.findByPk('x');
        expect(found.at).toBe('2026-04-24T20:50:38.866Z');
        expect(JSON.stringify(found.at)).toBe(JSON.stringify(new Date(LEGACY_AT)));
    });
});
