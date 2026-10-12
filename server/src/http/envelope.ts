/**
 * The `{ data, status }` response envelope (server-ts task 12).
 *
 * A faithful port of the rendering half of `ServerController`
 * (`lib/server/serverController.js`): `render`, `renderErrors`,
 * `renderNotFoundResponse`, `renderUnauthorizedResponse`, `formatJSONBody`,
 * `_formatJSONBody` and `statusText`. The task-04 goldens pin the bytes these
 * produce; `test/http/envelope.test.ts` replays the relevant goldens through
 * this module.
 */
import type { Response } from 'express';
import type { ErrorMap } from '../contract/envelope';
import type { UniqueViolationErrors } from './errors';

/**
 * `ServerController#statusText` (`serverController.js:149-162`), verbatim.
 *
 * Only 200/400/401/404/500 have text. Every other status yields `undefined`,
 * and `JSON.stringify` then DROPS the `status` key entirely: that is the F-21
 * anomaly (422 responses have no `status`, which the Kotlin client treats as a
 * `SerializationException`). Reproduced on purpose; the fix is task 18.
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
        case 500:
            return 'server error';
    }
    return undefined;
}

/**
 * `ServerController#_formatJSONBody`, minus the `toApiResponse()` hook.
 *
 * Generic walk applied to every rendered body, reproduced exactly because it
 * changes bytes on the wire:
 *   - `undefined` -> `null`, at the top level AND as any object value or array
 *     element. NOTE for tasks 11/13: a serializer that writes `key: undefined`
 *     therefore renders `key: null`, NOT an absent key. Absent vs `null` is the
 *     distinction `Match.merge()` in `models_ext.kt` depends on, so omit a key
 *     by not setting it, never by setting it to `undefined`.
 *   - a `Date` -> `toISOString()`.
 *   - primitives (and `null`) pass through.
 *
 * Like the legacy walk it MUTATES the objects/arrays it is given in place and
 * returns the same reference (so a class instance keeps its prototype and any
 * `toJSON`). The `toApiResponse()` branch is intentionally absent: handlers on
 * the new stack return plain wire objects built by the task-11 serializers,
 * not Sequelize models.
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
 * The envelope object `ServerController#formatJSONBody` returns for a body at
 * a given status. `status` is computed from the status code exactly when the
 * body is rendered, as legacy did.
 */
export function envelopeFor(statusCode: number, body: unknown): { data: unknown; status: string | undefined } {
    return { data: formatJSONBody(body), status: statusText(statusCode) };
}

/**
 * A response a handler (or a gate) decided to send instead of the success
 * payload: the equivalent of the legacy `renderErrors` /
 * `renderNotFoundResponse` / `renderUnauthorizedResponse` calls. Returned, not
 * thrown, so a handler's early exits are visible in its return type.
 */
export class Rendered {
    constructor(
        readonly statusCode: number,
        readonly body: unknown,
    ) {}
}

/** `renderErrors(errors, statusCode = 400)` -> `{ data: { errors }, status }`. */
export function renderErrors(errors: ErrorMap | UniqueViolationErrors, statusCode: number = 400): Rendered {
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
