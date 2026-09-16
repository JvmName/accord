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
 * …plus the F-21 anomaly: 422 responses omit `status` ENTIRELY (see below).
 *
 * All wire schemas here are `strictObject`: the captured goldens are the
 * complete set of keys the server emits, and an unexpected extra key is a
 * contract change we want to see, not silently strip. (Request schemas are
 * deliberately NOT strict — see `requests.ts`.)
 */
import { z } from 'zod';

/**
 * `ServerController#statusText` has cases for 200/400/401/404/500 only.
 * Anything else renders `undefined` — see `statusTextSchema`'s use in
 * `errorEnvelopeSchema` and F-21.
 */
export const statusTextSchema = z.enum([
    'ok',
    'bad request',
    'unauthorized',
    'not found',
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
 * NOTE (F-14): the Sequelize unique-constraint branch in
 * `applicationServer.js:275` writes `errors[null] = err.parent.message` — a
 * bare STRING under the literal key `"null"`, where every other key holds an
 * array. No captured golden exercises that path, and the Kotlin client cannot
 * decode it either. It is deliberately NOT modelled here: this schema
 * describes the contract the client can actually consume, and F-14 is a bug
 * scheduled for task 18. If task 12 reproduces that branch verbatim (it must,
 * under the behavior-preservation rule), it produces a body this schema
 * rejects — which is the correct signal.
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
 * Error envelope.
 *
 * `status` is `.optional()` SOLELY because of **F-21**: `statusText` has no
 * case for 422, so `renderErrors(errors, 422)` produces `status: undefined`
 * and `JSON.stringify` drops the key altogether. Four routes can return 422
 * (`rounds/pause`, `rounds/resume`, and two branches of `rounds/result`), and
 * the Kotlin client throws a `SerializationException` on every one of them.
 *
 * This is a latent bug preserved, not endorsed — it is fixed in task 18, at
 * which point `status` here becomes required and the four 422 goldens change
 * together with the client.
 */
export const errorEnvelopeSchema = z.strictObject({
    data: errorDataSchema.nullable(),
    status: statusTextSchema.optional(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
