/**
 * Pure round/match scoring derivations (server-ts task 08).
 *
 * Extracted from `RDojoKombatRules` (`scoreRound`/`determineWinner` bodies) and
 * `Match#getWinner` (best-of-`maxRounds` resolution). Every function here is
 * generic over `{ id }` competitors and returns the competitor objects that
 * were passed in — never ids — because the models depend on getting the same
 * object back.
 *
 * Pure: no imports outside `src/domain`. The models (`models/round.js`,
 * `models/match.js`) still do all the loading and call into these.
 */
import type {
    Competitor,
    Judge,
    PauseInput,
    RidingTimeModule,
    RoundResult,
    RoundScore,
    RoundStatusInput,
    Rules,
    ScoredVoteInput,
    ScoringModule,
    WinMethod,
} from './types';

const { calculateRidingTime }: RidingTimeModule = require('./ridingTime');


/**
 * Partition votes by competitor, run the consensus calculator on each side, and
 * score `floor(seconds / 3)` PER control period (periods are floored
 * independently, never merged).
 *
 * `endAt` is where a still-open control period is closed; undefined means
 * "now" (the calculator's fallback).
 */
function scoreRidingTime<C extends Competitor>(red: C,
                                               blue: C,
                                               judges: readonly Judge[],
                                               votes: readonly ScoredVoteInput[],
                                               pauses: readonly PauseInput[] = [],
                                               endAt?: Date | null): RoundScore {
    const redVotes    = votes.filter(vote => vote.competitor_id == red.id);
    const blueVotes   = votes.filter(vote => vote.competitor_id == blue.id);

    const redPeriods  = calculateRidingTime(redVotes,  judges, endAt, pauses);
    const bluePeriods = calculateRidingTime(blueVotes, judges, endAt, pauses);

    const redScore  = redPeriods.reduce((sum, d)  => sum + Math.floor(d / 3), 0);
    const blueScore = bluePeriods.reduce((sum, d) => sum + Math.floor(d / 3), 0);

    return { redScore, blueScore };
}


/**
 * Round winner + result method. Precedence: not ended -> nothing; declared
 * winner without stoppage -> submission; declared winner with stoppage ->
 * stoppage; differing scores -> tech-fall (score >= threshold) or points;
 * otherwise tie.
 */
function determineRoundResult<C extends Competitor>(red: C,
                                                    blue: C,
                                                    redScore: number,
                                                    blueScore: number,
                                                    techFallThreshold: number,
                                                    round: RoundStatusInput): RoundResult<C> {
    let winner: C | null    = null;
    let method: WinMethod   = {type: null, value: null};
    const threshold         = techFallThreshold;

    if (!round.ended) {
        // do nothing

    } else if (round.declared_winner_id && !round.stoppage) {
        winner       = red.id == round.declared_winner_id ? red : blue;
        method.type  = 'submission';
        method.value = null;

    } else if (round.declared_winner_id && round.stoppage) {
        winner      = red.id == round.declared_winner_id ? red : blue;
        method.type = 'stoppage';

    } else if (redScore != blueScore) {
        const score  = Math.max(redScore, blueScore);
        winner       = score == redScore ? red : blue;
        method.type  = score >= threshold ? 'tech-fall' : 'points';
        method.value = String(score);
    } else {
        method.type  = 'tie'
        method.value = String(redScore);
    }

    return { winner, method };
}


/**
 * Best-of-`maxRounds` match winner, from the winners of the match's ENDED
 * rounds (in round order; `null` = tied round).
 *
 * Invariants (CLAUDE.md, do not change):
 *   - a match always plays all `maxRounds` rounds: with fewer than `maxRounds`
 *     ended rounds the result is `null`, even if one side already holds a
 *     majority. There is NO early exit at 2 wins.
 *   - `null` is meaningful: "still in progress" or "genuine draw".
 *
 * Returns `red` or `blue` (the objects passed in) or `null`. Ids compare with
 * loose `==`, as in the original `Match#getWinner`.
 */
function getMatchWinner<C extends Competitor>(endedRoundWinners: ReadonlyArray<Competitor | null | undefined>,
                                              maxRounds: number,
                                              red: C,
                                              blue: C): C | null {
    if (endedRoundWinners.length < maxRounds) return null;

    let redWins  = 0;
    let blueWins = 0;
    for (const winner of endedRoundWinners) {
        if (!winner)                  continue;
        if (winner.id == red.id)      redWins += 1;
        if (winner.id == blue.id)     blueWins += 1;
    }

    if (redWins > blueWins)  return red;
    if (blueWins > redWins)  return blue;
    return null;
}


/**
 * Thin wrapper: score a round under `rules`. Calls `rules.scoreRound(...)` as a
 * method so `this` is the rules object, exactly as `Round#getScore` did.
 */
function getRoundScore<C extends Competitor>(rules: Rules,
                                             red: C,
                                             blue: C,
                                             judges: readonly Judge[],
                                             votes: readonly ScoredVoteInput[],
                                             pauses?: readonly PauseInput[]): RoundScore {
    return rules.scoreRound(red, blue, judges, votes, pauses);
}


/** Thin wrapper: round winner + method under `rules`. */
function getRoundResult<C extends Competitor>(rules: Rules,
                                              red: C,
                                              blue: C,
                                              redScore: number,
                                              blueScore: number,
                                              roundNumber: number,
                                              round: RoundStatusInput): RoundResult<C> {
    return rules.determineWinner(red, blue, redScore, blueScore, roundNumber, round);
}


const scoring: ScoringModule = {
    scoreRidingTime,
    determineRoundResult,
    getMatchWinner,
    getRoundScore,
    getRoundResult,
};

module.exports = scoring;
