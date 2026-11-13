/**
 * The `{ data, status }` response envelope.
 *
 * Rendering: `render`, `renderErrors`, `renderNotFound`, `renderUnauthorized`,
 * `formatJSONBody` and `statusText`. The goldens pin the bytes these produce;
 * `test/http/envelope.test.ts` replays the relevant goldens through this
 * module.
 */
import type { Response } from 'express';
import type { ErrorMap } from '../contract/envelope';

/**
 * The `status` text for a status code: 200/400/401/404/422/500. Any other
 * code yields `undefined`, and `JSON.stringify` then DROPS the `status` key,
 * which the Kotlin client cannot decode. 422 used to be missing; no
 * route renders a code outside this list.
 */
export function statusText(statusCode: number): string | undefined {
    switch (statusCode) {
        case 200:
            return 'ok';
        case 400:
            return 'bad request';
        case 401:
            return 'unauthorized';
        case 404:
            return 'not found';
        case 422:
            return 'unprocessable entity';
        case 500:
            return 'server error';
    }
    return undefined;
}

/**
 * The generic walk applied to every rendered body. It changes bytes on the
 * wire:
 *   - `undefined` -> `null`, at the top level AND as any object value or array
 *     element. NOTE: a serializer that writes `key: undefined`
 *     therefore renders `key: null`, NOT an absent key. Absent vs `null` is the
 *     distinction `Match.merge()` in `models_ext.kt` depends on, so omit a key
 *     by not setting it, never by setting it to `undefined`.
 *   - a `Date` -> `toISOString()`.
 *   - primitives (and `null`) pass through.
 *
 * It MUTATES the objects/arrays it is given in place and returns the same
 * reference (so a class instance keeps its prototype and any `toJSON`).
 * Handlers return plain wire objects built by the serializers.
 */
export function formatJSONBody(body: unknown): unknown {
    if (body === undefined) return null;
    if (!body || typeof body != 'object') return body;

    if (Array.isArray(body)) {
        for (const idx in body) {
            body[idx] = formatJSONBody(body[idx]);
        }
    } else if (body.constructor == Date) {
        return (body as Date).toISOString();
    } else {
        const record = body as Record<string, unknown>;
        for (const [key, val] of Object.entries(record)) {
            record[key] = formatJSONBody(val);
        }
    }

    return body;
}

/**
 * The envelope object for a body at a given status. `status` is computed from
 * the status code when the body is rendered.
 *
 * A status with no text leaves the key out of the object rather than
 * holding `undefined`. The JSON is the same either way, but the DEV response
 * validator inspects the object and would reject an extra `status` key.
 */
export function envelopeFor(statusCode: number, body: unknown): { data: unknown; status?: string } {
    const data   = formatJSONBody(body);
    const status = statusText(statusCode);
    return status === undefined ? { data } : { data, status };
}

/**
 * A response a handler (or a gate) decided to send instead of the success
 * payload (an error, a 404, a 401). Returned, not thrown, so a handler's early
 * exits are visible in its return type.
 */
export class Rendered {
    constructor(
        readonly statusCode: number,
        readonly body: unknown,
    ) {}
}

/** `renderErrors(errors, statusCode = 400)` -> `{ data: { errors }, status }`. */
export function renderErrors(errors: ErrorMap, statusCode: number = 400): Rendered {
    return new Rendered(statusCode, { errors });
}

/** `renderNotFoundResponse()` -> 404 `{ data: null, status: 'not found' }`. */
export function renderNotFound(): Rendered {
    return new Rendered(404, undefined);
}

/** `renderUnauthorizedResponse()` -> 401 `{ data: null, status: 'unauthorized' }`. */
export function renderUnauthorized(): Rendered {
    return new Rendered(401, undefined);
}

/**
 * Writes an envelope response (`res.json`, so the content type is
 * `application/json; charset=utf-8`, as in every golden).
 */
export function sendEnvelope(res: Response, statusCode: number, body: unknown): void {
    res.statusCode = statusCode;
    res.json(envelopeFor(statusCode, body));
}

/** Sends a `Rendered` decision. */
export function sendRendered(res: Response, rendered: Rendered): void {
    sendEnvelope(res, rendered.statusCode, rendered.body);
}
