/**
 * Errors thrown from a route handler, and how each is rendered: the cases
 * behind the error-rendering part of test/http/envelope.test.ts and the
 * `errorRendering` snapshot fixture. Not a test file.
 *
 * `make(K)` builds the error from the error classes in `K`
 * (`{ AuthorizationError, ValidationError }`), so the same case can be thrown
 * through any implementation of the error handler.
 */
/** A SQLite driver error as bun:sqlite raises it: the message names the constraint, `code` the kind. */
const driverError = (message: string, code: string) => Object.assign(new Error(message), { code });

/** The error classes `make` receives. The real constructors ignore the message they are given; the cases still pass one. */
interface ErrorKinds {
    AuthorizationError: new (message?: string) => Error;
    ValidationError:    new (errors: Record<string, string[]>) => Error;
}

const ERROR_CASES = [
    { label: 'AuthorizationError', status: 401, make: (K: ErrorKinds) => new K.AuthorizationError('super secret detail') },
    { label: 'AuthorizationError without a message', status: 401, make: (K: ErrorKinds) => new K.AuthorizationError() },
    { label: 'a SUBCLASS of AuthorizationError', status: 401, make: (K: ErrorKinds) => new (class extends K.AuthorizationError {})('nope') },
    { label: 'ValidationError with errors', status: 400, make: (K: ErrorKinds) => new K.ValidationError({ name: ['required'], judge_count: ['a', 'b'] }) },
    { label: 'ValidationError with one error', status: 400, make: (K: ErrorKinds) => new K.ValidationError({ name: ['required'] }) },
    { label: 'ValidationError({})', status: 400, make: (K: ErrorKinds) => new K.ValidationError({}) },
    { label: 'a SUBCLASS of ValidationError', status: 400, make: (K: ErrorKinds) => new (class extends K.ValidationError {})({ a: ['b'] }) },
    { label: 'unique violation on one column', status: 400,
      make: () => driverError('UNIQUE constraint failed: mat_codes.code', 'SQLITE_CONSTRAINT_UNIQUE') },
    { label: 'unique violation on a composite index', status: 400,
      make: () => driverError('UNIQUE constraint failed: mat_codes.mat_id, mat_codes.role', 'SQLITE_CONSTRAINT_UNIQUE') },
    { label: 'primary key violation', status: 400,
      make: () => driverError('UNIQUE constraint failed: users.id', 'SQLITE_CONSTRAINT_PRIMARYKEY') },
    { label: 'NOT NULL violation is not a unique violation (falls to 500)', status: 500,
      make: () => driverError('NOT NULL constraint failed: users.name', 'SQLITE_CONSTRAINT_NOTNULL') },
    { label: 'foreign key violation (falls to 500)', status: 500,
      make: () => driverError('FOREIGN KEY constraint failed', 'SQLITE_CONSTRAINT_FOREIGNKEY') },
    { label: 'generic Error', status: 500, make: () => new Error('boom') },
    { label: 'thrown non-Error object', status: 500, make: () => ({ name: 'NotAnError' }) },
    { label: 'Error subclass', status: 500, make: () => new (class extends Error {})('unexpected') },
];

export { ERROR_CASES };
