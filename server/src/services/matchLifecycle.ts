/**
 * Match lifecycle commands: `startMatch`, `endMatch`, `startRound`,
 * `endRound` and the supporting `competitorForColor`.
 *
 * Plain async functions over the Drizzle handle: no classes, no association
 * caching, no WebSocket emission, no serialisation. One implementation for
 * both callers (route handlers; workers).
 *
 * Two connections (the web process and the worker process) write the same
 * rows, so a command that changes a row claims the change with a conditional
 * UPDATE and goes on only if its UPDATE changed a row. The commands are not
 * transactions: a caller that needs a command's writes to be all-or-nothing
 * (`startMatch`) wraps the call in `transaction()`.
 *
 * Every command resolves to `undefined` (`tryEndRound` to a boolean); callers
 * re-read what they render.
 */
import { present } from '../domain/present';
import type { Match, User } from '../db/types';
import type { DbOrTx } from '../db/repositories/internal';
import { findMatJudges, findMatById } from '../db/repositories/mats';
import { claimMatchEnd, claimMatchStart, findMatchById, setMatchJudges } from '../db/repositories/matches';
import { findLastRound, insertRound } from '../db/repositories/rounds';
import { findUserById } from '../db/repositories/users';
import { CommandRefused } from './errors';
import { finishRound } from './roundLifecycle';
import type { Logger } from 'pino';

// lib/logger.ts is CommonJS (`module.exports`), typed at the require.
const { logger }: { logger: Logger } = require('../../lib/logger');


/**
 * `'red'`/`'blue'` (any case) -> that competitor's `User` row, or `null` when
 * the row is missing.
 *
 * Any other colour throws a TypeError, and an undefined colour throws one from
 * `color.charAt`. Routes validate the colour first, so these paths are
 * unreachable over HTTP.
 */
export async function competitorForColor(db: DbOrTx, match: Pick<Match, 'red_competitor_id' | 'blue_competitor_id'>, color: string): Promise<User | null> {
          color  = color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
    const method = `get${color}Competitor`;
    const accessors = {
        getRedCompetitor:  () => findUserById(db, match.red_competitor_id),
        getBlueCompetitor: () => findUserById(db, match.blue_competitor_id),
    };
    return await callAccessor.call(accessors, method);
}

function callAccessor(this: Record<string, () => Promise<User | null>>, method: string): Promise<User | null> {
    // An unknown colour has no accessor: the call below throws a TypeError.
    return this[method]!();
}


/**
 * `Match#start()`.
 *
 * 1. `match.started_at` set -> `Error("This match has already started")`
 *    (checked on the row passed in)
 * 2. `started_at = now`, only if the match has not started in the meantime
 *    (otherwise `CommandRefused`)
 * 3. judges of the match's mat (ordered by user_id) copied onto the match with
 *    `belongsToMany#set` semantics (`setMatchJudges`). A missing mat throws a
 *    TypeError
 * 4. `startRound` (throws if an active round exists)
 *
 * Not atomic by itself: a throw after step 2 leaves the earlier writes.
 */
export async function startMatch(db: DbOrTx, match: Pick<Match, 'id' | 'mat_id' | 'started_at'>): Promise<void> {
    if (match.started_at) throw new Error("This match has already started");
    if (!(await claimMatchStart(db, match.id, new Date()))) throw new CommandRefused("This match has already started");

    const mat    = present(await findMatById(db, match.mat_id), 'the match\'s mat');
    const judges = await findMatJudges(db, mat.id);
    await setMatchJudges(db, match.id, judges.map((judge) => judge.id));

    await startRound(db, match.id);
}


/**
 * `Match#end()`.
 *
 * 1. `ended_at` set -> `Error("This match has already ended")`
 * 2. `started_at` unset -> `Error("This match has already not started")` (sic)
 * 3. end the last round if it is open, WITHOUT the match transition
 *    (`endRound({ safe: true, transition: false })`)
 * 4. `ended_at = now`, `break_started_at = null`, `break_duration = null`,
 *    only if the match has not ended in the meantime (otherwise
 *    `CommandRefused`)
 *
 * The round is ended first and without the transition so that ending the
 * match during the final round does not end the match twice, and no break is
 * set on a match that is ending.
 */
export async function endMatch(db: DbOrTx, match: Pick<Match, 'id' | 'started_at' | 'ended_at'>): Promise<void> {
    if (match.ended_at)    throw new Error("This match has already ended");
    if (!match.started_at) throw new Error("This match has already not started");

    await endRound(db, match.id, { safe: true, transition: false });
    if (!(await closeMatch(db, match.id))) throw new CommandRefused("This match has already ended");
}


/** Ends the match and clears its break; `false` when it had already ended. */
export async function closeMatch(db: DbOrTx, matchId: string): Promise<boolean> {
    return await claimMatchEnd(db, matchId, new Date());
}


/**
 * `Match#startRound()`: refuses a match that has not started or has ended
 * (a misclick must not add a 4th round to a finished match), refuses
 * while the last round (by `created_at`, then insertion) is still open,
 * otherwise inserts a new round (its `created_at` is its start time).
 */
export async function startRound(db: DbOrTx, matchId: string): Promise<void> {
    const match = present(await findMatchById(db, matchId), 'the match');
    if (!match.started_at) throw new Error("Cannot start a round on a match that has not started");
    if (match.ended_at)    throw new Error("Cannot start a round on a match that has ended");

    const lastRound = await findLastRound(db, matchId);
    if (lastRound && !lastRound.ended_at) {
        throw new Error("Cannot start a new round while there is an active round");
    }

    const newRound = await insertRound(db, { match_id: matchId });
    logger.info(`Round created: match=${matchId} round=${newRound.id}`);
}


export interface EndRoundOptions {
    /** `true`: return silently when there is no open last round (Match#end). Otherwise throw. */
    safe?: boolean;
    /** `false`: end the round without the match transition (no match end, no break). `endMatch` only. */
    transition?: boolean;
}

/**
 * Ends the match's LAST round if it is open, and says whether this call did:
 * `false` when there is no round, it already ended, or another caller ended it
 * first. The workers use this and emit only when it is `true`.
 */
export async function tryEndRound(db: DbOrTx, matchId: string, { transition }: Pick<EndRoundOptions, 'transition'> = {}): Promise<boolean> {
    const lastRound = await findLastRound(db, matchId);
    if (!lastRound || lastRound.ended_at) return false;
    return await finishRound(db, lastRound, { transition });
}

/**
 * `Match#endRound({ safe } = {})`: ends the match's LAST round.
 *
 * No round, or the last round already ended (or ended by another caller during
 * this call): `safe` truthy -> resolve silently; otherwise
 * `Error("No available round to end")`. `POST .../rounds/end` passes
 * `{ safe: false }`; `endMatch` passes `{ safe: true }`.
 */
export async function endRound(db: DbOrTx, matchId: string, { safe, transition }: EndRoundOptions = {}): Promise<void> {
    if (!(await tryEndRound(db, matchId, { transition })) && !safe) throw new Error("No available round to end");
}
