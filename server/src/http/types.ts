/**
 * Route definition and handler-context types for the typed route registry
 * (server-ts task 12).
 *
 * The payoff of the registry is here: a handler's `ctx` is computed from its
 * route definition, so `ctx.params`, `ctx.query` and `ctx.body` are the parsed
 * Zod outputs and `ctx.currentUser` / `ctx.currentMat` / `ctx.currentMatch` /
 * `ctx.currentRound` exist (non-null) exactly on the routes whose authorization
 * spec guarantees them. Nothing in a handler needs an annotation.
 *
 * NOTE: `strict` is still `false` (task 18), so `strictNullChecks` is off and
 * `User | null` is indistinguishable from `User` to the compiler (F-46). The
 * nullability below is written as it WILL be checked once task 18 flips the
 * flag; until then it is documentation that the compiler cannot enforce. The
 * PRESENCE of a property (e.g. no `currentMatch` on a mat route) is enforced
 * today.
 */
import type { z } from 'zod';
import type { DbOrTx } from '../db/repositories/internal';
import type { Mat, MatCode, Match, Round, User } from '../db/types';
import type { ErrorMap } from '../contract/envelope';
import type { Rendered } from './envelope';
import type { UniqueViolationErrors } from './errors';
import type { ActionFor, Scope, Subject } from './permissions';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * A route's authorization, declared per route (replacing `beforeCallback`
 * strings plus in-action `authorize()` calls). Each variant names the RESOURCE
 * the route resolves (`scope`) and the permission LEVEL it requires (`level`).
 * `middleware/authorize.ts` turns each variant into the exact sequence of
 * checks the legacy controller performed, in the legacy order, because the
 * order is observable (401 vs 404 vs 400).
 *
 * | variant                                   | legacy source                                                     |
 * |-------------------------------------------|-------------------------------------------------------------------|
 * | `none` / `public`                         | no callbacks (System/Docs, `POST /users`)                          |
 * | `newMat` / `create`                       | `MatsController#postIndex` `authorize('create', Mat)`              |
 * | `mat` / `view`                            | `MatsController#getMat` `authorize('view', currentMat)`: NO authn (F-15), missing mat = 401 (F-16) |
 * | `matCode` / `public`                      | `POST /mat/:matCode/join` (`except: 'postJoin'`): nothing before the handler |
 * | `matCode` / `view`                        | mat-scoped `UsersController#authenticateRequest` (404 wins over 401: F-74) |
 * | `matCode` / `create a match`              | `MatchesController` authn + `authorize('create a match')` + `authorize('assign')` |
 * | `match` / `view`                          | `MatchesController` authn + `requireMatch` (404)                   |
 * | `match` / `manage`                        | authn + match 404 + `authorize('manage')`                          |
 * | `match` / `pause`                         | `RoundsController`: authn + 404 + `manage` + `pause` (F-11)         |
 * | `match` / `judge`, `round: 'open'`        | `RidingTimeVoteController`: authn + 404 + no-round 400 + `judge`    |
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
        // `currentMatCode` can be null here only through the F-73 override
        // (`matCode` falsy in the body/query plus a `matId`); legacy then
        // dereferenced it anyway.
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

/** Helpers every handler gets, mirroring the legacy `ServerController` render/authorize surface. */
export interface ContextHelpers {
    /** The Drizzle database (or transaction handle) the registry was built with. */
    readonly db: DbOrTx;
    /** `renderErrors(errors, statusCode = 400)`: return it to send `{ data: { errors }, status }`. */
    renderErrors(errors: ErrorMap | UniqueViolationErrors, statusCode?: number): Rendered;
    /** `renderNotFoundResponse()`: 404 `{ data: null, status: 'not found' }`. */
    renderNotFound(): Rendered;
    /** `renderUnauthorizedResponse()`: 401 `{ data: null, status: 'unauthorized' }`. */
    renderUnauthorized(): Rendered;
    /**
     * In-handler permission check: legacy `await this.authorize(action, scope)`.
     * Throws `AuthorizationError` (-> 401) when denied. The subject defaults to
     * the request's current user and mat code; pass one explicitly when the
     * handler has changed who is acting (legacy `postJoin` creates the user
     * first and the lazily-built `Authorizer` then saw the NEW user).
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
    /** Query parameters, validated from the legacy merged bag (F-73). */
    readonly query: z.output<Q>;
    /** Body, validated from the legacy merged bag (F-73). */
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
    /** Registered only when the app runs in DEV (legacy `DocsController`). */
    readonly devOnly: boolean;
    /**
     * Documentation overrides. Used where the legacy-faithful runtime schema is
     * deliberately MORE LENIENT than the wire contract (e.g. presence-only
     * checks), so the generated spec keeps documenting the task-05 contract
     * schemas instead of the leniency. Never consulted at runtime.
     */
    readonly openapi: RouteDocs;
    readonly handler: Handler<A, P, Q, B, R, M>;
}

/** A route definition with its type parameters erased, for registration and spec generation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRouteDefinition = RouteDefinition<string, AuthorizeSpec, any, any, any, any, RenderMode>;
