/**
 * The serialization layer (server-ts task 11): repository rows (task 10) +
 * domain results (task 08) in, plain wire objects (task 05 schemas) out.
 *
 * This replaces, explicitly, what `BaseRecord#toApiResponse` /
 * `apiSafeKeys` and `ServerController#_formatJSONBody` did reflectively. Every
 * mapper is a pure function; the only implicit input, the wall clock, is
 * injectable (`{ now }`). Nothing here touches the database, the legacy
 * models, or Sequelize; nothing in `src/db` knows about wire shapes.
 *
 * The HTTP routes render with these; the workers still render through the
 * legacy models. The spec and evidence are in
 * `.ai/plans/server-ts/artifacts/serialize-inventory.md`.
 */
import type { z } from 'zod';
import {
    leakedMatchSchema,
    leakedRoundSchema,
    leakedUserSchema,
    matCodeSchema,
    matSchema,
    matchSchema,
    roundSchema,
    userSchema,
} from '../contract';

export { serializeLeakedUser, serializeNullableLeakedUser, serializeNullableUser, serializeUser, serializeUsers } from './user';
export type { UserInput } from './user';
export { serializeMatCode } from './matCode';
export type { MatCodeInput } from './matCode';
export { serializeMat, splitIncompleteMatches } from './mat';
export type { MatInput, MatRenderOptions } from './mat';
export { matchBreakRemaining, matchWinner, serializeLeakedMatch, serializeMatch } from './match';
export type { MatchInput, MatchRenderOptions } from './match';
export { currentPause, roundMaxDuration, roundOutcome, roundTimeRemaining, serializeLeakedRound, serializeRound } from './round';
export type { RoundInput, RoundMatchContext, RoundOutcome } from './round';
export { legacyColumn, resolveNow, wireTime } from './values';
export type { ClockOptions } from './values';


/* ----------------------------------------------------------------------------
 * Opt-in runtime contract check
 * ------------------------------------------------------------------------- */

/** Each mapper's output schema. The `leaked*` entries are F-22 (task 18 deletes them). */
export const wireSchemas = {
    user:        userSchema,
    matCode:     matCodeSchema,
    mat:         matSchema,
    match:       matchSchema,
    round:       roundSchema,
    leakedUser:  leakedUserSchema,
    leakedMatch: leakedMatchSchema,
    leakedRound: leakedRoundSchema,
} as const;

export type WireKind = keyof typeof wireSchemas;
export type WireOf<K extends WireKind> = z.infer<(typeof wireSchemas)[K]>;

/** A mapper produced something its task-05 schema rejects. */
export class WireContractError extends Error {
    readonly kind: WireKind;
    readonly issues: readonly z.core.$ZodIssue[];

    constructor(kind: WireKind, issues: readonly z.core.$ZodIssue[]) {
        const summary = issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
        super(`wire contract violation (${kind}): ${summary}`);
        this.name   = 'WireContractError';
        this.kind   = kind;
        this.issues = issues;
    }
}

/**
 * Parse `value` through the `kind` schema; throw `WireContractError` if it
 * does not conform. Returns `value` ITSELF (not Zod's parsed copy), so a
 * passing check can never alter what is sent.
 */
export function assertWire<K extends WireKind>(kind: K, value: WireOf<K>): WireOf<K> {
    const result = wireSchemas[kind].safeParse(value);
    if (!result.success) throw new WireContractError(kind, result.error.issues);
    return value;
}

/**
 * Whether `devAssertWire` checks anything: `ACCORD_VALIDATE_WIRE=1`, or
 * `NODE_ENV=development`. Off in production and in tests by default (tests
 * call `assertWire` directly).
 */
export function wireValidationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    if (env.ACCORD_VALIDATE_WIRE === '1') return true;
    if (env.ACCORD_VALIDATE_WIRE === '0') return false;
    return env.NODE_ENV === 'development';
}

/**
 * The opt-in dev-mode check: `assertWire` when `wireValidationEnabled()`,
 * otherwise a no-op. Not wired into the app (task 11 cuts nothing over); a
 * route or worker can wrap its payload in this once it adopts the mappers.
 */
export function devAssertWire<K extends WireKind>(kind: K, value: WireOf<K>): WireOf<K> {
    return wireValidationEnabled() ? assertWire(kind, value) : value;
}
