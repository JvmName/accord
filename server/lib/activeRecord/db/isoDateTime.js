/**
 * Make Sequelize's SQLite DATE type store ISO 8601 text (FINDINGS F-39).
 *
 * WHAT: a one-time patch, applied when this module is first required, of the
 * Sequelize 6 SQLite `DATE` data type:
 *   - `DATE.prototype._stringify` (write side). Every path that turns a JS
 *     date into SQL goes through it: INSERT/UPDATE values and bind params
 *     (`field.type.stringify` / `bindParam` in the query generator) and WHERE
 *     values (`SqlString.escape` calls `dataTypes.sqlite.DATE.prototype
 *     .stringify` for any Date, typed or not). Default Sequelize writes
 *     `YYYY-MM-DD HH:mm:ss.SSS +00:00`; now it writes `Date#toISOString()`.
 *   - `DATE.parse` (read side). Sequelize's version does
 *     `if (!date.includes('+')) new Date(date + timezone)`, which turns ISO
 *     `...Z` into `...Z+00:00` (Invalid Date). The replacement is
 *     `new Date(value)`; ISO is the only supported stored format.
 *
 * WHY: user decision 2026-10-11 — all datetimes are ISO 8601 UTC text. Until
 * the task 11 cutover Sequelize and Drizzle (`src/db/columns.ts`) share the
 * same tables, and both write `Date#toISOString()` so a column never
 * holds two formats (string ordering would break: ' ' sorts before 'T').
 * The HTTP API is unaffected: it serialises the resulting `Date` objects.
 *
 * HOW it takes effect: the SQLite connection manager copies `DATE.parse` into
 * Sequelize's parser store (`dialects/parserStore`) when a `Sequelize` is
 * constructed, so this must load before the first connection — hence the
 * require at the top of `./connection.js`. `refreshParserStore()` is called
 * here too, for any instance that already exists.
 *
 * CAVEAT: Sequelize only runs `DATE.parse` for columns whose DECLARED type is
 * DATETIME (it reads `PRAGMA table_info`). A table created by the Drizzle
 * baseline declares TEXT, so Sequelize returns those values as raw strings
 * (FINDINGS F-47).
 *
 * REMOVE this file (and its require in `./connection.js`) when the Sequelize
 * layer is deleted in task 15.
 */
// Internal subpaths on purpose: they are the exact module instances Sequelize
// itself uses, and they stay real when a test `mock.module()`s 'sequelize'.
const dataTypes                         = require('sequelize/lib/data-types');
const parserStore                       = require('sequelize/lib/dialects/parserStore')('sqlite');


const SqliteDATE = dataTypes.sqlite.DATE;


function isoStringify(date) {
    // Sequelize may hand over a moment (from `_applyTimezone`) or a Date.
    const value = date && typeof date.toDate === 'function' ? date.toDate() : date;
    const asDate = value instanceof Date ? value : new Date(value);
    // Mirror moment's `format()` on an invalid date instead of throwing.
    if (Number.isNaN(asDate.getTime())) return 'Invalid date';
    return asDate.toISOString();
}


function isoParse(value) {
    return new Date(value);
}


function refreshParserStore() {
    parserStore.refresh(SqliteDATE);
}


if (!SqliteDATE.__accordIsoDateTime) {
    SqliteDATE.prototype._stringify = isoStringify;
    SqliteDATE.parse                = isoParse;
    SqliteDATE.__accordIsoDateTime  = true;
    refreshParserStore();
}


module.exports = {
    isoStringify,
    isoParse,
    refreshParserStore,
};
