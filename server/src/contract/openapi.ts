/**
 * OpenAPI generation from the task-05 Zod wire schemas.
 *
 * This is a **components-only** assembly. Path definitions are deliberately
 * deferred to task 12, where routes are declared with their schemas attached
 * — that is what makes the spec fall out for free rather than being
 * maintained by hand. Until then this produces `paths: {}`.
 *
 * Component names are chosen to match `lib/openapi/schemas/index.js`
 * (`User`, `Mat`, `MatCode`, `Match`, `Round`) so `$ref`s stay stable across
 * the hand-written → generated cutover and the step-5 diff in
 * `06-openapi-generation.md` is meaningful. The WebSocket-only "leaked"
 * variants (F-22) and the request/response payload shapes have no
 * hand-written counterpart — they're new components, not renames.
 *
 * ## Why this doesn't use `OpenAPIRegistry.register()`
 *
 * `registry.register(name, schema)` calls `schema.openapi(name)` under the
 * hood, and zod-to-openapi's `.openapi()` is **not** in-place: it clones the
 * schema (`new this.constructor(this._def)`) and attaches the name to the
 * *clone*, in its own internal registry, keyed by object identity.
 *
 * `Mat` and `Match` are mutually recursive (`Mat.current_match`/
 * `.upcoming_matches` embed `z.lazy(() => matchSchema)`; `Match.mat` embeds
 * `z.lazy(() => matSchema)`). Those closures close over the *original*
 * `matSchema`/`matchSchema` bindings from `./mat` and `./match` — never the
 * clone `register()` hands back — so the clone's name is invisible from
 * inside the cycle. The generator then has no registered ref to stop on and
 * re-expands the pair forever: confirmed empirically as a `RangeError:
 * Maximum call stack size exceeded` in `ObjectTransformer`/`LazyTransformer`
 * ping-pong.
 *
 * The fix is to name the schemas *in place* instead of through a clone, via
 * the library's own internal metadata store (`zodToOpenAPIRegistry`, a
 * `Map`-backed registry keyed by object identity — exported by the package
 * for exactly this kind of direct use). `tagSchema()` below writes into it
 * with the same `{ _internal: { refId } }` shape `.openapi()` would have
 * produced, but against the *original* schema reference the lazy closures
 * actually resolve to. Definitions are then passed to the generator as
 * `{ type: 'schema', schema }` directly — NOT as bare `ZodType`s, which is
 * what the registry's own `.register()` produces internally. A bare
 * `ZodType` silently produces nothing: zod v4 schemas have their own runtime
 * `.type` property (`'object'`, `'string'`, …), so the generator's internal
 * `'type' in definition` duck-typing check misidentifies a raw schema as an
 * (unhandled) definition variant and drops it — confirmed empirically the
 * same way.
 */
import { OpenApiGeneratorV31, zodToOpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas31';
import type { z } from 'zod';
import * as contract from './index';

/** Names a schema in place, by object identity — see the module doc above. */
function tagSchema(refId: string, schema: z.ZodType): z.ZodType {
    zodToOpenAPIRegistry.add(schema, { _internal: { refId } });
    return schema;
}

const taggedSchemas: z.ZodType[] = [
    // --- Entities, matching the hand-written spec's component names. ---
    tagSchema('User', contract.userSchema),
    tagSchema('MatCode', contract.matCodeSchema),
    tagSchema('Mat', contract.matSchema),
    tagSchema('Match', contract.matchSchema),
    tagSchema('Round', contract.roundSchema),

    // --- Entity sub-shapes and enums the hand-written spec inlined rather than named. ---
    tagSchema('Role', contract.roleSchema),
    tagSchema('CompetitorColor', contract.competitorColorSchema),
    tagSchema('RoundResultType', contract.roundResultTypeSchema),
    tagSchema('RoundResultMethod', contract.roundResultMethodSchema),
    tagSchema('RoundResult', contract.roundResultSchema),

    // --- WebSocket-only leaked variants (F-22) — no hand-written counterpart. ---
    tagSchema('LeakedUser', contract.leakedUserSchema),
    tagSchema('LeakedMatch', contract.leakedMatchSchema),
    tagSchema('LeakedRound', contract.leakedRoundSchema),

    // --- Request bodies — the hand-written spec had none of these as named components. ---
    tagSchema('CreateUserRequest', contract.createUserRequestSchema),
    tagSchema('CreateMatRequest', contract.createMatRequestSchema),
    tagSchema('JoinMatRequest', contract.joinMatRequestSchema),
    tagSchema('CompetitorRequest', contract.competitorRequestSchema),
    tagSchema('CreateMatchRequest', contract.createMatchRequestSchema),
    tagSchema('EndRoundRequest', contract.endRoundRequestSchema),
    tagSchema('StartRidingTimeVoteRequest', contract.startRidingTimeVoteRequestSchema),

    // --- Response payloads (the `data` shape, unwrapped — the envelope and the
    // route -> schema mapping belong to task 12, which owns paths). ---
    tagSchema('CreateUserResponse', contract.createUserResponseSchema),
    tagSchema('MatResponse', contract.matResponseSchema),
    tagSchema('MatchResponse', contract.matchResponseSchema),
    tagSchema('JoinMatResponse', contract.joinMatResponseSchema),
    tagSchema('JudgesResponse', contract.judgesResponseSchema),
    tagSchema('ViewersResponse', contract.viewersResponseSchema),
];

/**
 * Assemble the OpenAPI 3.1 document. `paths` is empty until task 12.
 */
export function generateOpenApiDocument(): OpenAPIObject {
    const generator = new OpenApiGeneratorV31([
        ...taggedSchemas.map(schema => ({ type: 'schema' as const, schema })),
        {
            type: 'component' as const,
            componentType: 'securitySchemes' as const,
            // `X-Api-Token` header, matching `lib/openapi/specGenerator.js`'s
            // `ApiToken` security scheme exactly (name casing included) so
            // step 5's diff isn't polluted by an incidental rename.
            name: 'ApiToken',
            component: {
                type: 'apiKey',
                in: 'header',
                name: 'X-Api-Token',
            },
        },
    ]);
    const { components } = generator.generateComponents();

    return {
        openapi: '3.1.0',
        info: {
            title: 'Accord API',
            version: '1.0.0',
        },
        servers: [{ url: '/api', description: 'API server' }],
        security: [{ ApiToken: [] }],
        paths: {},
        components,
    };
}
