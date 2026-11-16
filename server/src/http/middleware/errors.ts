/**
 * The JSON error handler.
 *
 * Branch order, pinned by `test/characterization/errorMapping.test.ts` and
 * replayed against this handler by `test/http/envelope.test.ts`:
 *
 *   1. unique-constraint violation -> 400 `{ errors: { field: ["<field> must be unique"] } }`
 *   2. `instanceof AuthorizationError` -> 401 `{ data: null }`        
 *   3. `instanceof ValidationError`    -> 400 `{ data: { errors } }`  
 *   4. anything else -> 500 `{ data: { error: err.message } }` (a missing message renders `null`
 *      through the envelope's undefined -> null walk)
 *
 * Branches 1 and 4 log the error when `dev` is set; branches 2 and 3 return
 * before logging.
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
    } else if (err instanceof AuthorizationError) {
        sendEnvelope(res, 401, undefined);
        return;
    } else if (err instanceof ValidationError) {
        sendRendered(res, renderErrors(err.errors));
        return;
    } else {
        sendEnvelope(res, 500, { error: (err as { message?: unknown } | null | undefined)?.message });
    }

    if (options.dev && options.logger) options.logger.error(err);
}

/**
 * Route-level Express error middleware. Every error in the route chain,
 * including request-state resolution, is rendered by `handleError`.
 *
 * If a response was already written (impossible by construction in the new
 * pipeline, which renders once), the error is passed on rather than writing a
 * second response.
 */
export function errorMiddleware(options: ErrorHandlerOptions = {}): ErrorRequestHandler {
    return function routeErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
        if (res.headersSent) {
            next(err);
            return;
        }
        handleError(err, res, options);
    };
}
