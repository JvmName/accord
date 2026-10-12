/**
 * OpenAPI generation from the task-05 Zod wire schemas and the task-12 route
 * definitions.
 *
 * Components come from the Zod wire schemas (task 06). PATHS come from the
 * route definitions in `src/http/routes` (task 12): every non-DEV route
 * contributes one operation, built from its literal path, its request schemas
 * (or its `openapi.body` / `openapi.query` documentation overrides), its
 * success envelope and the error statuses its authorization spec, validation
 * and `openapi.errors` imply. No path entry is written by hand. See
 * `buildPaths()` below.
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
import { OpenApiGeneratorV31, zodToOpenAPIRegistry, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { z } from 'zod';
import { noInput } from '../http/route';
import { routes } from '../http/routes';
import type { AnyRouteDefinition, AuthorizeSpec } from '../http/types';
import * as contract from './index';
import { nullableRef } from './scalars';

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

// ---------------------------------------------------------------------------
// Error envelopes (task 12). One schema component per error status the
// registry can produce, each the exact wire shape (see `src/http/envelope.ts`),
// and one `responses` component per status, named as in the hand-written
// spec (`BadRequest`, `Unauthorized`, `NotFound`, `ServerError`) plus the
// status-less 422 (F-21).
// ---------------------------------------------------------------------------

const errorEnvelopes = {
    400: {
        response: 'BadRequest',
        description: 'Bad Request',
        // NOTE (F-14): a unique-constraint 400 also carries a bare STRING under the
        // key "null", which this map type does not admit (see envelope.ts).
        schema: tagSchema('BadRequestEnvelope', z.strictObject({
            data: contract.validationErrorDataSchema,
            status: z.literal('bad request'),
        })),
    },
    401: {
        response: 'Unauthorized',
        description: 'Unauthorized',
        schema: tagSchema('UnauthorizedEnvelope', z.strictObject({
            data: z.null(),
            status: z.literal('unauthorized'),
        })),
    },
    404: {
        response: 'NotFound',
        description: 'Not Found',
        // `renderNotFoundResponse()` renders `data: null`; `POST /mat/:matCode/join`
        // renders `renderErrors({matCode: ['not found']}, 404)`.
        schema: tagSchema('NotFoundEnvelope', z.strictObject({
            data: contract.validationErrorDataSchema.nullable(),
            status: z.literal('not found'),
        })),
    },
    422: {
        response: 'UnprocessableEntity',
        description: 'Unprocessable Entity (F-21: the envelope has NO `status` key)',
        schema: tagSchema('UnprocessableEntityEnvelope', z.strictObject({
            data: contract.validationErrorDataSchema,
        })),
    },
    500: {
        response: 'ServerError',
        description: 'Server Error',
        schema: tagSchema('ServerErrorEnvelope', z.strictObject({
            data: contract.serverErrorDataSchema,
            status: z.literal('server error'),
        })),
    },
} as const;

type ErrorStatus = keyof typeof errorEnvelopes;

/** Express `:param` -> OpenAPI `{param}`. */
const toOpenApiPath = (path: string) => path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');

/** Error statuses the gates of an authorization spec can answer. */
function gateStatuses(spec: AuthorizeSpec): ErrorStatus[] {
    switch (spec.scope) {
        case 'none':    return [];
        case 'newMat':  return [401];
        case 'mat':     return [401];                 // missing mat is 401 (F-16)
        case 'matCode':
            if (spec.level === 'public') return [];
            if (spec.level === 'view')   return [401, 404];
            return [401];                             // 'create a match': missing mat is 401
        case 'match':
            return spec.level === 'judge' ? [400, 401, 404] : [401, 404];
    }
}

/**
 * Operation security. Routes with no user check override the global
 * `ApiToken` requirement; the join route accepts a token but does not need one.
 */
function securityFor(spec: AuthorizeSpec): RouteConfig['security'] | undefined {
    if (spec.scope === 'none' || spec.scope === 'mat') return [];
    if (spec.scope === 'matCode' && spec.level === 'public') return [{}, { ApiToken: [] }];
    return undefined;
}

/**
 * The documented success envelope. Rebuilt from the route's envelope schema
 * because `envelope()` (src/contract/envelope.ts) uses `.nullable()` on the
 * payload, which zod-to-openapi 9.1.0 emits as `allOf [$ref, {type: [object,
 * null]}]`, rejecting `null` (F-30); `nullableRef` emits `anyOf [$ref, null]`.
 * The wire shape is unchanged.
 */
function documentedSuccess(route: AnyRouteDefinition): z.ZodType {
    const data = (route.response as z.ZodObject).shape.data as z.ZodNullable<z.ZodType>;
    return z.strictObject({ data: nullableRef(data.unwrap()), status: z.literal('ok') });
}

function routeConfig(route: AnyRouteDefinition): RouteConfig {
    const body  = route.openapi.body  ?? (route.request.body  === noInput ? undefined : route.request.body);
    const query = route.openapi.query ?? (route.request.query === noInput ? undefined : route.request.query);
    const hasValidation = route.request.body !== noInput || route.request.query !== noInput;

    const statuses = new Set<ErrorStatus>([
        ...gateStatuses(route.authorize),
        ...(hasValidation ? [400 as const] : []),
        ...((route.openapi.errors ?? []) as ErrorStatus[]),
        500,
    ]);

    const responses: RouteConfig['responses'] = {
        200: {
            description: 'Success',
            content: { 'application/json': { schema: documentedSuccess(route) } },
        },
    };
    for (const status of [...statuses].sort((a, b) => a - b)) {
        responses[status] = { $ref: `#/components/responses/${errorEnvelopes[status].response}` };
    }

    const request: NonNullable<RouteConfig['request']> = {};
    if (route.request.params !== noInput) request.params = route.request.params as z.ZodObject;
    if (query) request.query = query as z.ZodObject;
    if (body) {
        const required = (body as z.ZodType).safeParse({}).success === false;
        request.body = { required, content: { 'application/json': { schema: body as z.ZodType } } };
    }

    const security = securityFor(route.authorize);
    return {
        method: route.method,
        path: toOpenApiPath(route.path),
        tags: [...route.tags],
        ...(route.openapi.description ? { description: route.openapi.description } : {}),
        ...(security ? { security } : {}),
        ...(Object.keys(request).length ? { request } : {}),
        responses,
    };
}

/** Every non-DEV route, in registry order. DEV-only routes (the docs pages) are not part of the API. */
function routeDefinitions() {
    return routes
        .filter(route => !route.devOnly)
        .map(route => ({ type: 'route' as const, route: routeConfig(route) }));
}

/**
 * Assemble the OpenAPI 3.1 document: components from the wire schemas, paths
 * from the route registry.
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
        ...Object.values(errorEnvelopes).map(envelope => ({ type: 'schema' as const, schema: envelope.schema })),
        ...Object.values(errorEnvelopes).map(envelope => ({
            type: 'component' as const,
            componentType: 'responses' as const,
            name: envelope.response,
            component: {
                description: envelope.description,
                content: { 'application/json': { schema: { $ref: `#/components/schemas/${refIdOf(envelope.schema)}` } } },
            },
        })),
        ...routeDefinitions(),
    ]);
    const { paths, components } = generator.generateDocument({
        openapi: '3.1.0',
        info: { title: 'Accord API', version: '1.0.0' },
    });

    return {
        openapi: '3.1.0',
        info: {
            title: 'Accord API',
            version: '1.0.0',
        },
        servers: [{ url: '/api', description: 'API server' }],
        security: [{ ApiToken: [] }],
        paths,
        components,
    };
}

function refIdOf(schema: z.ZodType): string {
    return (zodToOpenAPIRegistry.get(schema) as { _internal: { refId: string } })._internal.refId;
}
