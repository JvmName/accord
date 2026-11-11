/**
 * Task 15a proof: the Drizzle-based test/contract/seed.ts writes exactly the
 * rows the legacy Sequelize seed (legacySeed.ts) wrote.
 *
 * legacy: temp file, legacy migrations, legacy seed.  new: temp file, Drizzle
 * baseline migration, new seed. Both dumped: every application table, every
 * column, rowid order, value AND SQLite storage class (typeof), ids and
 * timestamps exactly as stored. The only values allowed to differ are the
 * riding-time vote ids, which both seeds generate at random (UUID v4); they
 * are compared by position and checked to be v4 UUIDs on both sides.
 * Finally the new seed's labelled dump is checked against seed.jsonl.
 *
 *   cd server && bun ../.ai/plans/server-ts/artifacts/freeze/seedEquivalence.js
 */
const X = require('./legacyHarness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setSystemTime } = require('bun:test');
const { Database } = require('bun:sqlite');

const H = X.req('test/services/support');
const D = X.req('test/support/rowDelta');
const F = X.req('test/support/frozen');

function fullDump(file) {
    const client = new Database(file, { readonly: true });
    const out = {};
    for (const t of H.TABLES) {
        const cols = H.COLUMNS[t];
        const sel = cols.map((c) => `"${c}", typeof("${c}") AS "${c}__type"`).join(', ');
        out[t] = client.query(`SELECT rowid AS __rowid, ${sel} FROM "${t}" ORDER BY rowid`).all();
    }
    client.close();
    return out;
}

async function main() {
    const clock = { set: (ms) => setSystemTime(new Date(ms)) };

    const legacyFile = X.useTemporaryDatabase('accord-seed-legacy');
    await X.legacyMigrate();
    const legacySeed = require('./legacySeed.ts');
    await legacySeed.seed(clock);
    setSystemTime();

    const newFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'accord-seed-new-')), 'database.sqlite');
    const { createDb, migrateDb } = X.req('src/db');
    const db = createDb({ path: newFile });
    migrateDb(db);
    const newSeed = X.req('test/contract/seed.ts');
    await newSeed.seed(clock, db);
    setSystemTime();
    db.$client.close();

    const a = fullDump(legacyFile);
    const b = fullDump(newFile);
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const diffs = [];
    let rows = 0;
    let values = 0;
    let randomIds = 0;
    for (const t of H.TABLES) {
        if (a[t].length !== b[t].length) diffs.push(`${t}: ${a[t].length} rows vs ${b[t].length}`);
        for (let i = 0; i < Math.max(a[t].length, b[t].length); i++) {
            const ra = a[t][i] || {};
            const rb = b[t][i] || {};
            rows++;
            for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
                values++;
                if (ra[k] === rb[k]) continue;
                if (t === 'riding_time_votes' && k === 'id' && v4.test(ra[k]) && v4.test(rb[k])) { randomIds++; continue; }
                diffs.push(`${t} row ${i} ${k}: legacy=${JSON.stringify(ra[k])} new=${JSON.stringify(rb[k])}`);
            }
        }
    }
    console.log(`compared ${rows} rows, ${values} values (incl. rowid and storage class); random vote ids compared by position: ${randomIds}`);
    console.log(`differences: ${diffs.length}`);
    for (const d of diffs) console.log('  ' + d);

    // The new seed against the committed seed fixture (labelled form).
    const client = new Database(newFile, { readonly: true });
    const seedRows = D.dumpRows(client);
    client.close();
    const labels = D.seedLabels(seedRows, new Set(Object.values(newSeed.IDS)));
    const records = [];
    for (const t of H.TABLES) for (const row of seedRows[t]) { const { __rowid, ...v } = row; records.push({ key: `${t}:${__rowid}`, row: D.relabel(v, labels) }); }
    const same = F.renderFixture('seed', records) === fs.readFileSync(F.fixturePath('seed'), 'utf8');
    console.log(`new seed == committed seed.jsonl byte for byte: ${same}`);
    process.exit(diffs.length === 0 && same ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
