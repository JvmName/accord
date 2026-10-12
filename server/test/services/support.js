/**
 * Legacy-vs-new PARITY HARNESS for the lifecycle services (server-ts task 10b).
 * Not a test file.
 *
 * Two SEPARATE scratch databases:
 *   - legacy: a temp FILE created by the legacy Sequelize migrations and seeded
 *     through the legacy models with the contract fixture graph
 *     (test/contract/seed.ts). Only the Sequelize stack runs commands on it.
 *   - modern: an in-memory DB created by the Drizzle baseline (./drizzle).
 *     Only the new services run commands on it.
 * Sequelize is never pointed at a Drizzle-baseline DB (FINDINGS F-47), and no
 * real sqlite file is touched (the legacy file lives under $TMPDIR).
 *
 * Identical seeding: after the legacy seed, every application row is
 * snapshotted (raw SQLite values, with rowid), and before each scenario BOTH
 * databases are reset to exactly that snapshot (same bytes, same rowids), plus
 * any scenario-specific rows written identically into both.
 *
 * What is compared after each command:
 *   1. every application table, all columns, raw stored values, rowid order;
 *   2. an AUDIT LOG of every row-level INSERT/UPDATE/DELETE, in execution
 *      order, captured by SQLite triggers installed in both DBs. This is what
 *      makes the ORDER of writes (e.g. votes closed -> pause resumed -> round
 *      ended -> match ended/break) and no-op saves (Sequelize skips an UPDATE
 *      when nothing changed) visible, even though the clock is frozen;
 *   3. the command's outcome: resolved value, or thrown error class + message.
 * Generated UUIDs (new rounds/votes/pauses) are replaced by labels in order of
 * first appearance; everything else, datetimes included, must match exactly
 * (the clock is frozen with bun:test's setSystemTime, F-10/F-18).
 */
const { Database } = require('bun:sqlite');
const { getTableColumns } = require('drizzle-orm');
const { createDb, migrateDb, schema } = require('../../src/db');

const TABLES = [
    'users', 'mats', 'mat_codes', 'matches', 'rounds', 'riding_time_votes',
    'round_pauses', 'judges_mats', 'mats_viewers', 'judges_matches',
];

/** Canonical column lists (schema.ts keys are the physical snake_case names). */
const COLUMNS = Object.fromEntries(TABLES.map((t) => [t, Object.keys(getTableColumns(schema[t]))]));

const quoteCols = (t) => COLUMNS[t].map((c) => `"${c}"`).join(', ');

/** Row-level audit triggers: one log row per INSERT/UPDATE/DELETE, in execution order. */
function installAudit(client) {
    client.run('CREATE TABLE IF NOT EXISTS zz_audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, op TEXT NOT NULL, row TEXT NOT NULL)');
    for (const t of TABLES) {
        for (const [op, ref] of [['INSERT', 'NEW'], ['UPDATE', 'NEW'], ['DELETE', 'OLD']]) {
            const json = `json_object(${COLUMNS[t].map((c) => `'${c}', ${ref}."${c}"`).join(', ')})`;
            client.run(`CREATE TRIGGER IF NOT EXISTS zz_audit_${t}_${op.toLowerCase()} AFTER ${op} ON "${t}" `
                + `BEGIN INSERT INTO zz_audit (tbl, op, row) VALUES ('${t}', '${op}', ${json}); END`);
        }
    }
}

function snapshot(client) {
    return Object.fromEntries(TABLES.map((t) => [
        t, client.query(`SELECT rowid AS __rowid, ${quoteCols(t)} FROM "${t}" ORDER BY rowid`).all(),
    ]));
}

/** Replace every application row with the snapshot (same values, same rowids) and clear the audit log. */
function restore(client, snap) {
    client.transaction(() => {
        for (const t of TABLES) {
            client.run(`DELETE FROM "${t}"`);
            const cols = ['__rowid', ...COLUMNS[t]];
            const stmt = client.prepare(`INSERT INTO "${t}" (rowid, ${quoteCols(t)}) VALUES (${cols.map(() => '?').join(', ')})`);
            for (const row of snap[t]) stmt.run(...cols.map((c) => row[c]));
        }
        client.run('DELETE FROM zz_audit');
    })();
}

/** Insert raw rows (DB representation: ISO text datetimes, 0/1 booleans) without logging them. */
function insertRaw(client, table, rows) {
    client.transaction(() => {
        for (const row of rows) {
            const cols = Object.keys(row);
            client.prepare(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
                .run(...cols.map((c) => row[c]));
        }
        client.run('DELETE FROM zz_audit');
    })();
}

function dump(client) {
    const tables = Object.fromEntries(TABLES.map((t) => [
        t, client.query(`SELECT ${quoteCols(t)} FROM "${t}" ORDER BY rowid`).all(),
    ]));
    const audit = client.query('SELECT tbl, op, row FROM zz_audit ORDER BY seq').all()
        .map(({ tbl, op, row }) => ({ tbl, op, row: JSON.parse(row) }));
    return { tables, audit };
}

/** Every `id` present in the DB right now (used to tell generated ids apart). */
function idsIn(client) {
    const ids = new Set();
    for (const t of TABLES) {
        if (!COLUMNS[t].includes('id')) continue;
        for (const { id } of client.query(`SELECT id FROM "${t}"`).all()) ids.add(id);
    }
    return ids;
}

/**
 * Replace ids generated during the command with `<gen:N>`, numbered by first
 * appearance (audit log order first, then table order). Both sides are walked
 * identically, so equal structures get equal labels.
 */
function normalize({ tables, audit }, knownIds) {
    const labels = new Map();
    const visit = (row) => {
        if (row.id !== undefined && row.id !== null && !knownIds.has(row.id) && !labels.has(row.id)) {
            labels.set(row.id, `<gen:${labels.size}>`);
        }
    };
    for (const entry of audit) visit(entry.row);
    for (const t of TABLES) tables[t].forEach(visit);
    const map = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, labels.has(v) ? labels.get(v) : v]));
    return {
        tables: Object.fromEntries(TABLES.map((t) => [t, tables[t].map(map)])),
        audit:  audit.map((e) => ({ ...e, row: map(e.row) })),
        generated: labels.size,
    };
}

/** Outcome of a command: its resolved value, or the thrown error's class and message. */
async function settle(fn) {
    try {
        return { ok: true, value: await fn() };
    } catch (err) {
        return { ok: false, error: err?.constructor?.name, message: err?.message };
    }
}

/** The modern (Drizzle-baseline) DB, with the audit triggers installed. */
function modernDb() {
    const db = createDb({ path: ':memory:' });
    migrateDb(db);
    installAudit(db.$client);
    return db;
}

/** A raw bun:sqlite handle on the legacy file (for snapshot/restore/dump only). */
function legacyClient(file) {
    const client = new Database(file);
    installAudit(client);
    return client;
}

module.exports = {
    TABLES, COLUMNS, installAudit, snapshot, restore, insertRaw, dump, idsIn, normalize, settle,
    modernDb, legacyClient,
};
