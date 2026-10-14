/**
 * Task 12 — the generated OpenAPI PATHS against the wire.
 *
 * `openapi.json` paths are generated from the route registry
 * (`src/contract/openapi.ts#buildPaths`). This validates every HTTP golden
 * (task 04) against the response its operation DOCUMENTS for that status
 * (ajv, JSON Schema 2020-12, strict), so the documented statuses are complete
 * with respect to every captured response and each documented envelope
 * accepts the bytes the server actually sends. The DEV-only docs routes are
 * not part of the documented API (their goldens pin the production 404).
 */
import { describe, expect, it } from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import fs from 'fs';
import path from 'path';
import { routes } from '../../src/http/routes';

const GOLDENS_DIR = path.join(__dirname, '..', 'contract', 'goldens');
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'openapi.json'), 'utf8'));

const ajv = new Ajv2020();
ajv.addKeyword('components');
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
ajv.addSchema({ $id: 'spec', components: spec.components });

/** The JSON Schema an operation documents for `status`, with component $refs made absolute. */
function documentedSchema(route: string, status: number): object | null {
    const [method, routePath] = route.split(' ');
    const op = spec.paths[routePath]?.[method.toLowerCase()];
    if (!op) return null;
    let response = op.responses[String(status)];
    if (!response) return null;
    if (response.$ref) response = spec.components.responses[response.$ref.split('/').pop()];
    const schema = response.content['application/json'].schema;
    return JSON.parse(JSON.stringify(schema).replace(/"#\/components\//g, '"spec#/components/'));
}

const httpGoldens = fs.readdirSync(GOLDENS_DIR)
    .filter(f => f.startsWith('http.') && f.endsWith('.json'))
    .sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(GOLDENS_DIR, f), 'utf8')));

describe('generated OpenAPI paths', () => {
    it('documents exactly the non-DEV routes of the registry', () => {
        const documented = Object.entries(spec.paths)
            .flatMap(([p, item]) => Object.keys(item as object).map(m => `${m.toUpperCase()} ${p}`))
            .sort();
        const expected = routes.filter(r => !r.devOnly)
            .map(r => `${r.method.toUpperCase()} ${r.path.replace(/:(\w+)/g, '{$1}')}`)
            .sort();
        expect(documented).toEqual(expected);
    });

    it('validates every HTTP golden against the response its operation documents for that status', () => {
        const failures: string[] = [];
        let checked = 0;
        for (const g of httpGoldens) {
            const route = routes.find(r => `${r.method.toUpperCase()} ${r.path.replace(/:(\w+)/g, '{$1}')}` === g.route);
            if (!route) { failures.push(`${g.name}: route ${g.route} not in the registry`); continue; }
            if (route.devOnly) continue; // DEV-only docs routes: goldens pin the production 404
            const schema = documentedSchema(g.route, g.response.status);
            if (!schema) { failures.push(`${g.name}: status ${g.response.status} not documented for ${g.route}`); continue; }
            const validate = ajv.compile(schema);
            if (!validate(g.response.body)) failures.push(`${g.name}: ${ajv.errorsText(validate.errors)}`);
            checked++;
        }
        expect(failures).toEqual([]);
        expect(checked).toBe(78);
    });

    it('overrides the global ApiToken requirement only on the legacy-public routes', () => {
        const security = Object.fromEntries(Object.entries(spec.paths).flatMap(([p, item]) =>
            Object.entries(item as Record<string, { security?: unknown }>).map(([m, op]) => [`${m.toUpperCase()} ${p}`, op.security]),
        ));
        expect(Object.entries(security).filter(([, s]) => s !== undefined).sort()).toEqual([
            ['GET /', []],
            ['GET /mat/{matId}', []],
            ['GET /system/healthCheck', []],
            ['POST /mat/{matCode}/join', [{}, { ApiToken: [] }]],
            ['POST /users', []],
        ]);
    });

    it('documents the status-less 422 (F-21) on exactly the rounds routes that return it', () => {
        const with422 = Object.entries(spec.paths).flatMap(([p, item]) =>
            Object.entries(item as Record<string, { responses: object }>)
                .filter(([, op]) => '422' in op.responses)
                .map(([m]) => `${m.toUpperCase()} ${p}`)).sort();
        expect(with422).toEqual([
            'PATCH /match/{matchId}/rounds/result',
            'POST /match/{matchId}/rounds/pause',
            'POST /match/{matchId}/rounds/resume',
        ]);
        expect(spec.components.schemas.UnprocessableEntityEnvelope.required).toEqual(['data']);
    });

    it('contains no allOf (the zod-to-openapi nullable-$ref bug, F-30)', () => {
        expect(JSON.stringify(spec)).not.toContain('"allOf"');
    });
});
