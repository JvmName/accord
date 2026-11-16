/**
 * Permission rules: who may do what to a mat, a match or a user.
 *
 * SECURITY BOUNDARY. `test/http/permissions.test.ts` checks every grant and
 * deny over the full (action x scope x subject) grid against
 * `test/fixtures/frozen/permissions.jsonl`, and
 * `test/http/authorizationParity.test.ts` replays the authorization matrix over
 * HTTP against the route gates built on it.
 *
 * The scope KIND is explicit (`Scope`, a tagged union), so dispatch never
 * depends on a runtime class. Creating a mat has no row yet and is its own
 * kind, `matClass`.
 *
 * Relationship loading: a match's judges and mat are read through the
 * repositories (`findMatchJudges`, `findMatById`) via `PermissionLoaders`,
 * which tests may replace.
 */
import { present } from '../domain/present';
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

/** Actions a mat scope accepts. */
export type MatAction = 'assign' | 'create a match' | 'create' | 'be assigned judge' | 'view';

/** Actions a match scope accepts: the four match levels. */
export type MatchAction = 'judge' | 'manage' | 'pause' | 'view';

/** Actions a user scope accepts. */
export type UserAction = 'assign';

/**
 * The scope a permission is evaluated against, with its kind made explicit
 * A `null` resource (no mat resolved, say) is denied: `can` returns `false`
 * for a null scope before any dispatch.
 */
export type Scope =
    | { kind: 'string'; value: string }
    | { kind: 'matClass' }
    | { kind: 'mat'; mat: Mat | null }
    | { kind: 'match'; match: Match | null }
    | { kind: 'user'; user: User | null };

/**
 * Who is asking: the current user and the mat code the request carried.
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

/** String scopes. No route uses one. */
async function simpleScopePermission(subject: Subject, _action: string, scope: string): Promise<boolean> {
    if (scope == 'authenticated')   return Boolean(subject.user);
    if (scope == 'unauthenticated') return true;
    if (scope == 'test')            return true;
    return false;
}

/**
 * Mat permissions. The `matClass` kind (creating a mat) has no id, so it is
 * passed as `{ id: undefined }`.
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
 * Match permissions.
 *
 * `judge`: loose `==` id comparison against the match's judges.
 * `manage`: STRICT `===` against the mat's `creator_id`; a missing mat throws a
 *   `TypeError` (impossible through the API: no deletes exist).
 * `pause`: `manage || judge`. Only the master may pause: this permission does
 *   grant judges, but no route reaches it for a judge, because the rounds
 *   routes check `manage` first (see `middleware/authorize.ts`).
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
            return subject.user?.id === present(mat, 'the match\'s mat').creator_id;
        }
        case 'pause':
            return await matchPermission(subject, 'manage', scope, loaders) || await matchPermission(subject, 'judge', scope, loaders);
        case 'view':
            return true;
    }
    return undefined;
}

/** User permissions. */
async function userPermission(_subject: Subject, action: string, _scope: User): Promise<boolean | undefined> {
    switch (action) {
        case 'assign':
            return true;
    }
    return undefined;
}

/** The action names each scope kind accepts; anything else is denied. */
export type ActionFor<S extends Scope> =
    S extends { kind: 'string' }   ? string :
    S extends { kind: 'matClass' } ? MatAction :
    S extends { kind: 'mat' }      ? MatAction :
    S extends { kind: 'match' }    ? MatchAction :
    S extends { kind: 'user' }     ? UserAction :
    never;

/**
 * Whether `subject` may do `action` to `scope`. An unknown action is `false`.
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
