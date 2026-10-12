const { describe, expect, it } = require('bun:test');
/**
 * src/serialize module hygiene and the opt-in runtime contract check (task 11).
 */
const fs   = require('fs');
const path = require('path');
const S    = require('../../src/serialize');
const F    = require('./fixtures');

const SERIALIZE_DIR = path.join(__dirname, '../../src/serialize');
const DB_DIR        = path.join(__dirname, '../../src/db');

/** Every import/require specifier in a source file, with whether it is type-only. */
function specifiers(file) {
    const src = fs.readFileSync(file, 'utf8');
    const out = [];
    for (const m of src.matchAll(/^\s*(import\s+type\b[^;]*?|import\b[^;]*?|export\b[^;]*?)\s+from\s+['"]([^'"]+)['"]/gms)) {
        out.push({ spec: m[2], typeOnly: /^\s*(import|export)\s+type\b/.test(m[1]) });
    }
    for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1], typeOnly: false });
    return out;
}

function tsFiles(dir) {
    return fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.ts')).map((f) => path.join(dir, String(f)));
}

describe('src/serialize modules', () => {
    it('load with require() under bun (ES export, consumed from CJS)', () => {
        for (const name of ['user', 'matCode', 'mat', 'match', 'round', 'values', 'index']) {
            const mod = require(`../../src/serialize/${name}`);
            expect([name, Object.keys(mod).length > 0]).toEqual([name, true]);
        }
        expect(typeof S.serializeMatch).toBe('function');
        expect(typeof S.serializeMat).toBe('function');
    });

    it('import nothing from the legacy stack (models/, lib/, sequelize) and nothing from src/db at RUNTIME', () => {
        const files = tsFiles(SERIALIZE_DIR);
        expect(files.map((f) => path.basename(f)).sort()).toEqual(['index.ts', 'mat.ts', 'matCode.ts', 'match.ts', 'round.ts', 'user.ts', 'values.ts']);
        const all = files.flatMap((f) => specifiers(f).map((s) => s.spec));
        expect(all.length).toBeGreaterThanOrEqual(20); // the scan really sees the imports
        expect(all).toContain('../domain/scoring');
        expect(all).toContain('../db/repositories/matches');
        for (const file of files) {
            for (const { spec, typeOnly } of specifiers(file)) {
                const legacy = /(^|\/)models\/|(^|\/)lib\/|sequelize|socket\.io|activeRecord/i.test(spec);
                const dbAtRuntime = /(^|\/)db(\/|$)/.test(spec) && !typeOnly;
                expect({ file: path.basename(file), spec, legacy, dbAtRuntime }).toEqual({ file: path.basename(file), spec, legacy: false, dbAtRuntime: false });
            }
        }
    });

    it('src/db knows nothing about wire shapes: no import of src/serialize or src/contract', () => {
        expect(tsFiles(DB_DIR).flatMap((f) => specifiers(f)).length).toBeGreaterThanOrEqual(10);
        for (const file of tsFiles(DB_DIR)) {
            for (const { spec } of specifiers(file)) {
                expect({ file: path.relative(DB_DIR, file), spec, wire: /serialize|contract/.test(spec) })
                    .toEqual({ file: path.relative(DB_DIR, file), spec, wire: false });
            }
        }
    });
});

describe('assertWire / devAssertWire (opt-in runtime contract check)', () => {
    const goodMatch = () => S.serializeMatch(F.matchGraph(), { now: F.at(600) });

    it('returns the SAME object when it conforms (never Zod\'s copy)', () => {
        const m = goodMatch();
        expect(S.assertWire('match', m)).toBe(m);
    });

    it('throws WireContractError naming the path when a mapper output drifts', () => {
        const withScore = { ...goodMatch(), red_score: 7 };           // the regression most likely to happen
        expect(() => S.assertWire('match', withScore)).toThrow(S.WireContractError);
        const nulledMat = { ...goodMatch(), mat: null };               // absent collapsed to null
        expect(() => S.assertWire('match', nulledMat)).toThrow(/wire contract violation \(match\): mat/);
        const leaky = { ...goodMatch(), red_competitor: S.serializeLeakedUser(F.USERS.red) };
        expect(() => S.assertWire('match', leaky)).toThrow(S.WireContractError);
        expect(() => S.assertWire('leakedMatch', leaky)).toThrow(S.WireContractError); // blue/winner shapes differ
    });

    it('wireValidationEnabled: ACCORD_VALIDATE_WIRE=1 forces on, =0 forces off, else NODE_ENV=development', () => {
        expect(S.wireValidationEnabled({ ACCORD_VALIDATE_WIRE: '1', NODE_ENV: 'production' })).toBe(true);
        expect(S.wireValidationEnabled({ ACCORD_VALIDATE_WIRE: '0', NODE_ENV: 'development' })).toBe(false);
        expect(S.wireValidationEnabled({ NODE_ENV: 'development' })).toBe(true);
        expect(S.wireValidationEnabled({ NODE_ENV: 'production' })).toBe(false);
        expect(S.wireValidationEnabled({ NODE_ENV: 'test' })).toBe(false);
    });

    it('devAssertWire checks only when enabled', () => {
        const previous = process.env.ACCORD_VALIDATE_WIRE;
        const bad = { ...goodMatch(), red_score: 7 };
        try {
            process.env.ACCORD_VALIDATE_WIRE = '0';
            expect(S.devAssertWire('match', bad)).toBe(bad);
            process.env.ACCORD_VALIDATE_WIRE = '1';
            expect(() => S.devAssertWire('match', bad)).toThrow(S.WireContractError);
        } finally {
            if (previous === undefined) delete process.env.ACCORD_VALIDATE_WIRE;
            else process.env.ACCORD_VALIDATE_WIRE = previous;
        }
    });

    it('wireTime / legacyColumn helpers', () => {
        expect(S.wireTime(F.at(0))).toBe('2026-01-01T12:00:00.000Z');
        expect(S.wireTime(null)).toBeNull();
        expect(S.wireTime(undefined)).toBeNull();
        expect([0, '', null, undefined, false].map(S.legacyColumn)).toEqual([null, null, null, null, null]);
        expect([1, 'x'].map(S.legacyColumn)).toEqual([1, 'x']);
    });
});
