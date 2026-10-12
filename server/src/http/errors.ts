/**
 * Error classes and error classification for the typed route registry
 * (server-ts task 12).
 *
 * These are NEW classes, deliberately not the legacy ones from
 * `lib/server/serverController.js`: the legacy stack keeps running the app
 * until 13c, and `lib/server` is deleted in task 15. The new error handler
 * (`middleware/errors.ts`) matches THESE classes.
 *
 * Classification reproduces `ApplicationServer#handleError`
 * (`lib/server/applicationServer.js:272-296`) exactly, including two quirks
 * pinned by `test/characterization/errorMapping.test.js`:
 *   - F-13: classes are matched by CONSTRUCTOR IDENTITY, not `instanceof`, so a
 *     subclass of either class falls through to the generic 500 branch.
 *   - F-14: the unique-violation branch writes the raw driver message as a bare
 *     STRING under the literal key `"null"`.
 */
import type { ErrorMap } from '../contract/envelope';

/** Thrown when a permission check fails -> 401 `{ data: null, status: 'unauthorized' }`. */
export class AuthorizationError extends Error {}

/**
 * Thrown for request validation failures -> 400 `{ data: { errors }, status: 'bad request' }`.
 *
 * Mirrors the legacy class: the map is held privately and the getter returns
 * a deep copy (`structuredClone`), so a caller cannot mutate it after the fact.
 */
export class ValidationError extends Error {
    readonly #errors: ErrorMap;

    constructor(errors: ErrorMap) {
        super();
        this.#errors = errors;
    }

    get errors(): ErrorMap {
        return structuredClone(this.#errors);
    }
}

/**
 * Thrown by every placeholder handler in `routes/` (the system and docs routes,
 * still served by the legacy controllers). Deliberately an ordinary `Error` subclass, so if a placeholder
 * were ever reached it would surface as a loud 500, never as a silent success.
 */
export class NotImplementedError extends Error {}

/**
 * The F-14 error map, as the legacy Sequelize branch rendered it:
 * one `"<field> must be unique"` entry per field, plus (when there is a driver
 * error) the driver message as a bare string under the key `"null"`.
 *
 * The `"null"` value is a string, NOT a `string[]`, which is why the return
 * type is wider than `ErrorMap`; the Kotlin client cannot decode it (F-14,
 * scheduled for task 18).
 */
export type UniqueViolationErrors = Record<string, string[] | string>;

interface DriverError {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
}

/**
 * Finds the SQLite driver error behind `err`, if `err` is (or wraps) one.
 *
 * Drizzle wraps every failed statement in `DrizzleQueryError` and puts the
 * `bun:sqlite` `SQLiteError` on `.cause`; this walks the `cause` chain (bounded)
 * so it works whether or not the error was wrapped.
 */
function findSqliteDriverError(err: unknown): DriverError | null {
    let current: unknown = err;
    for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
        const candidate = current as DriverError;
        if (typeof candidate.code === 'string' && candidate.code.startsWith('SQLITE_CONSTRAINT')) {
            return candidate;
        }
        current = candidate.cause;
    }
    return null;
}

/**
 * Port of the Sequelize unique-constraint branch, re-targeted at SQLite errors
 * raised through Drizzle / `bun:sqlite`.
 *
 * Which errors the legacy branch caught: Sequelize's SQLite dialect
 * (`sequelize/lib/dialects/sqlite/query.js#formatError`) turns EVERY
 * `SQLITE_CONSTRAINT*` error into a `SequelizeUniqueConstraintError`, except a
 * message containing `FOREIGN KEY constraint failed`. Its fields come from
 * `/columns (.*?) are/` or `/UNIQUE constraint failed: (.*)/` (each
 * `table.column` -> `column`); its item messages are `"<field> must be
 * unique"`; `err.parent` is the driver error.
 *
 * The driver message differs between drivers: the legacy `sqlite3` package
 * produced `SQLITE_CONSTRAINT: UNIQUE constraint failed: mat_codes.code`,
 * `bun:sqlite` produces `UNIQUE constraint failed: mat_codes.code` (code on a
 * separate property). The `"null"` value is rebuilt in the legacy format
 * (`SQLITE_CONSTRAINT: <message>`) so the leaked string (F-14) is
 * byte-identical to what legacy clients saw.
 *
 * An error that is literally named `SequelizeUniqueConstraintError` (with
 * Sequelize's `errors[]`/`parent` shape) is still honoured, exactly as the
 * legacy branch matched it by name; that keeps the error-mapping parity test
 * replayable verbatim against this handler.
 *
 * Returns `null` when `err` is not a unique-constraint error.
 */
export function uniqueViolationErrors(err: unknown): UniqueViolationErrors | null {
    if (err && typeof err === 'object' && (err as { name?: unknown }).name == 'SequelizeUniqueConstraintError') {
        const legacy = err as { errors: Array<{ path: string; message: string }>; parent?: { message: string } };
        const errors: UniqueViolationErrors = {};
        for (const item of legacy.errors) {
            errors[item.path] = (errors[item.path] as string[]) || [];
            (errors[item.path] as string[]).push(item.message);
        }
        if (legacy.parent) errors['null'] = legacy.parent.message;
        return errors;
    }

    const driver = findSqliteDriverError(err);
    if (!driver) return null;

    const message = String(driver.message ?? '');
    if (message.includes('FOREIGN KEY constraint failed')) return null;

    let fields: string[] = [];
    let match = message.match(/columns (.*?) are/);
    if (match !== null && match.length >= 2) {
        fields = match[1].split(', ');
    } else {
        match = message.match(/UNIQUE constraint failed: (.*)/);
        if (match !== null && match.length >= 2) {
            fields = match[1].split(', ').map(columnWithTable => columnWithTable.split('.')[1]);
        }
    }

    const errors: UniqueViolationErrors = {};
    for (const field of fields) {
        errors[field] = (errors[field] as string[]) || [];
        (errors[field] as string[]).push(field ? `${field} must be unique` : 'Must be unique');
    }
    errors['null'] = message.startsWith('SQLITE_CONSTRAINT') ? message : `SQLITE_CONSTRAINT: ${message}`;
    return errors;
}
