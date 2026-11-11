/**
 * Reading and writing the snapshot fixtures under test/fixtures/frozen.
 *
 * A fixture file is JSON Lines: the first line is a header, every other line
 * is one record with a unique `key`. Object keys are sorted at every depth, so
 * writing the same data twice gives the same bytes and a diff touches only the
 * records that changed.
 */
const fs   = require('fs');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'frozen');
const FORMAT = 1;

const PROVENANCE = {
    note: 'Snapshot of the expected behavior, originally recorded from the pre-migration implementation (commit 6a55eaec2d87) on 2026-10-13. '
        + 'Updated only on purpose, never by hand: run `bun run test:update-fixtures` and review the diff.',
};

/** `undefined` cannot be written as JSON; it is kept as this marker so a missing value and `null` stay distinct. */
const UNDEFINED = { $undefined: true };

function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            if (value[key] !== undefined) out[key] = sortKeys(value[key]);
        }
        return out;
    }
    return value;
}

/** One line of canonical JSON. */
function canonical(value) {
    return JSON.stringify(sortKeys(value));
}

/** The value as it reads back from a fixture file (canonical JSON round trip). */
function asStored(value) {
    return JSON.parse(canonical(value));
}

function fixturePath(name) {
    return path.join(FIXTURE_DIR, `${name}.jsonl`);
}

function renderFixture(suite, records) {
    const keys = records.map((r) => r.key);
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (duplicates.length) throw new Error(`duplicate fixture keys in ${suite}: ${duplicates.join(', ')}`);
    const header = { ...PROVENANCE, format: FORMAT, suite, records: records.length };
    return [canonical(header), ...records.map(canonical)].join('\n') + '\n';
}

function writeFixture(suite, records) {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.writeFileSync(fixturePath(suite), renderFixture(suite, records));
}

/** `{ header, records }`, where `records` maps each key to its record. */
function readFixture(suite) {
    const lines = fs.readFileSync(fixturePath(suite), 'utf8').split('\n').filter(Boolean);
    const header = JSON.parse(lines[0]);
    if (header.suite !== suite || header.format !== FORMAT) throw new Error(`unexpected header in ${suite}.jsonl`);
    const records = new Map();
    for (const line of lines.slice(1)) {
        const record = JSON.parse(line);
        records.set(record.key, record);
    }
    if (records.size !== header.records) throw new Error(`${suite}.jsonl holds ${records.size} records, its header says ${header.records}`);
    return { header, records };
}

module.exports = { FIXTURE_DIR, UNDEFINED, asStored, canonical, fixturePath, readFixture, renderFixture, sortKeys, writeFixture };
