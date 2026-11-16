/**
 * `Round` -> wire.
 *
 * A fixed object; almost nothing in it is a column:
 *
 *   id, started_at (= created_at), ended_at,
 *   max_duration   rules.roundDurations[index] || 0
 *   paused         an open pause exists (the LAST open one, insertion order)
 *   time_remaining null once ended; else max_duration minus elapsed seconds
 *                  net of resumed pauses, frozen at an open pause's paused_at
 *   score          { [red_competitor_id]: red, [blue_competitor_id]: blue }
 *   result         { winner, method: { type, value } }
 *
 * `score` and `result` come from the domain functions
 * (`RDojoKombatRules.scoreRound` -> consensus calculator, `getRoundResult`),
 * fed the match's competitor rows, the MATCH judges, the round's votes
 * (`started_at` = `created_at`) and pauses, and the round's 1-based position
 * in the match's rounds. `stoppage`, `declared_winner_id` and `match_id` are
 * NOT emitted.
 *
 * Input is the match graph (`findMatchGraph`) plus one of its rounds: a round
 * cannot be rendered without its match (competitors, judges, position).
 */
import type { Round as WireRound, User as WireUser } from '../contract';
import type { MatchGraph, RoundWithActivity } from '../db/repositories/matches';
import type { RoundPause, User } from '../db/types';
import type { RoundResult, RoundScore, Rules, ScoringModule } from '../domain/types';
import { present } from '../domain/present';
import { serializeUser } from './user';
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

/** Score + result of one round. */
export interface RoundOutcome extends RoundScore, RoundResult<User> {}

/**
 * The score and result of one round, from already-loaded rows.
 *
 * An open control period closes at the round's `ended_at`, or at `now` while
 * the round is open. `now` is injectable for tests.
 */
export function roundOutcome(match: RoundMatchContext, round: RoundInput, now: Date): RoundOutcome {
    const red         = present(match.redCompetitor, 'the red competitor');
    const blue        = present(match.blueCompetitor, 'the blue competitor');
    const roundNumber = match.rounds.findIndex((r) => r.id == round.id) + 1;
    // `RidingTimeVote#started_at` is an alias for `created_at`.
    const votes       = round.ridingTimeVotes.map((vote) => ({ ...vote, started_at: vote.created_at }));

    const score: RoundScore = rules.scoreRound(red, blue, match.judges, votes, round.pauses, round.ended_at ?? now);
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
 * `time_remaining`: `null` once the round
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
