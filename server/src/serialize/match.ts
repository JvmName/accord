/**
 * `Match` -> wire.
 *
 *   creator_id, id, mat_id, started_at, ended_at, break_started_at,
 *   break_duration                      the stored values
 *   red_competitor, blue_competitor     the competitor users (null if missing)
 *   winner                              best-of-maxRounds over the ENDED rounds
 *   break_remaining                     computed on EVERY render, HTTP included
 *                                       (a live countdown during a break)
 *   mat / judges / rounds               ONLY under includeMat /
 *                                       includeMatchJudges / includeRounds,
 *                                       otherwise ABSENT (never null)
 *
 * `red_score` / `blue_score` are columns but are deliberately NOT emitted:
 * the list of keys is explicit and omits them. They must stay ABSENT
 * (not null), see `test/serialize/match.test.ts`.
 *
 * The absent-vs-null split is what the Kotlin client's `Match.merge()`
 * (`models_ext.kt`) relies on: absent = keep cached, null = genuinely empty.
 * Partial payloads in the wild: `POST /mat/:code/matches` (`includeMat` only),
 * the round/ridingTime routes (`includeMat` + `includeRounds`, so `judges` is
 * absent), the matches nested in `Mat.current_match` / `upcoming_matches` (no
 * includes), and `round.tech-fall` (`includeRounds` only).
 *
 * Input is always the full graph (`findMatchGraph` / `findMatchGraphsByIds`),
 * even when no association is rendered: `winner` needs every round's score.
 */
import type { Match as WireMatch, Round as WireRound, User as WireUser } from '../contract';
import type { MatchGraph } from '../db/repositories/matches';
import type { User } from '../db/types';
import type { Competitor, Rules, ScoringModule } from '../domain/types';
import { serializeMat } from './mat';
import { roundOutcome, serializeRound } from './round';
import { serializeNullableUser, serializeUser } from './user';
import { resolveNow, wireTime, type ClockOptions } from './values';

const { RDojoKombatRules }: { RDojoKombatRules: Rules } = require('../domain/rules');
const { getMatchWinner }: ScoringModule                 = require('../domain/scoring');

const rules = RDojoKombatRules;

export type MatchInput = MatchGraph;

/**
 * Which optional associations to render. Each association key is present on
 * the wire if and only if its flag is truthy.
 */
export interface MatchRenderOptions extends ClockOptions {
    includeMat?: boolean;
    includeMatchJudges?: boolean;
    includeRounds?: boolean;
}

/**
 * `Match#breakRemaining`: `null` unless both `break_started_at` and
 * `break_duration` are truthy, else `max(0, duration - floor(elapsed s))`.
 */
export function matchBreakRemaining(match: Pick<MatchGraph, 'break_started_at' | 'break_duration'>, now: Date): number | null {
    if (!match.break_started_at || !match.break_duration) return null;
    const elapsed = Math.floor((now.getTime() - new Date(match.break_started_at).getTime()) / 1000);
    return Math.max(0, match.break_duration - elapsed);
}

/**
 * The match winner: `null` until `maxRounds` rounds have ENDED (no early
 * exit at 2 wins); then the competitor who won more of the ended rounds, or
 * `null` for a draw. Every ended round's winner is computed with the round
 * scoring (`roundOutcome`), and the id comparison is `getMatchWinner`'s. The
 * winner resolves to the competitor ROW (`null` if that row is missing).
 */
export function matchWinner(match: MatchInput, now: Date): User | null {
    const ended = match.rounds.filter((r) => Boolean(r.ended_at));
    if (ended.length < rules.maxRounds) return null;

    const roundWinners = ended.map((round) => roundOutcome(match, round, now).winner);
    const red: Competitor  = { id: match.red_competitor_id };
    const blue: Competitor = { id: match.blue_competitor_id };
    const winner = getMatchWinner(roundWinners, rules.maxRounds, red, blue);

    if (winner === red)  return match.redCompetitor;
    if (winner === blue) return match.blueCompetitor;
    return null;
}

function renderMatch<U, R>(match: MatchInput,
                           options: MatchRenderOptions,
                           renderNullableUser: (user: User | null) => U | null,
                           renderRound: (match: MatchInput, round: MatchInput['rounds'][number], opts: ClockOptions) => R) {
    const now = resolveNow(options);

    const response: Record<string, unknown> = {
        creator_id:       match.creator_id,
        id:               match.id,
        mat_id:           match.mat_id,
        started_at:       wireTime(match.started_at),
        ended_at:         wireTime(match.ended_at),
        break_started_at: wireTime(match.break_started_at),
        break_duration:   match.break_duration,
        red_competitor:   renderNullableUser(match.redCompetitor),
        blue_competitor:  renderNullableUser(match.blueCompetitor),
        winner:           renderNullableUser(matchWinner(match, now)),
        break_remaining:  matchBreakRemaining(match, now),
    };

    if (options.includeMat) {
        // A missing mat row throws. The nested mat is always the bare mat:
        // no route combines a mat include with a match include.
        if (!match.mat) throw new TypeError(`Cannot render match ${match.id}: its mat ${match.mat_id} does not exist`);
        response.mat = serializeMat(match.mat);
    }
    if (options.includeMatchJudges) {
        // Judges always go through the safe user shape, on every transport.
        response.judges = match.judges.map((judge) => serializeUser(judge));
    }
    if (options.includeRounds) {
        response.rounds = match.rounds.map((round) => renderRound(match, round, { now }));
    }

    return response;
}

/** The HTTP match shape (`matchSchema`). Competitors and winner are the safe `{id, name}`. */
export function serializeMatch(match: MatchInput, options: MatchRenderOptions = {}): WireMatch {
    return renderMatch<WireUser, WireRound>(match, options, serializeNullableUser, serializeRound) as WireMatch;
}
