/**
 * `Round` -> wire (server-ts task 11).
 *
 * Legacy: `Round#toApiResponse()` (`models/round.js`) builds a fixed object
 * literal; almost nothing in it is a column:
 *
 *   id, started_at (= created_at), ended_at,
 *   max_duration   rules.roundDurations[index] || 0
 *   paused         an open pause exists (the LAST open one, insertion order)
 *   time_remaining null once ended; else max_duration minus elapsed seconds
 *                  net of resumed pauses, frozen at an open pause's paused_at
 *   score          { [red_competitor_id]: red, [blue_competitor_id]: blue }
 *   result         { winner, method: { type, value } }
 *
 * `score` and `result` come from the task-08 domain functions
 * (`RDojoKombatRules.scoreRound` -> consensus calculator, `getRoundResult`),
 * fed the same inputs `#collectResultsData` loaded: the match's competitor
 * rows, the MATCH judges, the round's votes (`started_at` = `created_at`) and
 * pauses, and the round's 1-based position in the match's rounds. `stoppage`,
 * `declared_winner_id` and `match_id` are NOT emitted (F-51: stoppage is never
 * on the wire).
 *
 * Input is the match graph (`findMatchGraph`) plus one of its rounds: a round
 * cannot be rendered without its match (competitors, judges, position).
 */
import type { LeakedRound, LeakedUser, Round as WireRound, User as WireUser } from '../contract';
import type { MatchGraph, RoundWithActivity } from '../db/repositories/matches';
import type { RoundPause, User } from '../db/types';
import type { RoundResult, RoundScore, Rules, ScoringModule } from '../domain/types';
import { serializeLeakedUser, serializeUser } from './user';
import { resolveNow, wireTime, type ClockOptions } from './values';

// CommonJS domain modules, typed at the require (as src/services does).
const { RDojoKombatRules }: { RDojoKombatRules: Rules } = require('../domain/rules');
const { getRoundResult }: ScoringModule                 = require('../domain/scoring');

/** `Match#rules` / `Round#rules`: the only ruleset. */
const rules = RDojoKombatRules;

/** What a round render reads from its match. A `MatchGraph` satisfies it. */
export type RoundMatchContext = Pick<MatchGraph,
    'red_competitor_id' | 'blue_competitor_id' | 'redCompetitor' | 'blueCompetitor' | 'judges'> & {
    /** All of the match's rounds, in `getRounds()` order (created_at, then insertion). */
    rounds: ReadonlyArray<{ id: string }>;
};

export type RoundInput = RoundWithActivity;

/** Score + result of one round, as `Round#collectResultsData` computed them. */
export interface RoundOutcome extends RoundScore, RoundResult<User> {}

/**
 * The legacy `#collectResultsData` for one round, from already-loaded rows.
 *
 * `now` closes still-open control periods. Legacy called
 * `rules.scoreRound(...)` with `this` = the rules object, so the calculator's
 * `endAt` was `undefined` and fell back to `new Date()` at call time
 * (FINDINGS F-33). Binding `this.ended_at = now` passes that same instant
 * explicitly: identical for `now` = the wall clock, and injectable for tests.
 */
export function roundOutcome(match: RoundMatchContext, round: RoundInput, now: Date): RoundOutcome {
    const red         = match.redCompetitor;
    const blue        = match.blueCompetitor;
    const roundNumber = match.rounds.findIndex((r) => r.id == round.id) + 1;
    // `RidingTimeVote#started_at` is an alias for `created_at`.
    const votes       = round.ridingTimeVotes.map((vote) => ({ ...vote, started_at: vote.created_at }));

    const score: RoundScore = rules.scoreRound.call({ ended_at: now }, red, blue, match.judges, votes, round.pauses);
    const { winner, method } = getRoundResult(rules, red, blue, score.redScore, score.blueScore, roundNumber, {
        ended:              Boolean(round.ended_at),
        declared_winner_id: round.declared_winner_id,
        stoppage:           round.stoppage,
    });
    return { redScore: score.redScore, blueScore: score.blueScore, winner, method };
}

/** `Round#getMaxDuration()`: `roundDurations[index] || 0`, index = position in the match's rounds. */
export function roundMaxDuration(match: Pick<RoundMatchContext, 'rounds'>, round: { id: string }): number {
    const index = match.rounds.map((r) => r.id).indexOf(round.id);
    return rules.roundDurations[index] || 0;
}

/** `pauses.slice().reverse().find(p => p.isOpen) || null`: the LAST open pause. */
export function currentPause(pauses: readonly RoundPause[]): RoundPause | null {
    return pauses.slice().reverse().find((p) => !p.resumed_at) || null;
}

/**
 * `time_remaining`, verbatim from `Round#toApiResponse`: `null` once the round
 * has ended; otherwise `max(0, maxDuration - floor((ref - started_at -
 * pausedMs) / 1000))`, where `ref` is the open pause's `paused_at` (the clock
 * freezes while paused) or `now`, and `pausedMs` sums only RESUMED pauses.
 */
export function roundTimeRemaining(round: Pick<RoundInput, 'created_at' | 'ended_at' | 'pauses'>,
                                   maxDuration: number,
                                   now: Date): number | null {
    if (round.ended_at) return null;
    const pause = currentPause(round.pauses);
    const ref   = pause ? new Date(pause.paused_at) : now;
    let pausedMs = 0;
    for (const p of round.pauses) {
        if (p.resumed_at) pausedMs += new Date(p.resumed_at).getTime() - new Date(p.paused_at).getTime();
    }
    const elapsedMs = ref.getTime() - new Date(round.created_at).getTime() - pausedMs;
    return Math.max(0, maxDuration - Math.floor(elapsedMs / 1000));
}

function renderRound<U>(match: RoundMatchContext,
                        round: RoundInput,
                        now: Date,
                        renderWinner: (user: User) => U) {
    const outcome     = roundOutcome(match, round, now);
    const maxDuration = roundMaxDuration(match, round);

    return {
        id:             round.id,
        started_at:     wireTime(round.created_at),
        ended_at:       wireTime(round.ended_at),
        max_duration:   maxDuration,
        paused:         !!currentPause(round.pauses),
        time_remaining: roundTimeRemaining(round, maxDuration, now),
        score: {
            [match.red_competitor_id]:  outcome.redScore,
            [match.blue_competitor_id]: outcome.blueScore,
        },
        result: {
            winner: outcome.winner ? renderWinner(outcome.winner) : null,
            method: { type: outcome.method.type, value: outcome.method.value },
        },
    };
}

/** The HTTP round shape (`roundSchema`). `result.winner` is the safe `{id, name}`. */
export function serializeRound(match: RoundMatchContext, round: RoundInput, options: ClockOptions = {}): WireRound {
    return renderRound<WireUser>(match, round, resolveNow(options), serializeUser);
}

/**
 * ⚠️ F-22: the WebSocket round shape (`leakedRoundSchema`): `result.winner`
 * carries `api_token`/`created_at`/`updated_at`. For task 14's worker
 * payloads only; DELETE IN TASK 18 together with the leak.
 */
export function serializeLeakedRound(match: RoundMatchContext, round: RoundInput, options: ClockOptions = {}): LeakedRound {
    return renderRound<LeakedUser>(match, round, resolveNow(options), serializeLeakedUser);
}
