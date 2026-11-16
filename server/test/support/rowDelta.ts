/**
 * Compact, lossless records of what a command did to the database: the
 * ordered write log plus the row changes between two dumps, matched by rowid.
 *
 * Ids are replaced by stable labels where they would otherwise differ from
 * run to run: ids the seed generates at random become `<seed:table:n>` (n in
 * rowid order), and ids created by the command become `<gen:n>` (in order of
 * first appearance: the write log first, then the tables).
 */
import * as H from '../services/support';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Every application row with its rowid, in rowid order, as stored. */
function dumpRows(client) {
    const cols = (t) => H.COLUMNS[t].map((c) => `"${c}"`).join(', ');
    return Object.fromEntries(H.TABLES.map((t) => [
        t, client.query(`SELECT rowid AS __rowid, ${cols(t)} FROM "${t}" ORDER BY rowid`).all(),
    ]));
}

/** The write log (audit triggers) after `afterSeq`. */
function readAudit(client, afterSeq = 0) {
    return client.query('SELECT seq, tbl, op, row FROM zz_audit WHERE seq > ? ORDER BY seq').all(afterSeq)
        .map(({ seq, tbl, op, row }) => ({ seq, tbl, op, row: JSON.parse(row) }));
}

function lastAuditSeq(client) {
    return client.query('SELECT coalesce(max(seq), 0) AS n FROM zz_audit').get().n;
}

/** Labels for the ids in `rows` that are not in `staticIds` (seed rows created without a fixed id). */
function seedLabels(rows, staticIds) {
    const labels = new Map();
    for (const t of H.TABLES) {
        let n = 0;
        for (const row of rows[t]) {
            if (row.id !== undefined && !staticIds.has(row.id) && !labels.has(row.id)) labels.set(row.id, `<seed:${t}:${n++}>`);
        }
    }
    return labels;
}

/** Every id present in `rows`. */
function idsOf(rows) {
    const ids = new Set();
    for (const t of H.TABLES) for (const row of rows[t]) if (row.id !== undefined) ids.add(row.id);
    return ids;
}

function relabel(row, labels) {
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, labels.has(v) ? labels.get(v) : v]));
}

/**
 * Per table, the changes from `before` to `after`: `['+', rowid, row]` for a
 * new row, `['~', rowid, { column: value }]` for changed columns, `['-', rowid]`
 * for a removed row.
 */
function rowChanges(before, after, labels) {
    const changes = {};
    for (const t of H.TABLES) {
        const old = new Map<unknown, any>(before[t].map((r) => [r.__rowid, r]));
        const now = new Map<unknown, any>(after[t].map((r) => [r.__rowid, r]));
        const list: any[] = [];
        for (const [rowid, row] of now) {
            const { __rowid, ...values } = row;
            const prev = old.get(rowid);
            if (!prev) {
                list.push(['+', rowid, relabel(values, labels)]);
                continue;
            }
            const changed = {};
            for (const c of H.COLUMNS[t]) if (prev[c] !== row[c]) changed[c] = labels.has(row[c]) ? labels.get(row[c]) : row[c];
            if (Object.keys(changed).length) list.push(['~', rowid, changed]);
        }
        for (const rowid of old.keys()) if (!now.has(rowid)) list.push(['-', rowid]);
        list.sort((a, b) => a[1] - b[1]);
        if (list.length) changes[t] = list;
    }
    return changes;
}

/**
 * Extends `labels` with `<gen:n>` for every id in `audit` / `after` that is
 * not in `known`, in order of first appearance.
 */
function labelGenerated(labels, known, audit, after) {
    let n = 0;
    for (const v of labels.values()) if (String(v).startsWith('<gen:')) n++;
    const visit = (row) => {
        const id = row.id;
        if (id !== undefined && id !== null && !known.has(id) && !labels.has(id)) labels.set(id, `<gen:${n++}>`);
    };
    for (const e of audit) visit(e.row);
    for (const t of H.TABLES) after[t].forEach(visit);
    return labels;
}

function auditEntries(audit, labels) {
    return audit.map((e) => [e.tbl, e.op, relabel(e.row, labels)]);
}

export { UUID_RE, auditEntries, dumpRows, idsOf, labelGenerated, lastAuditSeq, readAudit, relabel, rowChanges, seedLabels };
