/**
 * RUNTIME request schemas of the route registry (server-ts task 12).
 *
 * These reproduce the LEGACY validation of each route exactly: what it accepts,
 * what it rejects, and the error key/message it reports. They are deliberately
 * NOT the task-05 contract schemas from `src/contract/requests.ts`, which
 * describe the intended wire contract and are, in several places, narrower
 * than what the server enforces today (FINDINGS F-75). Using the contract
 * schemas at runtime would change behaviour, and in one place a golden:
 * `http.users.create.objectName.500` requires `POST /users` to let an object
 * `name` through validation (legacy: presence check only; the 500 comes from
 * the insert). The routes therefore validate with these schemas and DOCUMENT
 * the contract schemas through `openapi.body` / `openapi.query`.
 *
 * Every legacy validation in the codebase, and its port:
 *
 * | route                              | legacy                                              | here |
 * |------------------------------------|-----------------------------------------------------|------|
 * | POST /users                        | `name: {presence: true}` -> `'required'` if falsy   | `present()` |
 * | POST /mats                         | `name: {presence: true}`; `judge_count` unchecked   | `present()`, `z.unknown()` |
 * | POST /mat/:matCode/join            | none (`this.params.name \|\| 'Anonymous'`)          | `z.unknown()` |
 * | POST /mat/:matCode/matches         | `validateCreation`: truthy `red.id` or `red.name`, else BOTH keys `red.id`/`red.name` with `'red.id or red.name required'`; same for blue | `createMatchBody` |
 * | PATCH /match/:matchId/rounds/result| `winner: isEnum [undefined,'red','blue']` (null REJECTED, F-24); `stoppage` unchecked | `legacyEnum().optional()`, `z.unknown()` |
 * | POST /match/:matchId/ridingTime    | `rider: isEnum ['red','blue']` (missing rejected)   | `legacyEnum()` |
 * | DELETE /match/:matchId/ridingTime  | none (`rider` is read and ignored, F-55)            | `z.unknown()` |
 *
 * Legacy messages: presence -> `'required'`; isEnum -> `must be one of [<truthy
 * enums joined by ', '>]`, i.e. `'must be one of [red, blue]'` for both enums
 * (falsy members are filtered out of the message).
 *
 * All values are read from the legacy merged bag (path < body < query, with
 * JSON-string decoding; F-73), see `middleware/validate.ts`.
 */
import { z } from 'zod';

/** Any value the legacy `presence` check lets through: every truthy JSON value. */
export type LegacyPresent = string | number | boolean | Record<string, unknown> | unknown[];

/**
 * `validatePresence(value)`: `if (!value) return 'required'`. Truthiness, not
 * type: `''`, `0`, `false`, `null` and a missing key fail; `5`, `true`, objects
 * and arrays pass (probed: `name: 5` creates a user named `5`).
 */
export function present() {
    return z.custom<LegacyPresent>(value => !!value, { error: 'required' });
}

/** `validateIsEnum` over `['red', 'blue']`: anything else (missing and `null` included) fails. */
export function legacyColorEnum() {
    return z.enum(['red', 'blue'], { error: 'must be one of [red, blue]' });
}

/** A competitor as `MatchesController#fetchCompetitors` reads it after validation. */
export interface LegacyCompetitor {
    id?: unknown;
    name?: unknown;
}

// ---------------------------------------------------------------------------
// Path parameters. Express always yields strings for these.
// ---------------------------------------------------------------------------

export const matIdParams    = z.object({ matId: z.string() });
export const matCodeParams  = z.object({ matCode: z.string() });
export const matchIdParams  = z.object({ matchId: z.string() });

// ---------------------------------------------------------------------------
// Bodies / queries (validated against the merged bag).
// ---------------------------------------------------------------------------

/** `POST /users`. */
export const createUserBody = z.object({
    name: present(),
});

/** `POST /mats`. `judge_count` is not validated by legacy at all. */
export const createMatBody = z.object({
    name:        present(),
    judge_count: z.unknown().optional(),
});

/** `POST /mat/:matCode/join`. Nothing is validated; `name` falls back to `'Anonymous'` in the handler. */
export const joinMatBody = z.object({
    name: z.unknown().optional(),
});

/**
 * `POST /mat/:matCode/matches`: `MatchesController#validateCreation`.
 *
 * Reads `red.id`/`red.name` the way `valueForParameterName` did
 * (`(value || {})[segment]`), so a non-object `red` (`"abc"`, `5`) simply has no
 * id/name and fails (probed). Truthiness, not type: `{ name: '' }` fails.
 * The four keys are emitted in legacy order: red.id, red.name, blue.id,
 * blue.name.
 */
export const createMatchBody = z
    .object({
        red:  z.custom<LegacyCompetitor>(() => true).optional(),
        blue: z.custom<LegacyCompetitor>(() => true).optional(),
    })
    .superRefine((value, ctx) => {
        for (const color of ['red', 'blue'] as const) {
            const competitor = (value[color] || {}) as LegacyCompetitor;
            if (!competitor.id && !competitor.name) {
                ctx.addIssue({ code: 'custom', path: [color, 'id'],   message: `${color}.id or ${color}.name required` });
                ctx.addIssue({ code: 'custom', path: [color, 'name'], message: `${color}.id or ${color}.name required` });
            }
        }
    });

/**
 * `PATCH /match/:matchId/rounds/result`. An OMITTED winner is valid (clears
 * the result); an explicit `null` is rejected (F-24: reproduced here; the user
 * decided task 18 will accept it). `stoppage` is not validated (F-59 notes the
 * contract schema's `boolean` would reject non-booleans the legacy accepts).
 */
export const roundResultBody = z.object({
    winner:   legacyColorEnum().optional(),
    stoppage: z.unknown().optional(),
});

/** `POST /match/:matchId/ridingTime`. */
export const startRidingTimeBody = z.object({
    rider: legacyColorEnum(),
});

/**
 * `DELETE /match/:matchId/ridingTime`. Legacy read `rider` and ignored it
 * (F-55); it must keep being accepted, unvalidated (installed clients send it).
 */
export const endRidingTimeQuery = z.object({
    rider: z.unknown().optional(),
});
