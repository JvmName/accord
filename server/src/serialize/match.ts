/**
 * `Match` -> wire (server-ts task 11).
 *
 * Legacy: `Match#toApiResponse(options)` (`models/match.js`):
 *
 *   creator_id, id, mat_id, started_at, ended_at, break_started_at,
 *   break_duration                      `apiSafeKeys`, each `|| null`
 *   red_competitor, blue_competitor     the competitor users (null if missing)
 *   winner                              best-of-maxRounds over the ENDED rounds
 *   break_remaining                     computed on EVERY render, HTTP included
 *                                       (FINDINGS F-20; README/CLAUDE.md wrong)
 *   mat / judges / rounds               ONLY under includeMat /
 *                                       includeMatchJudges / includeRounds,
 *                                       otherwise ABSENT (never null)
 *
 * `red_score` / `blue_score` are columns but are deliberately NOT emitted:
 * `apiSafeKeys` is an explicit list that omits them. They must stay ABSENT
 * (not null), see `test/serialize/match.test.js`.
 *
 * The absent-vs-null split is what the Kotlin client's `Match.merge()`
 * (`models_ext.kt`) relies on: absent = keep cached, null = genuinely empty.
 * Partial payloads in the wild: `POST /mat/:code/matches` (`includeMat` only),
 * the round/ridingTime routes (`includeMat` + `includeRounds`; they pass
 * `includeJudges`, which is not an option, so `judges` is absent), the
 * matches nested in `Mat.current_match` / `upcoming_matches` (no includes),
 * and `round.tech-fall` (`includeRounds` only).
 *
 * Input is always the full graph (`findMatchGraph` / `findMatchGraphsByIds`),
 * even when no association is rendered: `winner` needs every round's score.
 */
import type { LeakedMatch, LeakedRound, LeakedUser, Match as WireMatch, Round as WireRound, User as WireUser } from '../contract';
import type { MatchGraph } from '../db/repositories/matches';
import type { User } from '../db/types';
import type { Competitor, Rules, ScoringModule } from '../domain/types';
import { serializeMat } from './mat';
import { roundOutcome, serializeLeakedRound, serializeRound } from './round';
import { serializeNullableLeakedUser, serializeNullableUser, serializeUser } from './user';
import { legacyColumn, resolveNow, wireTime, type ClockOptions } from './values';

const { RDojoKombatRules }: { RDojoKombatRules: Rules } = require('../domain/rules');
const { getMatchWinner }: ScoringModule                 = require('../domain/scoring');

const rules = RDojoKombatRules;

export type MatchInput = MatchGraph;

/**
 * Which optional associations to render. Named after the legacy render
 * options so a ported route passes the same flags it passed before. Each
 * association key is present on the wire if and only if its flag is truthy.
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
 * `Match#getWinner()`: `null` until `maxRounds` rounds have ENDED (no early
 * exit at 2 wins); then the competitor who won more of the ended rounds, or
 * `null` for a draw. Every ended round's winner is computed with the round
 * scoring (`roundOutcome`), and the id comparison is `getMatchWinner`'s. The
 * winner resolves to the competitor ROW (`null` if that row is missing), as
 * legacy re-fetched it with `getRedCompetitor()` / `getBlueCompetitor()`.
 * (F-34's memoization is not reproduced: there is no instance to cache on.)
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
        creator_id:       legacyColumn(match.creator_id),
        id:               legacyColumn(match.id),
        mat_id:           legacyColumn(match.mat_id),
        started_at:       wireTime(legacyColumn(match.started_at)),
        ended_at:         wireTime(legacyColumn(match.ended_at)),
        break_started_at: wireTime(legacyColumn(match.break_started_at)),
        break_duration:   legacyColumn(match.break_duration),
        red_competitor:   renderNullableUser(match.redCompetitor),
        blue_competitor:  renderNullableUser(match.blueCompetitor),
        winner:           renderNullableUser(matchWinner(match, now)),
        break_remaining:  matchBreakRemaining(match, now),
    };

    if (options.includeMat) {
        // Legacy `(await this.getMat()).toApiResponse(options)` throws on a
        // missing mat row; so does this. The nested mat is rendered with the
        // match's options, none of which is a mat include (no route combines
        // them), so it is always the bare mat.
        if (!match.mat) throw new TypeError(`Cannot render match ${match.id}: its mat ${match.mat_id} does not exist`);
        response.mat = serializeMat(match.mat);
    }
    if (options.includeMatchJudges) {
        // Match judges always go through `User#toApiResponse`: safe even on the WS path.
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

/**
 * ⚠️ F-22: the WebSocket match shape (`leakedMatchSchema`), reproducing the
 * worker path that skips `_formatJSONBody`: `red_competitor`,
 * `blue_competitor`, `winner` and every `rounds[].result.winner` carry
 * `api_token`, `created_at`, `updated_at`. `judges` and `mat` stay safe.
 * For task 14's worker payloads only (MatchUpdateWorker / BreakTransition:
 * all three includes; TechFallTracker / RoundTimer: `includeRounds` only).
 * DELETE IN TASK 18, when the leak is fixed and the ws goldens change
 * (FINDINGS F-22, F-66).
 */
export function serializeLeakedMatch(match: MatchInput, options: MatchRenderOptions = {}): LeakedMatch {
    return renderMatch<LeakedUser, LeakedRound>(match, options, serializeNullableLeakedUser, serializeLeakedRound) as LeakedMatch;
}
