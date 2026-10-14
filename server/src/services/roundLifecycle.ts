/**
 * Round lifecycle commands (server-ts task 10b). Ports of `Round#end`,
 * `Round#pause`, `Round#resume`, `Round#setResult` and the supporting read
 * `Round#isPaused` (`models/round.js`).
 *
 * Same rules as `matchLifecycle.ts`: plain async functions, no classes, no
 * caching, no WebSocket emission, no transactions (F-50), legacy behaviour
 * kept bugs included, every command resolves to `undefined`.
 */
import type { Match, Round, RoundPause, User } from '../db/types';
import type { DbOrTx } from '../db/repositories/internal';
import { findMatchById, findMatchJudges, updateMatch } from '../db/repositories/matches';
import { findCurrentPause, findMatchRounds, findRoundPauses, insertRoundPause, setPauseResumed, updateRound } from '../db/repositories/rounds';
import { findUserById } from '../db/repositories/users';
import { findOpenRoundVotes, findRoundVotes } from '../db/repositories/votes';
import type { Rules, ScoringModule } from '../domain/types';
import { competitorForColor, endMatch } from './matchLifecycle';
import { endVote } from './ridingTimeVotes';
import type { Logger } from 'pino';

// CommonJS modules (`module.exports`), typed at the require, as src/domain does.
const { RDojoKombatRules }: { RDojoKombatRules: Rules } = require('../domain/rules');
const { getRoundScore, getRoundResult }: ScoringModule  = require('../domain/scoring');
const { logger }: { logger: Logger }                    = require('../../lib/logger');

/** `Match#rules` / `Round#rules`: the only ruleset. */
const rules = RDojoKombatRules;


/** `Round#isPaused()`: whether the round has an open pause. */
export async function isRoundPaused(db: DbOrTx, roundId: string): Promise<boolean> {
    return !!(await findCurrentPause(db, roundId));
}


/**
 * `Round#end()` — the round side of ending a round. Reached only through
 * `endRound` (`Match#endRound`). ORDER IS LOAD-BEARING and is the legacy order:
 *
 * 1. end every open vote of the round (insertion order), one `endVote` each
 * 2. if the round is paused, `resumeRound` (closes the open pause)
 * 3. load the match
 * 4. `ended_at = now`
 * 5. score the round (only for the `Round ended` log line, as legacy)
 * 6. count the match's rounds
 * 7. count == `maxRounds` -> `endMatch(match)` (the ONLY place a match ends
 *    on its own; never early at 2 wins: invariant, CLAUDE.md #10)
 *    otherwise `d = getBreakDuration(count)`; `d > 0` -> set
 *    `break_started_at = now`, `break_duration = d` on the match
 *
 * No guard against an already-ended round (legacy has none either; callers
 * guard, F-62). With several open pauses only the LAST is resumed (F-58).
 * Step 5 is log-only work kept for parity (F-60). The legacy `match.clearCachedAssociation('rounds')` after the break
 * protected the per-instance round cache; there is no cache here, so it
 * evaporates (recorded in the lifecycle inventory).
 */
export async function finishRound(db: DbOrTx, round: Round): Promise<void> {
    const ridingTimeVotes = await findOpenRoundVotes(db, round.id);
    for (const vote of ridingTimeVotes) {
        await endVote(db, vote);
    }

    if (await isRoundPaused(db, round.id)) await resumeRound(db, round);

    const match = await findMatchById(db, round.match_id);

    const endedAt = new Date();
    await updateRound(db, round.id, { ended_at: endedAt });

    const { redScore, blueScore } = await scoreEndedRound(db, { ...round, ended_at: endedAt }, match);
    logger.info(`Round ended: match=${round.match_id} round=${round.id} red=${redScore} blue=${blueScore}`);

    const allRounds = await findMatchRounds(db, match.id);
    logger.info(`Round transition: match=${round.match_id} completedRounds=${allRounds.length} maxRounds=${rules.maxRounds}`);

    if (allRounds.length == rules.maxRounds) {
        logger.info(`Match ending: match=${round.match_id} reason=max-rounds-reached`);
        await endMatch(db, match);
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
}

/**
 * What legacy `Round#collectResultsData` computes when `Round#end` asks for
 * the scores: competitors, match judges, the round's number, the score, and
 * the round result. Only the scores are used (for the log); the result is
 * still derived because it can throw (a missing competitor with a declared
 * winner), and legacy would throw at this point too. Votes are read AFTER
 * step 1 closed them, pauses after step 2.
 */
async function scoreEndedRound(db: DbOrTx, round: Round, match: Pick<Match, 'id' | 'red_competitor_id' | 'blue_competitor_id'>) {
    const red: User | null  = await findUserById(db, match.red_competitor_id);
    const blue: User | null = await findUserById(db, match.blue_competitor_id);
    const judges            = await findMatchJudges(db, match.id);
    const roundNumber       = (await findMatchRounds(db, match.id)).findIndex((r) => r.id == round.id) + 1;

    const votes  = (await findRoundVotes(db, round.id)).map((vote) => ({ ...vote, started_at: vote.created_at }));
    const pauses = await findRoundPauses(db, round.id);

    const { redScore, blueScore } = getRoundScore(rules, red, blue, judges, votes, pauses);
    getRoundResult(rules, red, blue, redScore, blueScore, roundNumber, {
        ended:              Boolean(round.ended_at),
        declared_winner_id: round.declared_winner_id,
        stoppage:           round.stoppage,
    });
    return { redScore, blueScore };
}


/**
 * `Round#pause()`. Preconditions in legacy order:
 * `'Round has not started'` (no `created_at`; unreachable for a stored row),
 * `'Round has already ended'`, `'Round is already paused'`. Then inserts a
 * pause with `paused_at = now`.
 */
export async function pauseRound(db: DbOrTx, round: Pick<Round, 'id' | 'created_at' | 'ended_at'>): Promise<void> {
    if (!round.created_at) throw new Error('Round has not started');
    if (round.ended_at)    throw new Error('Round has already ended');
    if (await isRoundPaused(db, round.id)) throw new Error('Round is already paused');

    await insertRoundPause(db, { round_id: round.id, paused_at: new Date() });
}


/**
 * `Round#resume()`: closes the LAST open pause (`resumed_at = now`), or
 * `Error('Round is not paused')`. No ended-round check (legacy has none).
 */
export async function resumeRound(db: DbOrTx, round: Pick<Round, 'id'>): Promise<void> {
    const openPause: RoundPause | null = await findCurrentPause(db, round.id);
    if (!openPause) throw new Error('Round is not paused');

    await setPauseResumed(db, openPause.id, new Date());
}


export interface RoundResultInput {
    /** `'red'` / `'blue'`; falsy clears the result. */
    winner?: string | null;
    /** Defaults to `false` only when `undefined` (destructuring default), as legacy. */
    stoppage?: boolean | null;
}

/**
 * `Round#setResult({ winner, stoppage = false } = {})` — step two of the
 * two-step end-round flow (`PATCH /match/:id/rounds/result`).
 *
 * `'Cannot set result on a round that has not ended'` unless the round has
 * ended. The "only during the break or after the match has ended" window and
 * the "last round has ended" check are the ROUTE's preconditions
 * (`isResultWindowOpen`, 422s), not this command's, exactly as in legacy.
 *
 * winner truthy -> `declared_winner_id = competitorForColor(winner)?.id`
 * (left UNCHANGED when the competitor row is missing), `stoppage = stoppage`;
 * winner falsy -> both `null` (a null result is a legitimate persisted state).
 *
 * Sequelize skipped the UPDATE (and so did not bump `updated_at`) when no
 * attribute changed. That is reproduced (FINDINGS F-57): unchanged means
 * `declared_winner_id` equal AND `stoppage` null on both sides (Sequelize
 * compared the new value with the raw stored `0/1/null`, so any boolean
 * counts as a change).
 */
export async function setRoundResult(db: DbOrTx, round: Round, { winner, stoppage = false }: RoundResultInput = {}): Promise<void> {
    if (!round.ended_at) throw new Error('Cannot set result on a round that has not ended');

    let declaredWinnerId: string | null | undefined;
    let newStoppage: boolean | null;
    if (winner) {
        const match      = await findMatchById(db, round.match_id);
        const competitor = await competitorForColor(db, match, winner);
        // `undefined` when the competitor row is missing: Sequelize then left
        // the column out of the UPDATE (previous winner kept), and Drizzle's
        // `.set()` skips undefined keys the same way (FINDINGS F-57).
        declaredWinnerId = competitor?.id;
        newStoppage      = stoppage;
    } else {
        declaredWinnerId = null;
        newStoppage      = null;
    }

    const unchanged = declaredWinnerId === round.declared_winner_id
        && newStoppage === null && round.stoppage === null;
    if (unchanged) return;

    await updateRound(db, round.id, { declared_winner_id: declaredWinnerId, stoppage: newStoppage });
}
