/**
 * The match payload the match, round and riding-time routes answer with,
 * rendered from the database after the route's command has run.
 */
import { findMatchGraph } from '../../db/repositories/matches';
import type { DbOrTx } from '../../db/repositories/internal';
import type { Match as WireMatch } from '../../contract';
import { serializeMatch, type MatchRenderOptions } from '../../serialize';

/** `GET /match/:matchId`, start and end: the mat, the match judges and the rounds. */
export const FULL_MATCH: MatchRenderOptions = Object.freeze({ includeMat: true, includeMatchJudges: true, includeRounds: true });

/**
 * The round and riding-time routes: the mat and the rounds, but no `judges`
 * key. These routes always asked for judges under an option name the
 * renderer did not know, so their payloads never carried them; the client
 * keeps its cached judges when the key is absent.
 */
export const MATCH_WITHOUT_JUDGES: MatchRenderOptions = Object.freeze({ includeMat: true, includeRounds: true });

/** `POST /mat/:matCode/matches`: the new match and its mat. */
export const NEW_MATCH: MatchRenderOptions = Object.freeze({ includeMat: true });

/** Loads the match with everything a render needs and serializes it. */
export async function renderMatch(db: DbOrTx, matchId: string, options: MatchRenderOptions): Promise<WireMatch> {
    const graph = await findMatchGraph(db, matchId);
    if (!graph) throw new TypeError(`Cannot render match ${matchId}: it does not exist`);
    return serializeMatch(graph, options);
}
