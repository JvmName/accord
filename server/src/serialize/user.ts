/**
 * `User` -> wire (server-ts task 11).
 *
 * Legacy: `User#apiSafeKeys` = the `users` columns minus `api_token`,
 * `created_at`, `updated_at` -> exactly `id`, `name`, each `|| null`
 * (`models/user.js`, `BaseRecord#toApiResponse`). Every user that reaches an
 * HTTP response goes through this: mat/match judges, viewers, the competitors
 * and winners embedded in matches and rounds (FINDINGS F-22: over HTTP they
 * are stripped by `_formatJSONBody`), and the `user` of `POST /users` /
 * `POST /mat/:code/join`.
 */
import type { LeakedUser, User as WireUser } from '../contract/user';
import type { User } from '../db/types';
import { legacyColumn, wireTime } from './values';

/** The columns the safe user shape reads. A full `users` row satisfies it. */
export type UserInput = Pick<User, 'id' | 'name'>;

/** The canonical, safe user shape: `{ id, name }`. Never `api_token`. */
export function serializeUser(user: UserInput): WireUser {
    return {
        id:   legacyColumn(user.id),
        name: legacyColumn(user.name),
    };
}

/** A user list: `GET /mat/:code/judges` -> `{judges}`, `.../viewers` -> `{viewers}`. */
export function serializeUsers(users: readonly UserInput[]): WireUser[] {
    return users.map((user) => serializeUser(user));
}

/**
 * A user reference that may be missing: `getRedCompetitor()` /
 * `getBlueCompetitor()` resolve to `null` when the row does not exist, and
 * `winner` is `null` for no winner / a draw. Renders `null`, never absent.
 */
export function serializeNullableUser(user: UserInput | null | undefined): WireUser | null {
    return user ? serializeUser(user) : null;
}

/**
 * ⚠️ F-22 LEAK, reproduced for the WebSocket path only. DELETE IN TASK 18.
 *
 * The worker hands `Match#toApiResponse()`'s raw result to socket.io, whose
 * JSON encoder calls Sequelize's `toJSON()` on the competitor / winner model
 * instances, emitting every column: `id`, `name`, `api_token`, `created_at`,
 * `updated_at` (raw values, no `|| null`; dates as ISO strings). This is
 * account takeover of both competitors by any room member (F-22). It exists
 * so task 14 can reproduce the four `ws.*` goldens byte-for-byte; it must
 * never be used for an HTTP response. See FINDINGS F-66.
 */
export function serializeLeakedUser(user: User): LeakedUser {
    return {
        id:         user.id,
        name:       user.name,
        api_token:  user.api_token,
        created_at: wireTime(user.created_at),
        updated_at: wireTime(user.updated_at),
    };
}

/** `serializeLeakedUser` for a reference that may be missing (`null`). F-22; delete in task 18. */
export function serializeNullableLeakedUser(user: User | null | undefined): LeakedUser | null {
    return user ? serializeLeakedUser(user) : null;
}
