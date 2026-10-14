/**
 * THE CONTRACT GATE.
 *
 * Replays the whole capture plan against a freshly-seeded server and asserts
 * byte-equality with the committed goldens in `goldens/`. From task 04 onward
 * this is the acceptance gate for every phase that touches the wire: the ORM
 * swap (11), the routing rewrite (13a/13b/13c), the worker/WebSocket tier (14)
 * and the legacy deletion (15).
 *
 * A red run here means the wire contract changed. The fix is the server, not
 * the golden. Regenerating goldens to turn this green is exactly the failure
 * this file exists to prevent — see `README.md` in this directory.
 *
 * It also carries two cross-checks against the Kotlin client, both of which
 * read `models.kt` rather than restating it, so the client stays the authority:
 *
 *   - **Population check (plan 7c).** Every `@SerialName` the client declares
 *     must appear POPULATED in at least one golden. A key that is only ever
 *     null or absent is a key the goldens do not actually protect.
 *   - **Conformance check (plan step 8).** Walking the captured payloads
 *     against the client's declared nullability: a non-nullable Kotlin property
 *     that arrives null, or a no-default property that arrives absent, is a
 *     pre-existing client/server bug. Reported, not fixed.
 */
const { beforeAll, afterAll, describe, expect, it, jest } = require('bun:test');
const fs   = require('fs');
const path = require('path');
const Http = require('../helpers/httpServer');

// Must happen before any model module opens a connection.
Http.useTemporaryDatabase('accord-contract-replay');

const { buildCoverageReport, readGolden, runAll, serializeGolden } = require('./capture.ts');

const MODELS_KT = path.join(
    __dirname, '..', '..', '..',
    'app/shared/src/commonMain/kotlin/dev/jvmname/accord/network/models.kt',
);

const clock = { set: ms => jest.setSystemTime(new Date(ms)) };

let result;

beforeAll(async () => { result = await runAll(clock); }, 120000);
afterAll(() => { jest.useRealTimers(); });


// ---------------------------------------------------------------------------
// 1. Byte-equality replay
// ---------------------------------------------------------------------------

describe('contract goldens', () => {
    it('replays every committed golden byte-for-byte', () => {
        const mismatched = [];
        const missing    = [];

        for (const record of result.records) {
            const expected = readGolden(record.name);
            if (expected === null) { missing.push(record.name); continue; }
            if (serializeGolden(record) !== expected) mismatched.push(record.name);
        }

        expect({ missing, mismatched }).toEqual({ missing: [], mismatched: [] });
    });

    it('has no orphaned goldens on disk', () => {
        const captured = new Set(result.records.map(r => `${r.name}.json`));
        const onDisk   = fs.readdirSync(path.join(__dirname, 'goldens'))
                           .filter(f => f.endsWith('.json'));
        expect(onDisk.filter(f => !captured.has(f))).toEqual([]);
    });

    it('leaves no route from artifacts/route-table.txt uncovered', () => {
        expect(buildCoverageReport(result).uncovered).toEqual([]);
    });
});


// ---------------------------------------------------------------------------
// models.kt parsing
// ---------------------------------------------------------------------------

/**
 * Extracts the serializable constructor properties of every class in
 * `models.kt`, plus every enum's `@SerialName` values.
 *
 * `@JvmInline value class`es are skipped: their single property is erased by
 * inline serialization and never appears as a wire key.
 */
function parseModelsKt(source) {
    const classes = {};
    const enums   = {};

    // --- enums ---------------------------------------------------------------
    const enumRe = /enum class (\w+) \{([\s\S]*?)\n\}/g;
    for (let m; (m = enumRe.exec(source)); ) {
        const values = [...m[2].matchAll(/@SerialName\("([^"]+)"\)/g)].map(x => x[1]);
        enums[m[1]] = values;
    }

    // --- classes -------------------------------------------------------------
    // A regex cannot do this: a lazy `[\s\S]*?\)` silently runs past a
    // single-line class and swallows the NEXT class's parameters, which parses
    // without error and produces a quietly wrong model. Scan for the class
    // keyword, then brace-match the parameter list.
    const declRe = /(?:^|\n)([^\n]*?)\bclass\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g;
    for (let m; (m = declRe.exec(source)); ) {
        const [, prefix, name] = m;
        if (/\benum\b/.test(prefix)) continue;

        // Annotations sit either on this line before `class`, or on the lines
        // immediately above it.
        const lineStart   = source.lastIndexOf('\n', m.index + 1) + 1;
        const annotations = prefix + source.slice(
            Math.max(0, source.lastIndexOf('\n\n', lineStart)), lineStart,
        );
        if (/\bJvmInline\b/.test(prefix) || /\bJvmInline\b/.test(annotations)) continue;
        if (!/\bSerializable\b/.test(annotations)) continue;

        // Brace-match from the opening paren the regex consumed.
        const open = m.index + m[0].length - 1;
        let depth = 0, close = -1;
        for (let i = open; i < source.length; i++) {
            if (source[i] === '(') depth++;
            else if (source[i] === ')') { depth--; if (depth === 0) { close = i; break; } }
        }
        if (close === -1) continue;
        const params = source.slice(open + 1, close);

        const properties = [];
        // Split the parameter list on top-level commas.
        let chunkDepth = 0, current = '';
        const chunks = [];
        for (const char of params) {
            if ('<(['.includes(char)) chunkDepth++;
            if ('>)]'.includes(char)) chunkDepth--;
            if (char === ',' && chunkDepth === 0) { chunks.push(current); current = ''; }
            else current += char;
        }
        chunks.push(current);

        for (const rawChunk of chunks) {
            const chunk = rawChunk.replace(/\/\/.*$/gm, '').trim();
            if (!chunk) continue;

            const serialName = chunk.match(/@SerialName\("([^"]+)"\)/);
            const decl = chunk.match(/val (\w+)\s*:\s*([^=]+?)(\s*=\s*(.+))?$/s);
            if (!decl) continue;

            const [, property, rawType, , defaultValue] = decl;
            const type = rawType.trim();
            properties.push({
                property,
                serialName: serialName ? serialName[1] : property,
                type,
                nullable:   type.endsWith('?'),
                hasDefault: defaultValue !== undefined,
                isList:     /^List</.test(type),
                elementType: /^List<(.+)>$/.test(type)
                    ? type.replace(/^List<(.+)>$/, '$1')
                    : type.replace(/\?$/, ''),
            });
        }
        classes[name] = properties;
    }

    return { classes, enums };
}


/** Every wire key, and every string value, that appears POPULATED in a golden. */
function collectPopulated(records) {
    const keys   = new Set();
    const values = new Set();

    const isPopulated = value => {
        if (value === null || value === undefined) return false;
        if (Array.isArray(value))       return value.length > 0;
        if (typeof value === 'object')  return Object.keys(value).length > 0;
        if (typeof value === 'string')  return value.length > 0;
        if (typeof value === 'boolean') return value === true;
        return true; // numbers, including 0 — a real riding-time score of 0 counts
    };

    const walk = node => {
        if (node === null || typeof node !== 'object') {
            if (typeof node === 'string') values.add(node);
            return;
        }
        if (Array.isArray(node)) { node.forEach(walk); return; }
        for (const [key, value] of Object.entries(node)) {
            if (isPopulated(value)) keys.add(key);
            walk(value);
        }
    };

    records.forEach(record => walk(record.body));
    return { keys, values };
}


describe('models.kt cross-check', () => {
    let model;
    let populated;

    beforeAll(() => {
        model = parseModelsKt(fs.readFileSync(MODELS_KT, 'utf8'));
        populated = collectPopulated(result.records);
    });

    it('parsed the client model file (guards against a silently vacuous check)', () => {
        // If the regexes ever stop matching, every assertion below would pass
        // trivially. Anchor on the types that must exist.
        expect(Object.keys(model.classes)).toContain('Match');
        expect(Object.keys(model.classes)).toContain('Round');
        expect(Object.keys(model.classes)).toContain('Mat');
        expect(model.classes.Match.length).toBeGreaterThan(10);
        expect(Object.keys(model.enums).sort())
            .toEqual(['CompetitorColor', 'Role', 'RoundResultType']);
    });

    // --- 7c: every client property populated somewhere -----------------------
    it('has every @SerialName in models.kt POPULATED in at least one golden', () => {
        const gaps = [];
        let checked = 0;
        for (const [className, properties] of Object.entries(model.classes)) {
            for (const property of properties) {
                checked++;
                if (!populated.keys.has(property.serialName)) {
                    gaps.push(`${className}.${property.property} (wire key "${property.serialName}")`);
                }
            }
        }
        // Anti-vacuity: a parse that found no properties would also find no gaps.
        expect(checked).toBeGreaterThan(40);
        expect(gaps).toEqual([]);
    });

    it('has every enum value in models.kt represented in a golden', () => {
        const gaps = [];
        for (const [enumName, values] of Object.entries(model.enums)) {
            for (const value of values) {
                if (!populated.values.has(value)) gaps.push(`${enumName}.${value}`);
            }
        }
        expect(gaps).toEqual([]);
    });

    // --- step 8: nullability conformance -------------------------------------
    it('never sends null for a non-nullable Kotlin property, nor omits one without a default', () => {
        const LEAF = new Set([
            'String', 'Int', 'Boolean', 'Long', 'Double', 'Instant', 'Duration',
            'AuthToken', 'UserId', 'MatId', 'MatchId', 'RoundId',
            'Role', 'CompetitorColor', 'RoundResultType',
        ]);

        const violations = [];
        let checks = 0;

        function check(className, value, where) {
            const properties = model.classes[className];
            if (!properties || value === null || typeof value !== 'object') return;

            for (const property of properties) {
                checks++;
                const present = Object.prototype.hasOwnProperty.call(value, property.serialName);
                const at = `${where}.${property.serialName}`;

                if (!present) {
                    if (!property.hasDefault) {
                        violations.push(`${at}: ABSENT but ${className}.${property.property} has no default`);
                    }
                    continue;
                }

                const actual = value[property.serialName];
                if (actual === null) {
                    if (!property.nullable) {
                        violations.push(`${at}: null but ${className}.${property.property}: ${property.type} is not nullable`);
                    }
                    continue;
                }

                const element = property.elementType.replace(/\?$/, '');
                if (LEAF.has(element)) continue;

                if (property.isList && Array.isArray(actual)) {
                    actual.forEach((item, i) => check(element, item, `${at}[${i}]`));
                } else if (model.classes[element]) {
                    check(element, actual, at);
                }
            }
        }

        for (const record of result.records) {
            // WebSocket payloads are bare Match objects, no envelope.
            if (record.name.startsWith('ws.')) {
                check('Match', record.body.payload, `${record.name}.payload`);
                continue;
            }

            const data = record.body.response?.body?.data;
            if (!data || typeof data !== 'object') continue;

            const where = `${record.name}.data`;
            if (data.match)    check('Match', data.match, `${where}.match`);
            if (data.mat)      check('Mat',   data.mat,   `${where}.mat`);
            if (data.user)     check('User',  data.user,  `${where}.user`);
            if (Array.isArray(data.judges))  data.judges.forEach((u, i) => check('User', u, `${where}.judges[${i}]`));
            if (Array.isArray(data.viewers)) data.viewers.forEach((u, i) => check('User', u, `${where}.viewers[${i}]`));
        }

        // Anti-vacuity: a walker that never descends would also report zero
        // violations. Assert it actually visited the payload graph.
        expect(checks).toBeGreaterThan(500);
        expect(violations).toEqual([]);
    });
});
