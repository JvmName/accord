/**
 * Route definition and handler-context types for the typed route registry
 *.
 *
 * The payoff of the registry is here: a handler's `ctx` is computed from its
 * route definition, so `ctx.params`, `ctx.query` and `ctx.body` are the parsed
 * Zod outputs and `ctx.currentUser` / `ctx.currentMat` / `ctx.currentMatch` /
 * `ctx.currentRound` exist (non-null) exactly on the routes whose authorization
 * spec guarantees them. Nothing in a handler needs an annotation.
 *
 */
import type { z } from 'zod';
import type { DbOrTx } from '../db/repositories/internal';
import type { Mat, MatCode, Match, Round, User } from '../db/types';
import type { ErrorMap } from '../contract/envelope';
import type { Rendered } from './envelope';
import type { ActionFor, Scope, Subject } from './permissions';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * A route's authorization, declared per route. Each variant names the
 * RESOURCE the route resolves (`scope`) and the permission LEVEL it requires
 * (`level`). `middleware/authorize.ts` turns each variant into a fixed
 * sequence of checks, in a fixed order, because the order is observable (401
 * vs 404 vs 400).
 *
 * | variant                                   | checks, in order                                                 |
 * |-------------------------------------------|------------------------------------------------------------------|
 * | `none` / `public`                         | none (system and docs routes, `POST /users`)                      |
 * | `newMat` / `create`                       | an authenticated user                                             |
 * | `mat` / `view`                            | no authentication; a missing mat is 404                           |
 * | `matCode` / `public`                      | nothing (`POST /mat/:matCode/join`)                               |
 * | `matCode` / `view`                        | 401 without a user, then 404 for a missing mat                    |
 * | `matCode` / `create a match`              | 401, 404, then the request's code must be this mat's ADMIN code   |
 * | `match` / `view`                          | 401, then 404 for a missing match                                 |
 * | `match` / `manage`                        | 401, 404, then the match creator                                  |
 * | `match` / `pause`                         | 401, 404, `manage`, then `pause`                                  |
 * | `match` / `judge`, `round: 'open'`        | 401, 404, 400 without an open round, then a judge of the match    |
 */
export type AuthorizeSpec =
    | { readonly scope: 'none'; readonly level: 'public' }
    | { readonly scope: 'newMat'; readonly level: 'create' }
    | { readonly scope: 'mat'; readonly level: 'view' }
    | { readonly scope: 'matCode'; readonly level: 'public' | 'view' | 'create a match' }
    | { readonly scope: 'match'; readonly level: 'view' | 'manage' | 'pause' }
    | { readonly scope: 'match'; readonly level: 'judge'; readonly round: 'open' };

/** The request state a route's authorization spec guarantees to its handler. */
export type StateFor<A extends AuthorizeSpec> =
    A extends { scope: 'none' }    ? { currentUser: User | null } :
    A extends { scope: 'newMat' }  ? { currentUser: User } :
    A extends { scope: 'mat' }     ? { currentUser: User | null; currentMat: Mat; currentMatCode: MatCode | null } :
    A extends { scope: 'matCode'; level: 'public' }
        ? { currentUser: User | null; currentMat: Mat | null; currentMatCode: MatCode | null } :
    A extends { scope: 'matCode'; level: 'view' }
        // `currentMatCode` is null when the path carries a mat id, not a code.
        ? { currentUser: User; currentMat: Mat; currentMatCode: MatCode | null } :
    A extends { scope: 'matCode'; level: 'create a match' }
        ? { currentUser: User; currentMat: Mat; currentMatCode: MatCode } :
    A extends { scope: 'match'; level: 'judge' }
        ? { currentUser: User; currentMatch: Match; currentRound: Round } :
    A extends { scope: 'match' }   ? { currentUser: User; currentMatch: Match } :
    never;

/**
 * Path parameter names of an Express path literal:
 * `'/match/:matchId/rounds'` -> `'matchId'`.
 */
export type PathParams<Path extends string> =
    Path extends `${string}:${infer Param}/${infer Rest}` ? Param | PathParams<`/${Rest}`> :
    Path extends `${string}:${infer Param}` ? Param :
    never;

/** Rendering modes. Every API route uses `envelope`; the DEV-only docs routes use `json`/`html`. */
export type RenderMode = 'envelope' | 'json' | 'html';

/**
 * The `data` member of a success envelope schema (`envelope(payload)` in
 * `src/contract/envelope.ts`), read from the object SHAPE: the envelope is a
 * `strictObject`, whose inferred input type carries a `never` index signature
 * that would swallow a property lookup on `z.input<R>`.
 */
export type EnvelopeData<R extends z.ZodType> =
    R extends z.ZodObject<infer Shape>
        ? Shape extends { data: infer DataSchema extends z.ZodType } ? z.input<DataSchema> : never
        : never;

/** What a handler returns on success, per render mode. */
export type ResponseData<R extends z.ZodType, M extends RenderMode> =
    M extends 'envelope' ? EnvelopeData<R> : z.input<R>;

/** Helpers every handler gets: rendering and the permission check. */
export interface ContextHelpers {
    /** The Drizzle database (or transaction handle) the registry was built with. */
    readonly db: DbOrTx;
    /** `renderErrors(errors, statusCode = 400)`: return it to send `{ data: { errors }, status }`. */
    renderErrors(errors: ErrorMap, statusCode?: number): Rendered;
    /** `renderNotFoundResponse()`: 404 `{ data: null, status: 'not found' }`. */
    renderNotFound(): Rendered;
    /** `renderUnauthorizedResponse()`: 401 `{ data: null, status: 'unauthorized' }`. */
    renderUnauthorized(): Rendered;
    /**
     * In-handler permission check.
     * Throws `AuthorizationError` (-> 401) when denied. The subject defaults to
     * the request's current user and mat code; pass one explicitly when the
     * handler has changed who is acting (`postJoin` creates the user first).
     */
    authorize<S extends Scope>(action: ActionFor<S>, scope: S, subject?: Subject): Promise<void>;
}

/** The full handler context of a route. */
export type RouteContext<
    A extends AuthorizeSpec,
    P extends z.ZodType,
    Q extends z.ZodType,
    B extends z.ZodType,
> = StateFor<A> & ContextHelpers & {
    /** Path parameters, from the PATH only (Express always yields strings). */
    readonly params: z.output<P>;
    /** Query parameters. */
    readonly query: z.output<Q>;
    /** Request body. */
    readonly body: z.output<B>;
};

export type Handler<
    A extends AuthorizeSpec,
    P extends z.ZodType,
    Q extends z.ZodType,
    B extends z.ZodType,
    R extends z.ZodType,
    M extends RenderMode,
> = (ctx: RouteContext<A, P, Q, B>) => Promise<ResponseData<R, M> | Rendered>;

/** Documentation-only overrides; see `RouteDefinition.openapi`. */
export interface RouteDocs {
    /** OpenAPI `description` of the operation. */
    readonly description?: string;
    /** Schema DOCUMENTED as the request body, when it differs from the runtime one. */
    readonly body?: z.ZodType;
    /** Schema DOCUMENTED for the query string, when it differs from the runtime one. */
    readonly query?: z.ZodObject;
    /**
     * Error statuses the HANDLER can produce (e.g. 422 from the rounds routes).
     * Statuses produced by the gates (401/404/400), by validation (400) and the
     * generic 500 are derived from the definition and need not be listed.
     */
    readonly errors?: readonly number[];
}

/**
 * One route: the runtime route, its validation source and its OpenAPI path
 * entry, in one object.
 */
export interface RouteDefinition<
    Path extends string = string,
    A extends AuthorizeSpec = AuthorizeSpec,
    P extends z.ZodType = z.ZodType,
    Q extends z.ZodType = z.ZodType,
    B extends z.ZodType = z.ZodType,
    R extends z.ZodType = z.ZodType,
    M extends RenderMode = RenderMode,
> {
    readonly method: HttpMethod;
    /** An Express path LITERAL: greppable, and the single source of the URL. */
    readonly path: Path;
    readonly authorize: A;
    /**
     * Zod schemas for the three request parts. They are the RUNTIME validation
     * (`middleware/validate.ts`), the source of the handler's `ctx` types and,
     * unless `openapi` overrides them, the documented request.
     */
    readonly request: {
        readonly params: P;
        readonly query: Q;
        readonly body: B;
    };
    /** Success response schema: the full envelope from `routeResponses` for `envelope` routes. */
    readonly response: R;
    /** Defaults to `envelope`. */
    readonly render: M;
    readonly tags: readonly string[];
    /** Registered only when the app runs in DEV. */
    readonly devOnly: boolean;
    /**
     * Documentation overrides. Used where the runtime schema is deliberately
     * MORE LENIENT than the wire contract (e.g. `rider` on a delete), so the
     * generated spec documents the contract instead of the leniency. Never
     * consulted at runtime.
     */
    readonly openapi: RouteDocs;
    readonly handler: Handler<A, P, Q, B, R, M>;
}

/** A route definition with its type parameters erased, for registration and spec generation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRouteDefinition = RouteDefinition<string, AuthorizeSpec, any, any, any, any, RenderMode>;
