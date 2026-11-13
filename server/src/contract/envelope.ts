/**
 * The response envelope.
 *
 * Every JSON response the server produces goes through
 * `ServerController#formatJSONBody`, which renders `{ data, status }`. The
 * Kotlin client decodes it in `ApiResultSerializer.kt`.
 *
 * There are FOUR distinct shapes on the wire, not one. They are modelled
 * separately on purpose: a single over-general schema would silently accept
 * the wrong shape for the wrong endpoint, which is exactly the class of drift
 * these schemas exist to catch.
 *
 *   1. success           `{ data: <payload | null>, status: "ok" }`
 *   2. validation error  `{ data: { errors: {field: [msg]} }, status: "bad request" | ... }`
 *   3. bare error        `{ data: null, status: "unauthorized" | "not found" }`
 *   4. server error      `{ data: { error: "<raw message>" }, status: "server error" }`
 *
 * All wire schemas here are `strictObject`: the captured goldens are the
 * complete set of keys the server emits, and an unexpected extra key is a
 * contract change we want to see, not silently strip. (Request schemas are
 * deliberately NOT strict — see `requests.ts`.)
 */
import { z } from 'zod';

/** The status text for each status code the server renders (see `statusText` in `http/envelope.ts`). */
export const statusTextSchema = z.enum([
    'ok',
    'bad request',
    'unauthorized',
    'not found',
    'unprocessable entity',
    'server error',
]);
export type StatusText = z.infer<typeof statusTextSchema>;

/**
 * Success envelope. `data` is nullable because several 200-level and all
 * bare-error responses render `data: null`.
 */
export const envelope = <T extends z.ZodType>(data: T) =>
    z.strictObject({
        data: data.nullable(),
        status: z.literal('ok'),
    });

/**
 * `ApiResult.Error(errors: Map<String, List<String>>)` in `models.kt`.
 *
 * Every value is an array, which is what the Kotlin client can decode.
 */
export const errorMapSchema = z.record(z.string(), z.array(z.string()));
export type ErrorMap = z.infer<typeof errorMapSchema>;

/** `renderErrors()` — 400 / 404 / 422. */
export const validationErrorDataSchema = z.strictObject({ errors: errorMapSchema });

/**
 * The generic 500 branch of `ApplicationServer#handleError`: `error`
 * (singular, a raw string), NOT `errors` (a map). `ApiResultSerializer.kt`
 * has a separate branch for exactly this shape. It leaks the raw driver
 * message; captured as-is in `http.users.create.objectName.500`.
 */
export const serverErrorDataSchema = z.strictObject({ error: z.string() });

export const errorDataSchema = z.union([
    validationErrorDataSchema,
    serverErrorDataSchema,
]);

/**
 * Error envelope. `status` is always present: the Kotlin client's
 * `ApiResultSerializer` throws on a response without it.
 */
export const errorEnvelopeSchema = z.strictObject({
    data: errorDataSchema.nullable(),
    status: statusTextSchema,
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
