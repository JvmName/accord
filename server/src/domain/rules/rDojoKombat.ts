/**
 * The R-Dojo Kombat ruleset. Moved from `lib/rules/rDojoKombat.js` in
 * server-ts task 08; values and behaviour unchanged. The scoring/winner
 * bodies now live in `../scoring` as pure functions; these methods adapt the
 * ruleset's parameters (tech-fall thresholds, `this.ended_at`) onto them.
 */
import type { Competitor, Judge, PauseInput, RoundStatusInput, Rules, ScoredVoteInput, ScoringModule } from '../types';

const { scoreRidingTime, determineRoundResult }: ScoringModule = require('../scoring');


const RDojoKombatRules: Rules = {
    maxRounds: 3,
    roundDurations: [180, 120, 60],
    breakDurations: [60, 60],

    scoreRound<C extends Competitor>(red: C, blue: C, judges: readonly Judge[], votes: readonly ScoredVoteInput[], pauses: readonly PauseInput[] = []) {
        // DELIBERATE, do not "fix" here (FINDINGS.md F-33, deferred to task 18):
        // this reads `this.ended_at`, but scoreRound is invoked as
        // `rules.scoreRound(...)`, so `this` is the rules object and `ended_at`
        // is always undefined -> the calculator closes any open control period
        // at `new Date()` (call time). Harmless in normal operation because
        // Round#end closes every open vote before setting ended_at, but an
        // ended round holding a still-open vote would keep accruing score.
        // Kept as a `this` read (not a literal `undefined`) so a caller that
        // binds `this` (test/rules/rDojoKombat.test.js uses `.call({ended_at})`)
        // behaves exactly as before.
        const endAt = (this as { ended_at?: Date | null }).ended_at;
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
