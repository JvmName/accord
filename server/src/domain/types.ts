/**
 * Plain structural input/output types for the pure domain layer
 * (server-ts task 08).
 *
 * These are deliberately NOT Sequelize models and NOT Drizzle rows. Anything
 * with the right shape — a Sequelize instance today, a Drizzle row or a plain
 * object in a test — can be passed in. That decoupling is what lets the
 * domain survive the phase-4 ORM swap untouched.
 *
 * This file is types-only and is only ever pulled in with `import type`, so it
 * is erased at runtime and bun never loads it (which is why it may use
 * `export` while the rest of `src/domain` stays CommonJS).
 *
 * Timestamps are `Date`: the riding-time calculator calls `.getTime()` on
 * `vote.ended_at` and on `endAt` directly, so a string there would throw.
 */

/** Entity ids. UUID strings in production; compared with loose `==` throughout. */
export type Id = string;

/** Anything with an id: a competitor or judge. The domain never reads more than `id`. */
export interface Competitor {
    id: Id;
}

/** A judge. Only the panel's *size* matters to the calculator (threshold rule). */
export type Judge = Competitor;

/**
 * One judge's riding-time vote. `ended_at` null/undefined means still open.
 * `competitor_id` is only needed by `scoreRound`, which partitions votes by
 * competitor before handing them to the calculator.
 */
export interface RidingTimeVoteInput {
    judge_id: Id;
    competitor_id?: Id;
    started_at: Date;
    ended_at?: Date | null;
}

/** A vote as scored by `scoreRound` — `competitor_id` is required there. */
export interface ScoredVoteInput extends RidingTimeVoteInput {
    competitor_id: Id;
}

/** A pause interval. `resumed_at` null/undefined means still paused. */
export interface PauseInput {
    paused_at?: Date | null;
    resumed_at?: Date | null;
}

/** The round fields `determineWinner` reads. */
export interface RoundStatusInput {
    ended: boolean;
    declared_winner_id?: Id | null;
    stoppage?: boolean | null;
}

export interface RoundScore {
    redScore: number;
    blueScore: number;
}

export type WinMethodType = 'submission' | 'stoppage' | 'tech-fall' | 'points' | 'tie';

/** `value` is the winning (or tied) score as a string, or null. */
export interface WinMethod {
    type: WinMethodType | null;
    value: string | null;
}

/** `winner` is one of the competitor objects that was passed in — not an id. */
export interface RoundResult<C extends Competitor> {
    winner: C | null;
    method: WinMethod;
}

/**
 * The contract a ruleset satisfies. Mirrors the real method set of
 * `RDojoKombatRules` exactly, so a future ruleset is typechecked against it
 * rather than duck-typed.
 *
 * Note on `scoreRound`: the implementation in `RDojoKombatRules` reads
 * `this.ended_at` (always undefined when called as `rules.scoreRound(...)`).
 * See FINDINGS.md F-33.
 */
export interface Rules {
    readonly maxRounds: number;
    readonly roundDurations: readonly number[];
    readonly breakDurations: readonly number[];

    scoreRound<C extends Competitor>(red: C,
                                     blue: C,
                                     judges: readonly Judge[],
                                     votes: readonly ScoredVoteInput[],
                                     pauses?: readonly PauseInput[]): RoundScore;

    /** Break (seconds) after the round with 1-based index `roundIndex`; 0 = none. */
    getBreakDuration(roundIndex: number): number;

    /** Score at/above which a points win counts as a tech fall, for 1-based `roundNumber`. */
    techFallThreshold(roundNumber: number): number;

    determineWinner<C extends Competitor>(red: C,
                                          blue: C,
                                          redScore: number,
                                          blueScore: number,
                                          roundNumber: number,
                                          round: RoundStatusInput): RoundResult<C>;
}

/** Runtime export shape of `src/domain/ridingTime.ts` (CommonJS, typed at the `require`). */
export interface RidingTimeModule {
    /**
     * NOTE: sorts `votes` IN PLACE by `started_at` (preserved behaviour), hence
     * the mutable array type.
     */
    calculateRidingTime(votes: RidingTimeVoteInput[],
                        judges: readonly Judge[],
                        endAt?: Date | null,
                        pauses?: readonly PauseInput[]): number[];
}

/** Runtime export shape of `src/domain/scoring.ts`. */
export interface ScoringModule {
    scoreRidingTime<C extends Competitor>(red: C,
                                          blue: C,
                                          judges: readonly Judge[],
                                          votes: readonly ScoredVoteInput[],
                                          pauses?: readonly PauseInput[],
                                          endAt?: Date | null): RoundScore;

    determineRoundResult<C extends Competitor>(red: C,
                                               blue: C,
                                               redScore: number,
                                               blueScore: number,
                                               techFallThreshold: number,
                                               round: RoundStatusInput): RoundResult<C>;

    getMatchWinner<C extends Competitor>(endedRoundWinners: ReadonlyArray<Competitor | null | undefined>,
                                         maxRounds: number,
                                         red: C,
                                         blue: C): C | null;

    getRoundScore<C extends Competitor>(rules: Rules,
                                        red: C,
                                        blue: C,
                                        judges: readonly Judge[],
                                        votes: readonly ScoredVoteInput[],
                                        pauses?: readonly PauseInput[]): RoundScore;

    getRoundResult<C extends Competitor>(rules: Rules,
                                         red: C,
                                         blue: C,
                                         redScore: number,
                                         blueScore: number,
                                         roundNumber: number,
                                         round: RoundStatusInput): RoundResult<C>;
}
