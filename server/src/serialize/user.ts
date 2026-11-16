/**
 * `User` -> wire.
 *
 * The `users` columns minus `api_token`, `created_at` and `updated_at`:
 * exactly `id` and `name`. Every user that reaches an HTTP response or a
 * WebSocket payload goes through this: mat/match judges, viewers, the
 * competitors and winners embedded in matches and rounds, and the `user` of
 * `POST /users` / `POST /mat/:code/join`.
 */
import type { User as WireUser } from '../contract/user';
import type { User } from '../db/types';

/** The columns the safe user shape reads. A full `users` row satisfies it. */
export type UserInput = Pick<User, 'id' | 'name'>;

/** The canonical, safe user shape: `{ id, name }`. Never `api_token`. */
export function serializeUser(user: UserInput): WireUser {
    return {
        id:   user.id,
        name: user.name,
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

