/**
 * Match lifecycle commands (server-ts task 10b). Ports of `Match#start`,
 * `Match#end`, `Match#startRound`, `Match#endRound({safe})` and the supporting
 * read `Match#competitorForColor` (`models/match.js`).
 *
 * Plain async functions over the Drizzle handle: no classes, no association
 * caching, no WebSocket emission, no serialisation. One implementation for
 * both callers (route handlers, task 13b; workers, task 14).
 *
 * BEHAVIOUR IS THE LEGACY BEHAVIOUR, BUGS INCLUDED (behaviour-preservation
 * rule); every defect noticed is in FINDINGS.md, not fixed here. Pinned by the
 * legacy-vs-new parity harness in `test/services/`.
 *
 * NO TRANSACTIONS (user decision 2026-10-11, FINDINGS F-50): the legacy
 * `Match.transaction()` around `start`/`end` was never atomic, so their steps
 * run here sequentially and unwrapped, exactly as they effectively ran.
 * Adopting `src/db/transaction.ts` is a task-18 behaviour change.
 *
 * Every command resolves to `undefined`, like the legacy methods; callers
 * re-read what they render.
 */
import type { Match, User } from '../db/types';
import type { DbOrTx } from '../db/repositories/internal';
import { findMatJudges, findMatById } from '../db/repositories/mats';
import { setMatchJudges, updateMatch } from '../db/repositories/matches';
import { findLastRound, insertRound } from '../db/repositories/rounds';
import { findUserById } from '../db/repositories/users';
import { finishRound } from './roundLifecycle';
import type { Logger } from 'pino';

// lib/logger.ts is CommonJS (`module.exports`), typed at the require.
const { logger }: { logger: Logger } = require('../../lib/logger');


/**
 * `Match#competitorForColor(color)`: `'red'`/`'blue'` (any case) -> that
 * competitor's `User` row, or `null` when the row is missing.
 *
 * Legacy dispatches dynamically (`this['get' + Color + 'Competitor']()`), so
 * any other colour throws a TypeError and an undefined colour throws a
 * TypeError from `color.charAt`. The same expressions are used here so the
 * thrown TypeErrors carry the same messages. Routes validate the colour first,
 * so these paths are unreachable over HTTP today.
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
    return this[method]();
}


/**
 * `Match#start()`.
 *
 * 1. `match.started_at` set -> `Error("This match has already started")`
 *    (checked on the row passed in, as legacy checked the in-memory instance)
 * 2. `started_at = now`
 * 3. judges of the match's mat (ordered by user_id) copied onto the match with
 *    `belongsToMany#set` semantics (`setMatchJudges`). A missing mat throws a
 *    TypeError AFTER step 2 was written, as legacy.
 * 4. `startRound` (throws if an active round exists; steps 2-3 stay written).
 *
 * Unwrapped: no transaction (F-50).
 */
export async function startMatch(db: DbOrTx, match: Pick<Match, 'id' | 'mat_id' | 'started_at'>): Promise<void> {
    if (match.started_at) throw new Error("This match has already started");

    await updateMatch(db, match.id, { started_at: new Date() });

    const mat    = await findMatById(db, match.mat_id);
    const judges = await findMatJudges(db, mat.id);
    await setMatchJudges(db, match.id, judges.map((judge) => judge.id));

    await startRound(db, match.id);
}


/**
 * `Match#end()`.
 *
 * 1. `ended_at` set -> `Error("This match has already ended")`
 * 2. `started_at` unset -> `Error("This match has already not started")` (sic)
 * 3. `ended_at = now`, `break_started_at = null`, `break_duration = null`
 * 4. `endRound({ safe: true })`
 *
 * Quirks kept (FINDINGS F-25.3, F-54): step 4 ends an active last round, and
 * `finishRound` then either RE-SETS a break on this ended match (fewer than
 * `maxRounds` rounds), or, when that round is the last one, calls `endMatch`
 * again, which re-reads the now-ended match and throws "This match has
 * already ended" after everything above was written. When `finishRound`
 * itself ends the match (final round), step 4 finds the round already ended
 * and returns silently because of `safe`.
 *
 * Unwrapped: no transaction (F-50).
 */
export async function endMatch(db: DbOrTx, match: Pick<Match, 'id' | 'started_at' | 'ended_at'>): Promise<void> {
    if (match.ended_at)    throw new Error("This match has already ended");
    if (!match.started_at) throw new Error("This match has already not started");

    await updateMatch(db, match.id, {
        ended_at:         new Date(),
        break_started_at: null,
        break_duration:   null,
    });
    await endRound(db, match.id, { safe: true });
}


/**
 * `Match#startRound()`: refuses while the last round (by `created_at`, then
 * insertion) is still open, otherwise inserts a new round (its `created_at`
 * is its start time).
 *
 * Like legacy it does NOT check that the match is started or not ended
 * (FINDINGS F-56): `POST /match/:id/rounds` can add a round to an unstarted
 * or ended match.
 */
export async function startRound(db: DbOrTx, matchId: string): Promise<void> {
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
}

/**
 * `Match#endRound({ safe } = {})`: ends the match's LAST round.
 *
 * No round, or the last round already ended: `safe` truthy -> resolve
 * silently; otherwise `Error("No available round to end")`. Callers pass:
 * `POST .../rounds/end` -> `{ safe: false }`; RoundTimer and TechFallTracker
 * workers -> nothing (falsy); `endMatch` -> `{ safe: true }`.
 */
export async function endRound(db: DbOrTx, matchId: string, { safe }: EndRoundOptions = {}): Promise<void> {
    const lastRound = await findLastRound(db, matchId);
    if (!lastRound || lastRound.ended_at) {
        if (safe) return;
        throw new Error("No available round to end");
    }
    await finishRound(db, lastRound);
}
