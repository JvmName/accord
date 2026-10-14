/**
 * `defineRoute()` (server-ts task 12): one object that is simultaneously the
 * runtime route, its validation source and its OpenAPI path entry.
 *
 * ```ts
 * export const getMatch = defineRoute({
 *     method:    'get',
 *     path:      '/match/:matchId',
 *     authorize: { scope: 'match', level: 'view' },
 *     request:   { params: matchParams },
 *     response:  routeResponses['GET /match/{matchId}'],
 *     tags:      ['matches'],
 *     handler:   async ctx => {
 *         ctx.params.matchId;   // string
 *         ctx.currentMatch;     // Match (a Drizzle row), guaranteed by `authorize`
 *         ctx.currentUser;      // User
 *         return { match: ... }; // checked against MatchResponse
 *     },
 * });
 * ```
 *
 * Every type in `ctx` is INFERRED from the definition; handlers carry no
 * annotations. Two compile-time checks are built in:
 *   - the `params` schema must produce exactly the path's `:params`, as strings;
 *   - the handler's success value must match the response schema's `data`.
 *
 * `defineRoute` has no side effects and does not touch Express: definitions are
 * plain data, registered by `router.ts` and read by the OpenAPI generator.
 */
import { z } from 'zod';
import { NotImplementedError } from './errors';
import type {
    AuthorizeSpec,
    Handler,
    HttpMethod,
    PathParams,
    RenderMode,
    RouteDefinition,
    RouteDocs,
} from './types';

/** The empty request part: an object schema that accepts (and strips) anything. */
export const noInput = z.object({});
export type NoInput = typeof noInput;

/**
 * `true` when `P` parses to an object whose keys are exactly the path's
 * parameters, each a string.
 */
type ParamsMatchPath<Path extends string, P extends z.ZodType> =
    [PathParams<Path>] extends [never]
        ? true // no path params: `params` is the default empty schema (or any object schema)
        : [PathParams<Path>] extends [keyof z.output<P>]
            ? string extends keyof z.output<P>
                ? false // an index signature, not a declared key per parameter
                : [Exclude<keyof z.output<P>, PathParams<Path>>] extends [never]
                    ? [z.output<P>[PathParams<Path> & keyof z.output<P>]] extends [string]
                        ? true
                        : false
                    : false
            : false;

/** What `defineRoute` accepts: `RouteDefinition` with defaults made optional. */
export type RouteInput<
    Path extends string,
    A extends AuthorizeSpec,
    P extends z.ZodType,
    Q extends z.ZodType,
    B extends z.ZodType,
    R extends z.ZodType,
    M extends RenderMode,
> = {
    readonly method: HttpMethod;
    readonly path: Path;
    readonly authorize: A;
    readonly request?: {
        readonly params?: P;
        readonly query?: Q;
        readonly body?: B;
    };
    readonly response: R;
    readonly render?: M;
    readonly tags: readonly string[];
    readonly devOnly?: boolean;
    readonly openapi?: RouteDocs;
    readonly handler: Handler<A, P, Q, B, R, M>;
} & (ParamsMatchPath<Path, P> extends true
    ? unknown
    : { readonly __paramsSchemaMustMatchPath: `request.params must declare exactly the path parameters of ${Path}, as strings` });

export function defineRoute<
    const Path extends string,
    const A extends AuthorizeSpec,
    R extends z.ZodType,
    P extends z.ZodType = NoInput,
    Q extends z.ZodType = NoInput,
    B extends z.ZodType = NoInput,
    const M extends RenderMode = 'envelope',
>(def: RouteInput<Path, A, P, Q, B, R, M>): RouteDefinition<Path, A, P, Q, B, R, M> {
    return Object.freeze({
        method:    def.method,
        path:      def.path,
        authorize: Object.freeze({ ...def.authorize }),
        request:   Object.freeze({
            params: (def.request?.params ?? noInput) as P,
            query:  (def.request?.query  ?? noInput) as Q,
            body:   (def.request?.body   ?? noInput) as B,
        }),
        response:  def.response,
        render:    (def.render ?? 'envelope') as M,
        tags:      Object.freeze([...def.tags]),
        devOnly:   def.devOnly ?? false,
        openapi:   Object.freeze({ ...(def.openapi ?? {}) }),
        handler:   def.handler,
    });
}

const placeholders = new WeakSet<object>();

/**
 * The placeholder every route carries until its handler is ported. It THROWS
 * (never resolves to a success), so a route that is somehow registered before
 * its port answers a loud 500 rather than a silent 200.
 */
export function notImplemented(task: '13a' | '13b' | '13c' | '14'): () => Promise<never> {
    const placeholder = async () => {
        throw new NotImplementedError(`handler not implemented: ported in task ${task}`);
    };
    placeholders.add(placeholder);
    return placeholder;
}

/** Whether `handler` is a `notImplemented()` placeholder, so it can be refused before it is mounted. */
export function isPlaceholder(handler: unknown): boolean {
    return typeof handler === 'function' && placeholders.has(handler);
}
