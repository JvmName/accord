/**
 * The legacy request-parameter bag (server-ts task 12).
 *
 * Port of `ServerController#params` / `#processRequestData` /
 * `#processedRequestDataValue` (`lib/server/serverController.js:38-82`). Two
 * properties of that bag are observable over HTTP and are reproduced here
 * (FINDINGS F-73):
 *
 *   1. PRECEDENCE: `{ ...req.params, ...body, ...query }`. A body or query key
 *      OVERRIDES a path parameter of the same name. `POST
 *      /mat/<viewerCode>/matches?matCode=<adminCode>` is resolved, authorized
 *      and executed against the ADMIN code (probed: 200). Authorization is
 *      always evaluated against the resource actually resolved, so this is not
 *      an authorization bypass, but it is how legacy behaves.
 *   2. JSON DECODING: every top-level body/query value that is a string and
 *      parses as a JSON object or array is replaced by the parsed value
 *      (`{"name": "{\"a\":1}"}` reaches the action as an object; probed: the
 *      same 500 as a literal object). Strings that parse to a primitive are
 *      left as the original string.
 *
 * Unlike legacy (F-02, the memo never fires), the bag is built ONCE per request
 * by the registry and handed to every stage, which makes the memoization real
 * by construction. The legacy getter returns a `structuredClone` on every
 * access; this returns one clone, so the bag cannot alias `req.body`.
 */

/** `#processedRequestDataValue`: JSON-decode strings that hold an object/array. */
export function processedRequestDataValue(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
        return value;
    } catch {
        return value;
    }
}

/** `#processRequestData(key)`: `this._request[key] || {}`, values decoded. */
export function processRequestData(data: unknown): Record<string, unknown> {
    const processed: Record<string, unknown> = {};
    for (const [paramName, paramValue] of Object.entries((data || {}) as object)) {
        processed[paramName] = processedRequestDataValue(paramValue);
    }
    return processed;
}

/** The merged bag, exactly as `ServerController#params` builds it. */
export function buildLegacyInput(req: { params?: unknown; body?: unknown; query?: unknown }): Record<string, unknown> {
    const body  = processRequestData(req.body);
    const query = processRequestData(req.query);
    return structuredClone({ ...(req.params as object), ...body, ...query });
}
