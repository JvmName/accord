/**
 * Request validation: Zod schemas for the path parameters, the query and the
 * body, each parsed from its own part of the request (a body or query key
 * never stands in for a path parameter, and string values are not
 * JSON-decoded).
 *
 * A failure is a `ValidationError` carrying `{ "<dotted.path>": ["<message>", ...] }`,
 * rendered by the error handler as `400 { data: { errors }, status: 'bad
 * request' }`, the shape `ApiResult.Error(Map<String, List<String>>)` decodes.
 * Object schemas strip unknown keys, so each part yields exactly its declared keys.
 *
 * Validation runs AFTER the authorization gates (`POST /mats` without a user
 * and without a name answers 401, not 400).
 */
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import type { ErrorMap } from '../../contract/envelope';
import { ValidationError } from '../errors';

export interface ParsedRequest {
    params: unknown;
    query: unknown;
    body: unknown;
}

/** Appends a schema's issues to `errors` keyed by dotted path; returns the parsed value on success. */
function collect(schema: z.ZodType, value: unknown, errors: ErrorMap): { ok: true; data: unknown } | { ok: false } {
    const result = schema.safeParse(value);
    if (result.success) return { ok: true, data: result.data };

    for (const issue of result.error.issues) {
        const key = issue.path.map(String).join('.');
        (errors[key] ??= []).push(issue.message);
    }
    return { ok: false };
}

/**
 * Validates one request. Throws `ValidationError` with every failing field
 */
export function validateRequest(
    schemas: { params: z.ZodType; query: z.ZodType; body: z.ZodType },
    req: { params?: unknown; query?: unknown; body?: unknown },
): ParsedRequest {
    const errors: ErrorMap = {};
    const params = collect(schemas.params, { ...(req.params as object) }, errors);
    const body   = collect(schemas.body, req.body ?? {}, errors);
    const query  = collect(schemas.query, req.query ?? {}, errors);

    if (Object.keys(errors).length || !params.ok || !body.ok || !query.ok) {
        throw new ValidationError(errors);
    }
    return { params: params.data, query: query.data, body: body.data };
}

const PARSED_KEY = 'accordParsedRequest';

export function getParsedRequest(res: Response): ParsedRequest {
    const parsed = res.locals[PARSED_KEY] as ParsedRequest | undefined;
    if (!parsed) throw new Error('request was not validated for this route');
    return parsed;
}

/** Express middleware: validates and stores the parsed request parts. */
export function validateMiddleware(schemas: { params: z.ZodType; query: z.ZodType; body: z.ZodType }) {
    return function validate(req: Request, res: Response, next: NextFunction): void {
        try {
            res.locals[PARSED_KEY] = validateRequest(schemas, req);
        } catch (err) {
            next(err);
            return;
        }
        next();
    };
}
