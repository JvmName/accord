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
 * pinned by `test/characterization/errorMapping.test.ts`:
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
 * Thrown by a `notImplemented()` placeholder handler. The server refuses to
 * start while any route has one; it is an ordinary `Error` subclass, so if a
 * placeholder were ever reached it would surface as a loud 500, never as a
 * silent success.
 */
export class NotImplementedError extends Error {}

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
 * The error map for a unique-constraint violation raised through Drizzle /
 * `bun:sqlite`: one `"<field> must be unique"` entry per violated column
 * (`UNIQUE constraint failed: mat_codes.mat_id, mat_codes.role` gives
 * `mat_id` and `role`). The driver message is not echoed.
 *
 * Only a real unique (or primary key) violation matches; any other SQLite
 * constraint failure (NOT NULL, CHECK, foreign key) is not a client-fixable
 * duplicate and falls through to the generic 500 (F-78). Returns `null` when
 * `err` is not a unique violation.
 */
export function uniqueViolationErrors(err: unknown): ErrorMap | null {
    const driver = findSqliteDriverError(err);
    if (!driver) return null;

    const failed = String(driver.message ?? '').match(/UNIQUE constraint failed: (.*)/)?.[1];
    if (failed === undefined) return null;

    const errors: ErrorMap = {};
    for (const columnWithTable of failed.split(', ')) {
        const field = columnWithTable.split('.').pop() ?? columnWithTable;
        (errors[field] ??= []).push(`${field} must be unique`);
    }
    return errors;
}
