/**
 * THE GENERATED-SPEC/GOLDEN GATE.
 *
 * `schemas.test.ts` proves the Zod schemas accept every golden; this proves
 * the *generated* `openapi.json` components do too, by validating each golden
 * payload with ajv (JSON Schema 2020-12, which is what OpenAPI 3.1 uses).
 * It exists because the generator can emit something the Zod side doesn't
 * mean — F-30: zod-to-openapi emitted `registered.nullable()` as an `allOf`
 * that rejected `null`, while every Zod-side test stayed green.
 *
 * Strict mode stays on; the one non-JSON-Schema key (`components`, the
 * container the spec's `$ref`s point into) is declared as a keyword instead.
 */
import { describe, expect, it } from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import fs from 'fs';
import path from 'path';

const GOLDENS_DIR = path.join(__dirname, 'goldens');
const OPENAPI_JSON_PATH = path.join(__dirname, '..', '..', 'openapi.json');

/**
 * Success-route -> the component describing the envelope's `data`. `GET /`
 * (a bare string) and the healthCheck (`{}`) have no component. Mirrors
 * `routeResponses` in `src/contract/responses.ts`.
 */
const ROUTE_COMPONENT: Record<string, string> = {
    'POST /users': 'CreateUserResponse',
    'POST /mats': 'MatResponse',
    'GET /mat/{matId}': 'MatResponse',
    'POST /mat/{matCode}/join': 'JoinMatResponse',
    'DELETE /mat/{matCode}/join': 'MatResponse',
    'GET /mat/{matCode}/judges': 'JudgesResponse',
    'GET /mat/{matCode}/viewers': 'ViewersResponse',
};
const MATCH_ROUTE = /^(POST \/mat\/\{matCode\}\/matches|(GET|POST|PATCH|DELETE) \/match\/\{matchId\}.*)$/;

const readGolden = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(GOLDENS_DIR, file), 'utf8'));

const goldens = fs
    .readdirSync(GOLDENS_DIR)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => ({ file, golden: readGolden(file) }));

const spec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, 'utf8'));

const ajv = new Ajv2020();
// The components live under a root-level `components` key (so the spec's own
// `#/components/schemas/X` refs resolve); declare it rather than disable strict mode.
ajv.addKeyword('components');
// `date-time` is the only format the components use; ajv-formats is not worth a
// dependency for it (the exact ISO shape is already pinned by schemas.test.ts).
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
ajv.addSchema({ $id: 'spec', components: spec.components });
const validator = (component: string) => {
    const validate = ajv.getSchema(`spec#/components/schemas/${component}`);
    if (!validate) throw new Error(`no component ${component} in openapi.json`);
    return validate;
};

describe('generated openapi.json components vs. goldens', () => {
    it('accepts every golden payload that has a component', () => {
        const failures: string[] = [];
        let checked = 0;

        for (const { file, golden } of goldens) {
            let component: string | undefined;
            let payload: unknown;

            if (file.startsWith('ws.')) {
                component = 'LeakedMatch';
                payload = golden.payload;
            } else if (golden.response.status === 200 && golden.route) {
                component =
                    ROUTE_COMPONENT[golden.route] ??
                    (MATCH_ROUTE.test(golden.route) ? 'MatchResponse' : undefined);
                payload = golden.response.body?.data;
            }
            if (!component) continue;

            const validate = validator(component);
            checked++;
            if (!validate(payload)) {
                failures.push(
                    `${file} (${component}): ` +
                        (validate.errors ?? [])
                            .slice(0, 3)
                            .map(e => `${e.instancePath || '<root>'} ${e.message}`)
                            .join(' | '),
                );
            }
        }

        expect(failures).toEqual([]);
        // Guards against a silently vacuous sweep (route table drift).
        expect(checked).toBe(41); // 37 HTTP 200s with a component + 4 WebSocket
    });

    it('accepts a null winner and rejects a non-user winner (F-30 regression)', () => {
        const match = goldens.find(g => g.file === 'http.match.get.inBreak.json')!.golden
            .response.body.data.match;
        const validate = validator('Match');

        expect(validate({ ...match, winner: null })).toBe(true);
        expect(validate({ ...match, winner: 'nobody' })).toBe(false);
    });
});
