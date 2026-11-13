/**
 * Round lifecycle commands: `finishRound`, `pauseRound`, `resumeRound`,
 * `setRoundResult` and the supporting `isRoundPaused`.
 *
 * Same rules as `matchLifecycle.ts`: plain async functions, no classes, no
 * caching, no WebSocket emission, conditional writes where two connections can
 * race, every command resolves to `undefined` (`finishRound` to a boolean).
 */
import { present } from '../domain/present';
import type { Round, RoundPause } from '../db/types';
import type { DbOrTx } from '../db/repositories/internal';
import { findMatchById, updateMatch } from '../db/repositories/matches';
import { claimRoundEnd, findCurrentPause, findMatchRounds, insertRoundPause, resumeOpenPauses, setPauseResumed, updateRound } from '../db/repositories/rounds';
import { findOpenRoundVotes } from '../db/repositories/votes';
import type { Rules } from '../domain/types';
import { closeMatch, competitorForColor } from './matchLifecycle';
import { endVote } from './ridingTimeVotes';
import type { Logger } from 'pino';

// CommonJS modules (`module.exports`), typed at the require, as src/domain does.
const { RDojoKombatRules }: { RDojoKombatRules: Rules } = require('../domain/rules');
const { logger }: { logger: Logger }                    = require('../../lib/logger');

/** `Match#rules` / `Round#rules`: the only ruleset. */
const rules = RDojoKombatRules;


/** `Round#isPaused()`: whether the round has an open pause. */
export async function isRoundPaused(db: DbOrTx, roundId: string): Promise<boolean> {
    return !!(await findCurrentPause(db, roundId));
}


/**
 * `Round#end()` — the round side of ending a round. Reached only through
 * `endRound` / `tryEndRound`.
 *
 * 1. claim the end: `ended_at = now` only if the round is still open. A caller
 *    that loses a race returns `false` and writes nothing else
 * 2. end every open vote of the round, and resume every open pause, at that
 *    same instant
 * 3. load the match
 * 4. count the match's rounds
 * 5. count == `maxRounds` -> end the match (the ONLY place a match ends on
 *    its own; never early at 2 wins: invariant, CLAUDE.md #10)
 *    otherwise `d = getBreakDuration(count)`; `d > 0` -> set
 *    `break_started_at = now`, `break_duration = d` on the match
 *    (steps 4-5 are skipped with `{ transition: false }`, which `endMatch` uses)
 *
 * Resolves to whether this call ended the round.
 */
export async function finishRound(db: DbOrTx, round: Round, { transition = true }: { transition?: boolean } = {}): Promise<boolean> {
    const endedAt = new Date();
    if (!(await claimRoundEnd(db, round.id, endedAt))) return false;

    for (const vote of await findOpenRoundVotes(db, round.id)) {
        await endVote(db, vote, endedAt);
    }
    await resumeOpenPauses(db, round.id, endedAt);

    const match = present(await findMatchById(db, round.match_id), 'the round\'s match');
    logger.info(`Round ended: match=${round.match_id} round=${round.id}`);

    // `endMatch` ends its last round without the transition: the match is
    // being ended by the caller, so no second match end and no break.
    if (!transition) return true;

    const allRounds = await findMatchRounds(db, match.id);
    logger.info(`Round transition: match=${round.match_id} completedRounds=${allRounds.length} maxRounds=${rules.maxRounds}`);

    if (allRounds.length == rules.maxRounds) {
        logger.info(`Match ending: match=${round.match_id} reason=max-rounds-reached`);
        await closeMatch(db, match.id);
    } else {
        const breakDuration = rules.getBreakDuration(allRounds.length);
        logger.info(`Break check: match=${round.match_id} breakDuration=${breakDuration}`);
        if (breakDuration > 0) {
            await updateMatch(db, match.id, {
                break_started_at: new Date(),
                break_duration:   breakDuration,
            });
            logger.info(`Break started: match=${round.match_id} duration=${breakDuration}s`);
        }
    }
    return true;
}

/**
 * Pauses the round. Preconditions, in order:
 * `'Round has not started'` (no `created_at`; unreachable for a stored row),
 * `'Round has already ended'`, `'Round is already paused'`. Then inserts a
 * pause with `paused_at = now`.
 */
export async function pauseRound(db: DbOrTx, round: Pick<Round, 'id' | 'created_at' | 'ended_at'>): Promise<void> {
    if (!round.created_at) throw new Error('Round has not started');
    if (round.ended_at)    throw new Error('Round has already ended');
    if (await isRoundPaused(db, round.id)) throw new Error('Round is already paused');

    try {
        await insertRoundPause(db, { round_id: round.id, paused_at: new Date() });
    } catch (err) {
        // A concurrent request paused the round after the check above.
        if ((err as Error).message.startsWith('UNIQUE constraint failed')) throw new Error('Round is already paused');
        throw err;
    }
}


/**
 * Closes the open pause (`resumed_at = now`), or
 * `Error('Round is not paused')`. No ended-round check.
 */
export async function resumeRound(db: DbOrTx, round: Pick<Round, 'id'>): Promise<void> {
    const openPause: RoundPause | null = await findCurrentPause(db, round.id);
    if (!openPause) throw new Error('Round is not paused');

    await setPauseResumed(db, openPause.id, new Date());
}


export interface RoundResultInput {
    /** `'red'` / `'blue'`; falsy clears the result. */
    winner?: string | null;
    /** Defaults to `false` only when `undefined` (destructuring default). */
    stoppage?: boolean | null;
}

/**
 * Sets the round result: step two of the two-step end-round flow (`PATCH /match/:id/rounds/result`).
 *
 * `'Cannot set result on a round that has not ended'` unless the round has
 * ended. The "only during the break or after the match has ended" window and
 * the "last round has ended" check are the ROUTE's preconditions
 * (`isResultWindowOpen`, 422s), not this command's.
 *
 * winner truthy -> `declared_winner_id = competitorForColor(winner)?.id`
 * (left UNCHANGED when the competitor row is missing), `stoppage = stoppage`;
 * winner falsy -> both `null` (a null result is a legitimate persisted state).
 *
 * Always writes, so a save that changes nothing still bumps `updated_at`.
 */
export async function setRoundResult(db: DbOrTx, round: Round, { winner, stoppage = false }: RoundResultInput = {}): Promise<void> {
    if (!round.ended_at) throw new Error('Cannot set result on a round that has not ended');

    let declaredWinnerId: string | null | undefined;
    let newStoppage: boolean | null;
    if (winner) {
        const match      = present(await findMatchById(db, round.match_id), 'the round\'s match');
        const competitor = await competitorForColor(db, match, winner);
        // `undefined` when the competitor row is missing: `.set()` skips it, so the previous winner stays.
        declaredWinnerId = competitor?.id;
        newStoppage      = stoppage;
    } else {
        declaredWinnerId = null;
        newStoppage      = null;
    }

    await updateRound(db, round.id, { declared_winner_id: declaredWinnerId, stoppage: newStoppage });
}
