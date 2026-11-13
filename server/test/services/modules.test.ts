import { describe, expect, it } from 'bun:test';
/**
 * Module-format and dependency hygiene for src/services.
 *
 * The services use ES `export`, like the repositories, but they must still
 * load through `require()` under bun. They must not depend on an ORM or on
 * WebSocket code, and must not use the transaction helper (the routes that
 * need one wrap the call).
 */
import fs from 'fs';
import path from 'path';

const SERVICES = {
    matchLifecycle:  ['closeMatch', 'competitorForColor', 'endMatch', 'endRound', 'startMatch', 'startRound', 'tryEndRound'],
    roundLifecycle:  ['finishRound', 'isRoundPaused', 'pauseRound', 'resumeRound', 'setRoundResult'],
    ridingTimeVotes: ['endRidingTime', 'endVote', 'startRidingTime'],
};

describe('src/services modules', () => {
    it.each(Object.entries(SERVICES))('%s loads with require() and exports exactly its async commands', (name, exported) => {
        const mod = require(`../../src/services/${name}`);
        const fns = Object.keys(mod).filter((k) => typeof mod[k] === 'function').sort();
        expect(fns).toEqual(exported);
        for (const fn of exported) expect(mod[fn].constructor.name).toBe('AsyncFunction');
    });

    it('import an ORM, the transaction helper, or WebSocket code: never', () => {
        const dir = path.join(__dirname, '../../src/services');
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
        expect(files.sort()).toEqual(['errors.ts', 'matchLifecycle.ts', 'ridingTimeVotes.ts', 'roundLifecycle.ts']);
        for (const f of files) {
            const src = fs.readFileSync(path.join(dir, f), 'utf8');
            const specifiers = [...src.matchAll(/(?:from\s+|require\()\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
            if (f !== 'errors.ts') expect(specifiers.length).toBeGreaterThan(0);
            for (const s of specifiers) {
                expect({ f, s, legacy: /(^|\/)models\/|lib\/activeRecord|sequelize|socket\.io|webSocket|db\/transaction/i.test(s) })
                    .toEqual({ f, s, legacy: false });
            }
        }
    });
});
