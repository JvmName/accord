/**
 * `Mat` -> wire.
 *
 * `id`, `name`, `judge_count` and `creator_id` are always present. The rest
 * are present ONLY when the data is passed (absent otherwise, never null):
 *
 *   judges            mat judges (`judges_mats`), safe users
 *   codes             `POST /mats` only
 *   current_match     earliest-created STARTED incomplete match, or `null`
 *   upcoming_matches  the not-started incomplete matches
 *
 * `incompleteMatches` are full match graphs (`findMatchGraphsByIds` over
 * `findMatGraph().incompleteMatches`), because each nested match renders its
 * `winner`; they are rendered with no match includes.
 */
import type { Mat as WireMat, Match as WireMatch } from '../contract';
import type { MatchGraph } from '../db/repositories/matches';
import type { Mat } from '../db/types';
import { serializeMatch } from './match';
import { serializeMatCode, type MatCodeInput } from './matCode';
import { serializeUser, type UserInput } from './user';
import { resolveNow, type ClockOptions } from './values';

export type MatInput = Pick<Mat, 'id' | 'name' | 'judge_count' | 'creator_id'>;

export interface MatRenderOptions extends ClockOptions {
    /** The mat's judges (`findMatJudges` / `findMatGraph().judges`). */
    judges?: readonly UserInput[];
    /** The mat's codes (`findMatCodesForMat`). */
    codes?: readonly MatCodeInput[];
    /**
     * The mat's INCOMPLETE matches as graphs, in any order (they are sorted
     * here by `created_at`, stably).
     */
    incompleteMatches?: readonly MatchGraph[];
}

/**
 * Splits the incomplete matches: stable sort by
 * `created_at` (`m1.sortKey - m2.sortKey`), then the first STARTED one is
 * current and every not-started one is upcoming. A started match that is not
 * the first is in neither list.
 */
export function splitIncompleteMatches(matches: readonly MatchGraph[]): { current: MatchGraph | null; upcoming: MatchGraph[] } {
    const sorted = matches.slice().sort((m1, m2) => new Date(m1.created_at).getTime() - new Date(m2.created_at).getTime());
    return {
        current:  sorted.find((m) => Boolean(m.started_at)) ?? null,
        upcoming: sorted.filter((m) => !m.started_at),
    };
}

export function serializeMat(mat: MatInput, options: MatRenderOptions = {}): WireMat {
    const response: Record<string, unknown> = {
        id:          mat.id,
        name:        mat.name,
        judge_count: mat.judge_count,
        creator_id:  mat.creator_id,
    };

    if (options.judges !== undefined) response.judges = options.judges.map((judge) => serializeUser(judge));
    if (options.codes !== undefined)  response.codes  = options.codes.map((code) => serializeMatCode(code));
    if (options.incompleteMatches !== undefined) {
        const now = resolveNow(options);
        const { current, upcoming } = splitIncompleteMatches(options.incompleteMatches);
        response.current_match    = current ? serializeMatch(current, { now }) : null;
        response.upcoming_matches = upcoming.map((match): WireMatch => serializeMatch(match, { now }));
    }

    return response as WireMat;
}
