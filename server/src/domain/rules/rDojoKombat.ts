/**
 * The R-Dojo Kombat ruleset. The scoring/winner bodies live in `../scoring`
 * as pure functions; these methods adapt the ruleset's parameters (tech-fall
 * thresholds) onto them.
 */
import type { Competitor, Judge, PauseInput, RoundStatusInput, Rules, ScoredVoteInput, ScoringModule } from '../types';

const { scoreRidingTime, determineRoundResult }: ScoringModule = require('../scoring');


const RDojoKombatRules: Rules = {
    maxRounds: 3,
    roundDurations: [180, 120, 60],
    breakDurations: [60, 60],

    scoreRound<C extends Competitor>(red: C, blue: C, judges: readonly Judge[], votes: readonly ScoredVoteInput[], pauses: readonly PauseInput[] = [], endAt?: Date | null) {
        return scoreRidingTime(red, blue, judges, votes, pauses, endAt);
    },


    getBreakDuration(roundIndex: number) {
        return this.breakDurations[roundIndex - 1] ?? 0;
    },


    techFallThreshold(roundNumber: number) {
        if (roundNumber == 1) return 24;
        if (roundNumber == 2) return 16;
        return 8;
    },


    determineWinner<C extends Competitor>(red: C, blue: C, redScore: number, blueScore: number, roundNumber: number, round: RoundStatusInput) {
        const threshold = this.techFallThreshold(roundNumber);
        return determineRoundResult(red, blue, redScore, blueScore, threshold, round);
    }

};


module.exports = {
    RDojoKombatRules
}
