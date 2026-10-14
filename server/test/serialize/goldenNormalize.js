/**
 * A faithful COPY of the golden normalizer in `test/contract/capture.ts`
 * (`DynamicNames`, `replaceString`, `replaceInPath`, `normalizeValue`), which
 * keeps those module-private. Not a test file. Task 11 may not edit the
 * capture harness, so the copy lives here; `goldenEquivalence.test.js` checks
 * that this copy re-normalises every committed golden's LIVE replay
 * response byte-identically, so a drift between the two would fail loudly.
 *
 * Plus the inverse for requests: golden request paths and bodies carry
 * `<placeholder>`s, which are mapped back to the fixture ids/codes.
 */
const UUID_RE     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAT_CODE_RE = /^[a-z_]+\.[a-z_]+\.[a-z_]+$/i;

class DynamicNames {
    #assigned = new Map();
    #counts = {};

    for(kind, raw) {
        const existing = this.#assigned.get(raw);
        if (existing) return existing;
        this.#counts[kind] = (this.#counts[kind] || 0) + 1;
        const name = `<${kind}:${this.#counts[kind]}>`;
        this.#assigned.set(raw, name);
        return name;
    }
}

function buildStaticNames(IDS, CODES) {
    const map = new Map();
    for (const [name, value] of Object.entries(IDS))   map.set(String(value), `<${name}>`);
    for (const [name, value] of Object.entries(CODES)) map.set(String(value), `<${name}>`);
    return map;
}

function replaceString(raw, statics, dyn) {
    const known = statics.get(raw);
    if (known) return known;
    if (UUID_RE.test(raw))     return dyn.for('uuid', raw);
    if (MAT_CODE_RE.test(raw)) return dyn.for('code', raw);
    return raw;
}

function replaceInPath(raw, statics, dyn) {
    return raw
        .split('/')
        .map((segment) => {
            const [head, ...query] = segment.split('?');
            const replaced = replaceString(head, statics, dyn);
            return query.length ? [replaced, ...query].join('?') : replaced;
        })
        .join('/');
}

function normalizeValue(value, statics, dyn) {
    if (value === null || typeof value !== 'object') {
        return typeof value === 'string' ? replaceString(value, statics, dyn) : value;
    }
    if (Array.isArray(value)) return value.map((item) => normalizeValue(item, statics, dyn));
    const out = {};
    const entries = Object.keys(value)
        .sort()
        .map((key) => [replaceString(key, statics, dyn), normalizeValue(value[key], statics, dyn)])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (const [key, val] of entries) out[key] = val;
    return out;
}

/* --- the inverse, for replaying golden requests ------------------------- */

const PLACEHOLDER_RE = /^<([a-z]+:[\w-]+)>$/i;

/**
 * Maps one golden string back to a live value: a static placeholder
 * (`<match:done>`, `<code:main-admin>`) to its fixture value; a dynamic one
 * (`<uuid:N>` / `<code:N>`, only ever an unknown id or code in a request path)
 * to a fresh value of the same kind that matches nothing in the DB.
 */
function denormalizeString(raw, IDS, CODES) {
    const m = PLACEHOLDER_RE.exec(raw);
    if (!m) return raw;
    const key = m[1];
    if (key in IDS)   return IDS[key];
    if (key in CODES) return CODES[key];
    const [kind, n] = key.split(':');
    if (kind === 'uuid') return `11111111-2222-4333-8444-${String(n).padStart(12, '9')}`;
    if (kind === 'code') return 'no.such.code';
    throw new Error(`unknown placeholder ${raw}`);
}

function denormalizePath(raw, IDS, CODES) {
    return raw.split('/').map((segment) => {
        const [head, ...query] = segment.split('?');
        const replaced = denormalizeString(head, IDS, CODES);
        return query.length ? [replaced, ...query].join('?') : replaced;
    }).join('/');
}

function denormalizeValue(value, IDS, CODES) {
    if (value === null || typeof value !== 'object') {
        return typeof value === 'string' ? denormalizeString(value, IDS, CODES) : value;
    }
    if (Array.isArray(value)) return value.map((v) => denormalizeValue(v, IDS, CODES));
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [denormalizeString(k, IDS, CODES), denormalizeValue(v, IDS, CODES)]));
}

module.exports = {
    DynamicNames,
    buildStaticNames,
    replaceString,
    replaceInPath,
    normalizeValue,
    denormalizePath,
    denormalizeValue,
};
