/**
 * Errors thrown from a route handler, and how each is rendered: the cases
 * behind the error-rendering part of test/http/envelope.test.ts and the
 * `errorRendering` snapshot fixture. Not a test file.
 *
 * `make(K)` builds the error from the error classes in `K`
 * (`{ AuthorizationError, ValidationError }`), so the same case can be thrown
 * through any implementation of the error handler.
 */
const uniqueError = (errors, parent) => ({ name: 'SequelizeUniqueConstraintError', errors, ...(parent ? { parent } : {}) });

const ERROR_CASES = [
    { label: 'AuthorizationError', status: 401, make: (K) => new K.AuthorizationError('super secret detail') },
    { label: 'AuthorizationError without a message', status: 401, make: (K) => new K.AuthorizationError() },
    { label: 'a SUBCLASS of AuthorizationError (falls to 500)', status: 500, make: (K) => new (class extends K.AuthorizationError {})('nope') },
    { label: 'ValidationError with errors', status: 400, make: (K) => new K.ValidationError({ name: ['required'], judge_count: ['a', 'b'] }) },
    { label: 'ValidationError with one error', status: 400, make: (K) => new K.ValidationError({ name: ['required'] }) },
    { label: 'ValidationError({})', status: 400, make: (K) => new K.ValidationError({}) },
    { label: 'a SUBCLASS of ValidationError (falls to 500)', status: 500, make: (K) => new (class extends K.ValidationError {})({ a: ['b'] }) },
    { label: 'Sequelize-shaped unique error with parent', status: 400,
      make: () => uniqueError([{ path: 'code', message: 'code must be unique' }, { path: 'code', message: 'code is already taken' }, { path: 'name', message: 'name must be unique' }],
          { message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: mat_codes.code' }) },
    { label: 'Sequelize-shaped unique error with short messages', status: 400, make: () => uniqueError([{ path: 'code', message: 'm' }], { message: 'p' }) },
    { label: 'Sequelize-shaped unique error without parent', status: 400, make: () => uniqueError([{ path: 'code', message: 'code must be unique' }]) },
    { label: 'generic Error', status: 500, make: () => new Error('boom') },
    { label: 'thrown non-Error object', status: 500, make: () => ({ name: 'NotAnError' }) },
    { label: 'Error subclass', status: 500, make: () => new (class extends Error {})('unexpected') },
];

module.exports = { ERROR_CASES };
