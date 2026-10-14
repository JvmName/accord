/**
 * THE OPENAPI GENERATION GATE.
 *
 * `generateOpenApiDocument()` (`src/contract/openapi.ts`) assembles a
 * components-only OpenAPI 3.1 document from the task-05 Zod wire schemas —
 * see that file's module doc for why it's built the way it is (in short:
 * `OpenAPIRegistry.register()` clones, which breaks the `Mat`/`Match` cycle;
 * this file tags the original schema objects in place instead).
 *
 * This test does not re-litigate the field-by-field content — that's what
 * `schemas.test.ts` already pins by parsing every golden through the same
 * schemas. It guards the two things specific to *generation*:
 *   - the process is deterministic (task 06 success criterion 1);
 *   - the committed `openapi.json` is what the generator currently produces
 *     (so `bun run generate:openapi` isn't forgotten after a schema edit);
 *   - the component names line up with the hand-written spec's five
 *     (`User`, `Mat`, `MatCode`, `Match`, `Round`), which is what makes the
 *     step-5 diff in `06-openapi-generation.md` meaningful.
 */
import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { generateOpenApiDocument } from '../../src/contract/openapi';

const OPENAPI_JSON_PATH = path.join(__dirname, '..', '..', 'openapi.json');

describe('generateOpenApiDocument', () => {
    it('is deterministic across repeated calls', () => {
        const first = generateOpenApiDocument();
        const second = generateOpenApiDocument();
        expect(second).toEqual(first);
    });

    it('matches the committed openapi.json (run `bun run generate:openapi` after a schema change)', () => {
        const committed = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, 'utf8'));
        expect(generateOpenApiDocument()).toEqual(committed);
    });

    it('registers the five hand-written component names with stable $refs', () => {
        const document = generateOpenApiDocument();
        const schemas = document.components?.schemas ?? {};
        for (const name of ['User', 'Mat', 'MatCode', 'Match', 'Round']) {
            expect(schemas).toHaveProperty(name);
        }
    });

    it('resolves the Mat <-> Match cycle as $refs, not infinite inlining', () => {
        const document = generateOpenApiDocument();
        const schemas = document.components?.schemas as Record<string, any>;
        expect(schemas.Mat.properties.current_match.oneOf[0].$ref)
            .toBe('#/components/schemas/Match');
        expect(schemas.Match.properties.mat.$ref).toBe('#/components/schemas/Mat');
    });

    it('carries the ApiToken security scheme matching the hand-written spec', () => {
        const document = generateOpenApiDocument();
        expect(document.components?.securitySchemes).toEqual({
            ApiToken: { type: 'apiKey', in: 'header', name: 'X-Api-Token' },
        });
        expect(document.security).toEqual([{ ApiToken: [] }]);
    });

    // Task 12 flipped this: it used to assert `paths: {}` ("defers paths to
    // task 12"). Paths are now generated from the route registry; the full
    // contract of that generation is pinned in test/http/openapiPaths.test.ts.
    it('generates paths from the task-12 route registry (every non-DEV route)', () => {
        const paths = generateOpenApiDocument().paths ?? {};
        const operations = Object.entries(paths)
            .flatMap(([p, item]) => Object.keys(item as object).map(method => `${method.toUpperCase()} ${p}`))
            .sort();
        expect(operations).toHaveLength(20);
        expect(operations).not.toContain('GET /docs');
    });

    // --- Step-5 diff anchors: F-20 and F-24 (see 06-openapi-generation.md's
    // "Note for step 5's diff" and FINDINGS.md). The generated spec is
    // deliberately MORE PERMISSIVE/accurate than the hand-written one here —
    // asserted directly so a future edit that silently narrows either back
    // to the hand-written (wrong) shape is caught.
    it('models Match.break_remaining as required-but-nullable (F-20; hand-written spec omitted it)', () => {
        const schemas = generateOpenApiDocument().components?.schemas as Record<string, any>;
        expect(schemas.Match.required).toContain('break_remaining');
        expect(schemas.Match.properties.break_remaining.type).toEqual(['integer', 'null']);
    });

    it('models EndRoundRequest.winner as optional, not nullable (F-24)', () => {
        const schemas = generateOpenApiDocument().components?.schemas as Record<string, any>;
        expect(schemas.EndRoundRequest.required ?? []).not.toContain('winner');
        expect(schemas.EndRoundRequest.properties.winner).toEqual({
            $ref: '#/components/schemas/CompetitorColor',
        });
    });
});
