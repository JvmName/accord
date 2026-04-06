const { calculateRidingTime } = require('../ridingTime');


const RDojoKombatRules = {
    maxRounds: 3,
    roundDurations: [180, 120, 60],

    scoreRound(red, blue, judges, votes, pauses = []) {
        const redVotes    = votes.filter(vote => vote.competitor_id == red.id);
        const blueVotes   = votes.filter(vote => vote.competitor_id == blue.id);

        const redPeriods  = calculateRidingTime(redVotes,  judges, this.ended_at, pauses);
        const bluePeriods = calculateRidingTime(blueVotes, judges, this.ended_at, pauses);

        const redScore  = redPeriods.reduce((sum, d)  => sum + Math.floor(d / 3), 0);
        const blueScore = bluePeriods.reduce((sum, d) => sum + Math.floor(d / 3), 0);

        return { redScore, blueScore };
    },


    techFallThreshold(roundNumber) {
        if (roundNumber == 1) return 24;
        if (roundNumber == 2) return 16;
        return 8;
    },


    determineWinner(red, blue, redScore, blueScore, roundNumber, round) {
        let winner      = null;
        let method      = {type: null, value: null};
        const threshold = this.techFallThreshold(roundNumber);

        if (!round.ended) {
            // do nothing

        } else if (round.submission) {
            winner       = red.id == round.submission_by ? red : blue;
            method.type  = 'submission'
            method.value = round.submission;

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

};


module.exports = {
    RDojoKombatRules
}
