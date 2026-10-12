/**
 * Request validation (server-ts task 12): Zod replaces the legacy
 * `validateParameters` DSL (`serverController.js:224-294`).
 *
 * The OUTPUT is the legacy one, byte for byte: a `ValidationError` carrying
 * `{ "<dotted.path>": ["<message>", ...] }`, rendered by the error handler as
 * `400 { data: { errors }, status: 'bad request' }`, the shape
 * `ApiResult.Error(Map<String, List<String>>)` decodes. Keys are the issue path
 * joined with `.` (legacy `valueForParameterName` addressed nested values as
 * `red.id`); messages are whatever the route's schema sets, which is why the
 * runtime schemas in `routes/requests.ts` carry the legacy message strings.
 *
 * What is validated, and against what:
 *   - `query` and `body` schemas parse the legacy MERGED bag (F-73), because
 *     legacy validations read `this.params` (path < body < query). Object
 *     schemas strip unknown keys, so each yields exactly its declared keys.
 *   - `params` parses the PATH parameters (`req.params`), which Express always
 *     yields as strings. State resolution (not `ctx.params`) honours the legacy
 *     override; see `requestState.ts`.
 *
 * Validation runs AFTER the authorization gates, as every legacy action called
 * `authorize()` before `validateParameters()` (probed: `POST /mats` without a
 * user and without a name answers 401, not 400).
 */
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import type { ErrorMap } from '../../contract/envelope';
import { ValidationError } from '../errors';
import { getRequestState } from './requestState';

export interface ParsedRequest {
    params: unknown;
    query: unknown;
    body: unknown;
}

/** Appends a schema's issues to `errors` in legacy shape; returns the parsed value on success. */
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
 * (legacy `validateParameters` collected all fields before throwing).
 */
export function validateRequest(
    schemas: { params: z.ZodType; query: z.ZodType; body: z.ZodType },
    pathParams: unknown,
    input: Record<string, unknown>,
): ParsedRequest {
    const errors: ErrorMap = {};
    const params = collect(schemas.params, { ...(pathParams as object) }, errors);
    const body   = collect(schemas.body, input, errors);
    const query  = collect(schemas.query, input, errors);

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
            res.locals[PARSED_KEY] = validateRequest(schemas, req.params, getRequestState(res).input);
        } catch (err) {
            next(err);
            return;
        }
        next();
    };
}
