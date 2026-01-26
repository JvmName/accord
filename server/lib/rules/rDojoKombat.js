const { calculateRidingTime } = require('../ridingTime');


const RDojoKombatRules = {
    maxRounds: 3,

    scoreRound(red, blue, judges, votes) {
        const redVotes       = votes.filter(vote => vote.competitor_id == red.id);
        const blueVotes      = votes.filter(vote => vote.competitor_id == blue.id);
        const redRidingTime  = calculateRidingTime(redVotes,  judges, this.ended_at);
        const blueRidingTime = calculateRidingTime(blueVotes, judges, this.ended_at);

        const redScore  = Math.floor(redRidingTime/3);
        const blueScore = Math.floor(blueRidingTime/3);

        return { redScore, blueScore };
    },


    determineWinner(red, blue, redScore, blueScore, round) {
        let winner = null;
        let method = {type: null, value: null};

        if (!round.ended) {
            // do nothing

        } else if (round.submission) {
            winner       = red.id == round.submission_by ? red : blue;
            method.type  = 'submission'
            method.value = round.submission;

        } else if (redScore != blueScore) {
            const score  = Math.max(redScore, blueScore);
            winner       = score == redScore ? red : blue;
            method.type  = 'points';
            method.value = score;
        } else {
            method.type  = 'tie'
            method.value = redScore;
        }

        return { winner, method };
    }

};


module.exports = {
    RDojoKombatRules
}
