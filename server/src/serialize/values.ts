/**
 * Shared value helpers for the serialization layer.
 */

/**
 * Renders a `Date` as `toISOString()`. Drizzle rows carry `Date` objects
 * (`isoDateTime` column type), so every timestamp passes through here.
 * `null` stays `null`. A non-Date value is passed through unchanged.
 */
export function wireTime(value: Date): string;
export function wireTime(value: Date | null | undefined): string | null;
export function wireTime(value: Date | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return value as unknown as string;
}

/**
 * Options shared by every mapper that renders a time-dependent value
 * (`Round.score` for open votes, `Round.time_remaining`,
 * `Match.break_remaining`). The clock is injected so tests and golden
 * replays with a frozen clock are deterministic. Defaults to `new Date()`
 * at call time.
 */
export interface ClockOptions {
    now?: Date;
}

/** Resolve `options.now`, defaulting to the current wall clock. */
export function resolveNow(options: ClockOptions | undefined): Date {
    return options?.now ?? new Date();
}
