/**
 * `Mat` -> wire (server-ts task 11).
 *
 * Legacy: `Mat` has no `apiSafeKeys` override, so `BaseRecord` renders the
 * `mats` columns minus `created_at`/`updated_at`: `id`, `name`,
 * `judge_count`, `creator_id`, each `|| null`. `Mat#toApiResponse(options)`
 * (`models/mat.js`) then adds, ONLY when asked (absent otherwise, never null):
 *
 *   judges            includeMatJudges   mat judges (`judges_mats`), safe users
 *   codes             includeCodes       `POST /mats` only
 *   current_match     includeMatches     earliest-created STARTED incomplete
 *                                        match, or `null` (the `undefined`
 *                                        from `find()` is rendered as null)
 *   upcoming_matches  includeMatches     the not-started incomplete matches
 *
 * Here the presence of the data decides the presence of the key: pass
 * `judges` to render `judges`, and so on. `incompleteMatches` are full match
 * graphs (`findMatchGraphsByIds` over `findMatGraph().incompleteMatches`),
 * because each nested match renders its `winner`; they are rendered with no
 * match includes, exactly as the legacy options object (which never carries
 * a match include on a mat route) produced.
 */
import type { Mat as WireMat, Match as WireMatch } from '../contract';
import type { MatchGraph } from '../db/repositories/matches';
import type { Mat } from '../db/types';
import { serializeMatch } from './match';
import { serializeMatCode, type MatCodeInput } from './matCode';
import { serializeUser, type UserInput } from './user';
import { legacyColumn, resolveNow, type ClockOptions } from './values';

export type MatInput = Pick<Mat, 'id' | 'name' | 'judge_count' | 'creator_id'>;

export interface MatRenderOptions extends ClockOptions {
    /** `includeMatJudges`: the mat's judges (`findMatJudges` / `findMatGraph().judges`). */
    judges?: readonly UserInput[];
    /** `includeCodes`: the mat's codes (`findMatCodesForMat`). */
    codes?: readonly MatCodeInput[];
    /**
     * `includeMatches`: the mat's INCOMPLETE matches as graphs, in any order
     * (they are sorted here by `created_at`, stably, as legacy sorted them).
     */
    incompleteMatches?: readonly MatchGraph[];
}

/**
 * `Mat#toApiResponse`'s split of the incomplete matches: stable sort by
 * `created_at` (`m1.sortKey - m2.sortKey`), then the first STARTED one is
 * current and every not-started one is upcoming. A started match that is not
 * the first is in neither list, as before.
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
        id:          legacyColumn(mat.id),
        name:        legacyColumn(mat.name),
        judge_count: legacyColumn(mat.judge_count),
        creator_id:  legacyColumn(mat.creator_id),
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
