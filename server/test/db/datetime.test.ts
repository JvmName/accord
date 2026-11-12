import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
/**
 * Every datetime is stored as ISO 8601 UTC text (`Date#toISOString()`) and
 * read back as a `Date`. Rows written as raw ISO text (as any other writer of
 * the file does) read back the same way, and ordering and comparison on the
 * column follow chronological order. Never touches a real sqlite file.
 */
import { asc, eq, gt } from 'drizzle-orm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, migrateDb, schema } from '../../src/db';

const ISO_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const AT     = Date.UTC(2026, 3, 24, 20, 50, 38, 866);

let dir;
let db;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accord-datetime-'));
    db  = createDb({ path: path.join(dir, 'test.sqlite') });
    migrateDb(db);
});

afterEach(() => {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
});

const raw = (id) => db.$client.query('SELECT * FROM round_pauses WHERE id = ?').get(id);

const drizzleInsert = (values) => db.insert(schema.round_pauses).values({
    round_id: 'r', created_at: new Date(), updated_at: new Date(), ...values,
}).returning().then(([row]) => row);

/** A row written as raw text, the way any other writer of the file stores it. */
function rawInsert({ id, pausedAt, resumedAt = null }: { id: string; pausedAt: Date; resumedAt?: Date | null }) {
    const now = new Date().toISOString();
    db.$client.query('INSERT INTO round_pauses (id, round_id, paused_at, resumed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, 'r', pausedAt.toISOString(), resumedAt ? resumedAt.toISOString() : null, now, now);
}


describe('codec', () => {
    it('writes Date#toISOString()', async () => {
        const d = new Date(AT);
        expect(d.toISOString()).toBe('2026-04-24T20:50:38.866Z');
        const row = await drizzleInsert({ id: 'x', paused_at: d });
        expect(raw(row.id).paused_at).toBe('2026-04-24T20:50:38.866Z');
    });

    it('reads unparseable text as an Invalid Date rather than throwing', async () => {
        db.$client.query("INSERT INTO round_pauses (id, round_id, paused_at, created_at, updated_at) VALUES ('g', 'r', 'garbage', 'garbage', 'garbage')").run();
        const [found] = await db.select().from(schema.round_pauses).where(eq(schema.round_pauses.id, 'g'));
        expect(found.paused_at).toBeInstanceOf(Date);
        expect(Number.isNaN(found.paused_at.getTime())).toBe(true);
    });
});


describe('raw stored format', () => {
    it('writes ISO 8601 text for every datetime column, and on update', async () => {
        const row = await drizzleInsert({ paused_at: new Date(AT) });
        const stored = raw(row.id);
        expect(stored.paused_at).toBe('2026-04-24T20:50:38.866Z');
        expect(stored.created_at).toMatch(ISO_RE);
        expect(stored.updated_at).toMatch(ISO_RE);
        expect(row.paused_at).toBeInstanceOf(Date);
        expect(row.paused_at.getTime()).toBe(AT);

        await db.update(schema.round_pauses).set({ resumed_at: new Date(AT + 1000), updated_at: new Date() }).where(eq(schema.round_pauses.id, row.id));
        expect(raw(row.id).resumed_at).toBe('2026-04-24T20:50:39.866Z');
        expect(raw(row.id).updated_at).toMatch(ISO_RE);
    });
});


describe('reads', () => {
    it('reads a row written as raw ISO text as the same instant', async () => {
        rawInsert({ id: 's', pausedAt: new Date(AT), resumedAt: new Date(AT + 5) });
        const [found] = await db.select().from(schema.round_pauses).where(eq(schema.round_pauses.id, 's'));
        expect(found.paused_at).toBeInstanceOf(Date);
        expect(found.paused_at.getTime()).toBe(AT);
        expect(found.resumed_at.getTime()).toBe(AT + 5);
        expect(found.created_at.toISOString()).toBe(raw('s').created_at);
    });
});


describe('ordering and comparison', () => {
    it('ORDER BY / WHERE on the column follow chronological order, whoever wrote the rows', async () => {
        const t = (s) => new Date(AT + s * 1000);
        rawInsert({ id: 's3', pausedAt: t(3) });
        await drizzleInsert({ id: 'd1', paused_at: t(1) });
        rawInsert({ id: 's0', pausedAt: t(0) });
        await drizzleInsert({ id: 'd2', paused_at: t(2) });

        const viaSql = db.$client.query('SELECT id FROM round_pauses ORDER BY paused_at').all().map((r) => r.id);
        expect(viaSql).toEqual(['s0', 'd1', 'd2', 's3']);

        const viaDrizzle = await db.select().from(schema.round_pauses).orderBy(asc(schema.round_pauses.paused_at));
        expect(viaDrizzle.map((r) => r.id)).toEqual(['s0', 'd1', 'd2', 's3']);

        // WHERE values go through the same encoder as written values.
        const later = await db.select().from(schema.round_pauses)
            .where(gt(schema.round_pauses.paused_at, t(1))).orderBy(asc(schema.round_pauses.paused_at));
        expect(later.map((r) => r.id)).toEqual(['d2', 's3']);
    });
});


describe('null datetimes', () => {
    it('round-trip as null', async () => {
        rawInsert({ id: 's', pausedAt: new Date(), resumedAt: null });
        const d = await drizzleInsert({ paused_at: new Date(), resumed_at: null });
        expect(raw('s').resumed_at).toBeNull();
        expect(raw(d.id).resumed_at).toBeNull();
        expect(d.resumed_at).toBeNull();
        const [fromRaw] = await db.select().from(schema.round_pauses).where(eq(schema.round_pauses.id, 's'));
        expect(fromRaw.resumed_at).toBeNull();
    });
});
