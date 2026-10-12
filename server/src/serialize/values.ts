/**
 * Shared value helpers for the serialization layer (server-ts task 11).
 *
 * These reproduce, explicitly, the two generic steps the legacy stack applied
 * reflectively to every rendered value. See
 * `.ai/plans/server-ts/artifacts/serialize-inventory.md`.
 */

/**
 * `BaseRecord#toApiResponse` copies each `apiSafeKeys` column as
 * `this[key] || null` (`lib/activeRecord/baseRecord.js:194-199`). ANY falsy
 * value therefore renders as `null`, not only a missing one: `judge_count: 0`,
 * `break_duration: 0` and `name: ''` all become `null` on the wire. Preserved
 * deliberately (FINDINGS F-63); use this for every column-backed key and
 * nothing else (computed keys like `break_remaining` keep their zeroes).
 */
export function legacyColumn<T>(value: T): T | null {
    return value || null;
}

/**
 * `ServerController#_formatJSONBody` renders a `Date` as `toISOString()`
 * (`lib/server/serverController.js`). Drizzle rows carry `Date` objects
 * (`isoDateTime` column type), so every timestamp passes through here.
 * `null` stays `null`. A non-Date value is passed through unchanged, as the
 * legacy walker did.
 */
export function wireTime(value: Date | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return value as unknown as string;
}

/**
 * Options shared by every mapper that renders a time-dependent value
 * (`Round.score` for open votes, `Round.time_remaining`,
 * `Match.break_remaining`). Legacy read the wall clock (`new Date()` /
 * `Date.now()`) at render time; here it is injected so tests and golden
 * replays with a frozen clock are deterministic. Defaults to `new Date()`
 * at call time, which is exactly the legacy behaviour.
 */
export interface ClockOptions {
    now?: Date;
}

/** Resolve `options.now`, defaulting to the current wall clock. */
export function resolveNow(options: ClockOptions | undefined): Date {
    return options?.now ?? new Date();
}
