/**
 * THE SCHEMA/GOLDEN GATE.
 *
 * Parses **every** committed golden in `goldens/` through the Zod wire
 * schemas in `src/contract/`. A golden that fails to parse means the schema
 * is wrong, not the golden — the goldens are a fidelity instrument captured
 * from the unmodified server (see `00-START-HERE.md` §5).
 *
 * Unlike `contract.test.js` this file boots nothing: it reads the goldens off
 * disk and parses them. It is therefore also the gate that keeps the Zod
 * layer honest once task 06 generates OpenAPI from it and task 12 validates
 * requests with it.
 *
 * The schemas are `strictObject`, so an unexpected EXTRA key in a payload
 * fails here too — which is the point: extra keys are how `api_token` got
 * onto the WebSocket wire (F-22).
 */
import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

import {
    errorEnvelopeSchema,
    leakedMatchSchema,
    routeResponses,
    socketEventSchema,
    socketPayloads,
    type RouteKey,
} from '../../src/contract';

const GOLDENS_DIR = path.join(__dirname, 'goldens');

/**
 * The three `/docs*` routes are Express's own HTML 404 (the OpenAPI UI is not
 * mounted), not JSON. `capture.ts` records a non-JSON body as
 * `{"<non-json-text>": <byte length>}`. They carry no wire contract, so they
 * are parsed through this sentinel rather than an envelope — stated
 * explicitly so "every golden parses" stays a real claim.
 */
const nonJsonSentinelSchema = z.strictObject({ '<non-json-text>': z.number().int() });
const NON_JSON_GOLDENS = new Set([
    'http.docs.notFound',
    'http.docs.notFound.json',
    'http.docsJson.notFound',
    'http.asyncDocsJson.notFound',
]);

interface HttpGolden {
    name: string;
    route: string | null;
    request: { method: string; path: string; as: string | null; body: unknown };
    response: { status: number; content_type: string; body: unknown };
}

interface WsGolden {
    name: string;
    event: string;
    room: string;
    payload: unknown;
}

const goldenFiles = fs
    .readdirSync(GOLDENS_DIR)
    .filter(file => file.endsWith('.json'))
    .sort();

const readGolden = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(GOLDENS_DIR, file), 'utf8'));

const httpGoldens: HttpGolden[] = goldenFiles
    .filter(file => file.startsWith('http.'))
    .map(readGolden);

const wsGoldens: WsGolden[] = goldenFiles
    .filter(file => file.startsWith('ws.'))
    .map(readGolden);

/** A one-line `field: message` summary of a parse failure. */
const describeFailure = (name: string, error: z.ZodError) =>
    `${name}: ` +
    error.issues
        .slice(0, 4)
        .map(issue => `${issue.path.join('.') || '<root>'} — ${issue.message}`)
        .join(' | ');


describe('contract schemas vs. goldens', () => {
    it('found the goldens (guards against a silently vacuous suite)', () => {
        expect(goldenFiles.length).toBe(85);
        expect(httpGoldens.length).toBe(81);
        expect(wsGoldens.length).toBe(4);
    });

    it('parses every HTTP golden through its route schema', () => {
        const failures: string[] = [];
        let parsed = 0;

        for (const golden of httpGoldens) {
            if (NON_JSON_GOLDENS.has(golden.name)) {
                const result = nonJsonSentinelSchema.safeParse(golden.response.body);
                parsed++;
                if (!result.success) failures.push(describeFailure(golden.name, result.error));
                continue;
            }

            const success = golden.response.status === 200;
            let schema: z.ZodType;

            if (success) {
                const key = golden.route as RouteKey;
                const routeSchema = routeResponses[key];
                if (!routeSchema) {
                    failures.push(`${golden.name}: no schema registered for route "${golden.route}"`);
                    continue;
                }
                schema = routeSchema;
            } else {
                // Error bodies are not route-specific. Note that the four 422
                // goldens have NO `status` key at all (F-21) and must still
                // parse — `errorEnvelopeSchema.status` is optional for
                // exactly that reason.
                schema = errorEnvelopeSchema;
            }

            const result = schema.safeParse(golden.response.body);
            parsed++;
            if (!result.success) failures.push(describeFailure(golden.name, result.error));
        }

        expect(failures).toEqual([]);
        expect(parsed).toBe(httpGoldens.length);
    });

    it('parses every WebSocket golden through its event payload schema', () => {
        const failures: string[] = [];

        for (const golden of wsGoldens) {
            const event = socketEventSchema.safeParse(golden.event);
            if (!event.success) {
                failures.push(`${golden.name}: unknown event "${golden.event}"`);
                continue;
            }

            // Bare Match, no envelope.
            const result = socketPayloads[event.data].safeParse(golden.payload);
            if (!result.success) failures.push(describeFailure(golden.name, result.error));
        }

        expect(failures).toEqual([]);
        expect(wsGoldens.length).toBe(4);
    });

    it('registers a response schema for every route the goldens exercise', () => {
        const routes = new Set(
            httpGoldens
                .filter(g => g.response.status === 200 && g.route)
                .map(g => g.route as string),
        );
        const unregistered = [...routes].filter(route => !(route in routeResponses)).sort();
        expect(unregistered).toEqual([]);
        expect(routes.size).toBeGreaterThan(15);
    });
});


/**
 * The judgment calls that a "does it parse?" sweep cannot distinguish, pinned
 * directly. Each of these would still pass the sweep above if the schema were
 * loosened the wrong way (`.optional()` where the wire always sends the key,
 * `.nullable()` where the client needs absent-vs-null preserved), so they are
 * asserted explicitly.
 */
describe('contract schemas — optionality is not accidentally loose', () => {
    const baseMatch = () => {
        const golden = readGolden('http.match.get.inBreak.json');
        return golden.response.body.data.match;
    };

    it('rejects a Match missing break_remaining (present-but-nullable, F-20)', () => {
        const { break_remaining, ...withoutBreakRemaining } = baseMatch();
        expect(break_remaining).toBe(40); // non-null over plain HTTP
        const schema = routeResponses['GET /match/{matchId}'];
        expect(schema.safeParse({ data: { match: withoutBreakRemaining }, status: 'ok' }).success)
            .toBe(false);
    });

    it('accepts a Match with mat/judges/rounds ABSENT but not with them null', () => {
        const { mat, judges, rounds, ...partial } = baseMatch();
        const schema = routeResponses['GET /match/{matchId}'];

        expect(schema.safeParse({ data: { match: partial }, status: 'ok' }).success).toBe(true);
        expect(
            schema.safeParse({
                data: { match: { ...partial, mat: null, judges: null, rounds: null } },
                status: 'ok',
            }).success,
        ).toBe(false);
    });

    it('accepts a null winner on an ended match (a valid draw)', () => {
        // No golden captures a drawn match (the seed plan has none), but
        // `models_ext.kt`'s `toMatchResult()` treats a null winner on an
        // ended match as a draw and explicitly forbids a `winner ?: return
        // null` guard — so the schema must not require a winner once
        // `ended_at` is set.
        const ended = readGolden('http.match.get.ended.json').response.body.data.match;
        expect(ended.ended_at).not.toBeNull();
        expect(ended.winner).not.toBeNull();

        const schema = routeResponses['GET /match/{matchId}'];
        expect(schema.safeParse({ data: { match: ended }, status: 'ok' }).success).toBe(true);
        expect(schema.safeParse({ data: { match: { ...ended, winner: null } }, status: 'ok' })
            .success).toBe(true);
    });

    it('rejects a competitor api_token on the HTTP Match (F-22 stays WebSocket-only)', () => {
        const match = baseMatch();
        const leaky = {
            ...match,
            red_competitor: { ...match.red_competitor, api_token: 'leaked' },
        };
        expect(routeResponses['GET /match/{matchId}']
            .safeParse({ data: { match: leaky }, status: 'ok' }).success).toBe(false);

        // …while the WebSocket schema requires it, because the server sends it.
        const wsPayload = readGolden('ws.match.update.openRound.json').payload;
        expect(leakedMatchSchema.safeParse(wsPayload).success).toBe(true);
        const { api_token, ...strippedCompetitor } = wsPayload.red_competitor;
        expect(
            leakedMatchSchema.safeParse({ ...wsPayload, red_competitor: strippedCompetitor })
                .success,
        ).toBe(false);
    });

    it('accepts a 422 error envelope with no status key (F-21)', () => {
        const golden = readGolden('http.rounds.pause.noActiveRound.422.json');
        expect('status' in golden.response.body).toBe(false);
        expect(errorEnvelopeSchema.safeParse(golden.response.body).success).toBe(true);
    });

    it('distinguishes the 500 `error` string from the `errors` map', () => {
        expect(errorEnvelopeSchema.safeParse({
            data: { error: 'boom' }, status: 'server error',
        }).success).toBe(true);
        // A bare string where the client expects List<String> (the F-14 shape)
        // is deliberately NOT accepted — see envelope.ts.
        expect(errorEnvelopeSchema.safeParse({
            data: { errors: { null: 'UNIQUE constraint failed' } }, status: 'bad request',
        }).success).toBe(false);
    });
});


describe('contract request schemas', () => {
    // Imported lazily so the response half of this file stays readable.
    const {
        competitorRequestSchema,
        createMatRequestSchema,
        endRoundRequestSchema,
        joinMatRequestSchema,
        startRidingTimeVoteRequestSchema,
    } = require('../../src/contract');

    it('replays every captured request body successfully', () => {
        const bySchema: Array<[string, z.ZodType]> = [
            ['http.mats.create.success', createMatRequestSchema],
            ['http.mat.join.viewerCode.anonymous', joinMatRequestSchema],
            ['http.mat.join.viewerCode.noName.anonymous', joinMatRequestSchema],
            ['http.rounds.result.clear', endRoundRequestSchema],
            ['http.rounds.result.stoppage', endRoundRequestSchema],
            ['http.rounds.result.submission', endRoundRequestSchema],
            ['http.ridingTime.start.success', startRidingTimeVoteRequestSchema],
        ];

        const failures: string[] = [];
        for (const [name, schema] of bySchema) {
            const body = readGolden(`${name}.json`).request.body;
            const result = schema.safeParse(body);
            if (!result.success) failures.push(describeFailure(name, result.error));
        }
        expect(failures).toEqual([]);
    });

    it('rejects an explicit winner: null on PATCH /rounds/result (F-24)', () => {
        // The server 400s on this exact body — `http.rounds.result.explicitNull.400`.
        const body = readGolden('http.rounds.result.explicitNull.400.json').request.body;
        expect(body).toEqual({ stoppage: false, winner: null });
        expect(endRoundRequestSchema.safeParse(body).success).toBe(false);

        // …while an OMITTED winner is the documented way to clear a result.
        expect(endRoundRequestSchema.safeParse({ stoppage: false }).success).toBe(true);
    });

    it('requires one of id/name on a competitor', () => {
        expect(competitorRequestSchema.safeParse({ id: 'u1' }).success).toBe(true);
        expect(competitorRequestSchema.safeParse({ name: 'Fresh Red' }).success).toBe(true);
        expect(competitorRequestSchema.safeParse({}).success).toBe(false);
    });

    it('treats judge_count as optional on mat creation', () => {
        expect(createMatRequestSchema.safeParse({ name: 'No Judge Count' }).success).toBe(true);
        expect(createMatRequestSchema.safeParse({ judge_count: 3 }).success).toBe(false);
    });

    it('ignores unknown request keys, as the server does', () => {
        // `validateParameters` only inspects declared keys, so request schemas
        // are deliberately non-strict. A strict schema here would reject
        // bodies the server accepts today.
        expect(startRidingTimeVoteRequestSchema.safeParse({ rider: 'red', extra: 1 }).success)
            .toBe(true);
    });
});
