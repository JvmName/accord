/**
 * The JSON error handler (server-ts task 12): port of
 * `ApplicationServer#handleError` (`lib/server/applicationServer.js:272-296`).
 *
 * Branch order and matching rules are the legacy ones, pinned by
 * `test/characterization/errorMapping.test.js` and replayed against this
 * handler by `test/http/errors.test.ts`:
 *
 *   1. unique-constraint violation  -> 400 `{ errors: { field: [...], null: "<driver message>" } }` (F-14)
 *   2. `err.constructor === AuthorizationError` -> 401 `{ data: null }`         (identity, F-13)
 *   3. `err.constructor === ValidationError`    -> 400 `{ data: { errors } }`   (identity, F-13)
 *   4. anything else -> 500 `{ data: { error: err.message } }` (leaks the raw message, as legacy did;
 *      a missing message renders `null` through the envelope's undefined -> null walk)
 *
 * Branches 1 and 4 log the error when `dev` is set (legacy logged only when
 * `CONSTANTS.DEV`); branches 2 and 3 return before logging, as legacy did.
 */
import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { renderErrors, sendEnvelope, sendRendered } from '../envelope';
import { AuthorizationError, ValidationError, uniqueViolationErrors } from '../errors';

export interface ErrorLogger {
    error(err: unknown): void;
}

export interface ErrorHandlerOptions {
    dev?: boolean;
    logger?: ErrorLogger;
}

/** Renders `err` onto `res` exactly as `handleError` did. */
export function handleError(err: unknown, res: Response, options: ErrorHandlerOptions = {}): void {
    const unique = uniqueViolationErrors(err);
    if (unique) {
        sendRendered(res, renderErrors(unique));
    } else if (err && (err as object).constructor === AuthorizationError) {
        sendEnvelope(res, 401, undefined);
        return;
    } else if (err && (err as object).constructor === ValidationError) {
        sendRendered(res, renderErrors((err as ValidationError).errors));
        return;
    } else {
        sendEnvelope(res, 500, { error: (err as { message?: unknown } | null | undefined)?.message });
    }

    if (options.dev && options.logger) options.logger.error(err);
}

/**
 * Route-level Express error middleware.
 *
 * Errors raised while RESOLVING request state (before the gates set
 * `handling`) are passed on to Express's default handler, reproducing legacy,
 * where `setupRequestState` ran outside `handleError`'s try/catch.
 *
 * If a response was already written (impossible by construction in the new
 * pipeline, which renders once), the error is passed on rather than writing a
 * second response; legacy would have thrown `ERR_HTTP_HEADERS_SENT` here.
 */
export function errorMiddleware(options: ErrorHandlerOptions = {}): ErrorRequestHandler {
    return function routeErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
        const state = res.locals['accordRequestState'] as { handling?: boolean } | undefined;
        if (!state || !state.handling || res.headersSent) {
            next(err);
            return;
        }
        handleError(err, res, options);
    };
}
