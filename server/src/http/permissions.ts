/**
 * Permission rules (server-ts task 12): the replacement for
 * `lib/server/authorizer.js`, reproducing its grant/deny logic EXACTLY.
 *
 * SECURITY BOUNDARY. Every function here is a line-for-line port; deviations
 * are bugs. `test/http/permissions.test.ts` runs this module and the legacy
 * `Authorizer` side by side over the full (action x scope x subject) grid and
 * asserts identical answers, and `test/http/authorizationParity.test.ts`
 * replays the task-02b matrix over HTTP against the route gates built on it.
 *
 * F-53: the legacy `Authorizer#can` chooses the permission table from
 * `scope.constructor.name` (`'String' | 'Mat' | 'Match' | 'User'`), which plain
 * Drizzle rows do not have (`constructor.name === 'Object'`). Here the scope
 * KIND is explicit (`Scope`, a tagged union), so dispatch never depends on a
 * runtime class. The class-vs-instance distinction (`can('create', Mat)` is
 * called with the CLASS) becomes its own kind, `matClass`.
 *
 * Relationship loading: `matchPermission` called `scope.getJudges()` and
 * `scope.getMat()` on a Sequelize instance; here those reads go through the
 * repositories (`findMatchJudges`, `findMatById`) via `PermissionLoaders`,
 * which tests may replace.
 */
import { findMatchJudges } from '../db/repositories/matches';
import { findMatById } from '../db/repositories/mats';
import type { DbOrTx } from '../db/repositories/internal';
import type { Mat, MatCode, Match, User } from '../db/types';
import type { MatCodeModule } from '../domain/types';

// `src/domain/matCode.ts` is CommonJS (`module.exports = ...`), like the rest
// of `src/domain`; `require` keeps its runtime shape and the type comes from
// the shared module type.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MatCodes: MatCodeModule = require('../domain/matCode');

/** Actions the legacy `Authorizer#matPermission` knows. */
export type MatAction = 'assign' | 'create a match' | 'create' | 'be assigned judge' | 'view';

/** Actions the legacy `Authorizer#matchPermission` knows: the four match levels. */
export type MatchAction = 'judge' | 'manage' | 'pause' | 'view';

/** Actions the legacy `Authorizer#userPermission` knows. */
export type UserAction = 'assign';

/**
 * The scope a permission is evaluated against, with its kind made explicit
 * (F-53). The `null` resource cases model legacy calls such as
 * `authorize('view', this.currentMat)` with no mat resolved: `can` returns
 * `false` for a null scope before any dispatch (`if (!scope) return false`).
 */
export type Scope =
    | { kind: 'string'; value: string }
    | { kind: 'matClass' }
    | { kind: 'mat'; mat: Mat | null }
    | { kind: 'match'; match: Match | null }
    | { kind: 'user'; user: User | null };

/**
 * Who is asking: the legacy `new Authorizer(this.currentUser, this.currentMatCode)`.
 * The mat code matters because mat-level `assign`/`create a match` permission
 * is granted by holding the mat's ADMIN code, not by membership.
 */
export interface Subject {
    user: User | null;
    matCode: MatCode | null;
}

/** The relationship reads `matchPermission` performs. Replaceable in tests. */
export interface PermissionLoaders {
    matchJudges(match: Match): Promise<Array<Pick<User, 'id'>>>;
    matchMat(match: Match): Promise<Pick<Mat, 'creator_id'> | null>;
}

export function repositoryLoaders(db: DbOrTx): PermissionLoaders {
    return {
        matchJudges: match => findMatchJudges(db, match.id),
        matchMat:    match => findMatById(db, match.mat_id),
    };
}

/** Legacy `simpleScopePermission`. No HTTP call site uses a string scope (authz-matrix.txt), kept for parity. */
async function simpleScopePermission(subject: Subject, _action: string, scope: string): Promise<boolean> {
    if (scope == 'authenticated')   return Boolean(subject.user);
    if (scope == 'unauthenticated') return true;
    if (scope == 'test')            return true;
    return false;
}

/**
 * Legacy `matPermission`. For the `matClass` kind (`can('create', Mat)`),
 * legacy passed the CLASS as `scope`, so `scope.id` was `Mat.id` (undefined):
 * reproduced by passing `{ id: undefined }`.
 */
async function matPermission(subject: Subject, action: string, scope: { id?: string }): Promise<boolean | undefined> {
    switch (action) {
        case 'assign':
        case 'create a match':
            if (!subject.matCode)                   return false;
            if (subject.matCode.mat_id != scope.id) return false;
            return MatCodes.isAdminCode(subject.matCode);
        case 'create':
            return Boolean(subject.user);
        case 'be assigned judge':
            return true;
        case 'view':
            return true;
    }
    return undefined;
}

/**
 * Legacy `matchPermission`.
 *
 * `judge`: loose `==` id comparison against the match's judges.
 * `manage`: STRICT `===` against the mat's `creator_id`; a missing mat throws a
 *   `TypeError` from `mat.creator_id`, exactly as legacy did (impossible
 *   through the API: no deletes exist).
 * `pause`: `manage || judge`. NOTE (F-11, decision 2026-10-11: only the
 *   master may pause): this permission DOES grant judges, but no route ever
 *   reaches it for a judge, because the rounds routes check `manage` first
 *   (see `middleware/authorize.ts`). Ported unchanged, not widened, not dropped.
 * `view`: unconditional.
 */
async function matchPermission(subject: Subject, action: string, scope: Match, loaders: PermissionLoaders): Promise<boolean | undefined> {
    switch (action) {
        case 'judge': {
            const judges = await loaders.matchJudges(scope);
            return judges.some(judge => judge.id == subject.user?.id);
        }
        case 'manage': {
            const mat = await loaders.matchMat(scope);
            return subject.user?.id === mat.creator_id;
        }
        case 'pause':
            return await matchPermission(subject, 'manage', scope, loaders) || await matchPermission(subject, 'judge', scope, loaders);
        case 'view':
            return true;
    }
    return undefined;
}

/** Legacy `userPermission`. */
async function userPermission(_subject: Subject, action: string, _scope: User): Promise<boolean | undefined> {
    switch (action) {
        case 'assign':
            return true;
    }
    return undefined;
}

/** The action names each scope kind accepts; anything else is denied (legacy returns `undefined`). */
export type ActionFor<S extends Scope> =
    S extends { kind: 'string' }   ? string :
    S extends { kind: 'matClass' } ? MatAction :
    S extends { kind: 'mat' }      ? MatAction :
    S extends { kind: 'match' }    ? MatchAction :
    S extends { kind: 'user' }     ? UserAction :
    never;

/**
 * Legacy `Authorizer#can(action, scope)`. Returns a boolean (legacy returned
 * `undefined` for an unknown action; that is coerced to `false`, which is how
 * every legacy caller used it: `if (!authorized) throw`).
 */
export async function can<S extends Scope>(
    subject: Subject,
    action: ActionFor<S>,
    scope: S,
    loaders: PermissionLoaders,
): Promise<boolean> {
    switch (scope.kind) {
        case 'string':
            if (!scope.value) return false;
            return Boolean(await simpleScopePermission(subject, action, scope.value));
        case 'matClass':
            return Boolean(await matPermission(subject, action, { id: undefined }));
        case 'mat':
            if (!scope.mat) return false;
            return Boolean(await matPermission(subject, action, scope.mat));
        case 'match':
            if (!scope.match) return false;
            return Boolean(await matchPermission(subject, action, scope.match, loaders));
        case 'user':
            if (!scope.user) return false;
            return Boolean(await userPermission(subject, action, scope.user));
    }
    return false;
}
