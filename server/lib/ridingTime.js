class RidingTimeCalculator {
    #activeVotes = {};
    #controlStartedAt;
    #endAt;
    #judges;
    #ridingTime;
    #votes;
    #voteThreshold;

    constructor(votes, judges, endAt) {
        this.#endAt  = endAt || new Date();
        this.#judges = judges;
        this.#votes  = votes;
        this.#votes.sort((v1,v2) => v1.created_at - v2.created_at);

        if (judges.lenth == 1) {
            this.#voteThreshold = 1;
        } else {
            this.#voteThreshold = Math.max(Math.ceil(judges.length/2), 2);
        }
    }


    calculate() {
        this.#ridingTime = 0;
        for (const vote of this.#votes) {
            this.performNextSteps(vote);
        }

        while (this.activeVotes[0]?.ended_at) {
            this.endVote(this.activeVotes[0]);
        }

        if (this.controlActive) {
            this.endControlPeriod(this.#endAt);
        }
    }


    performNextSteps(newVote) {
        let activeVotes  = this.activeVotes;
        let nextStepTime = activeVotes[0]?.ended_at;

        while (nextStepTime && nextStepTime < newVote.created_at) {
            this.endVote(activeVotes[0]);
            activeVotes  = this.activeVotes;
            nextStepTime = activeVotes[0]?.end_time;
        }

        this.startVote(newVote);
    }


    startVote(vote) {
        this.#activeVotes[vote.judge_id] = vote;
        if (!this.#controlStartedAt && this.controlActive) {
            this.#controlStartedAt = vote.started_at;
        }
    }


    endVote(vote) {
        delete this.#activeVotes[vote.judge_id]
        if (this.#controlStartedAt && !this.controlActive) {
            this.endControlPeriod(vote.ended_at);
        }
    }


    get ridingTime()    { return this.#ridingTime }
    get controlActive() { return this.numVotes >= this.#voteThreshold }
    get numVotes()      { return Object.values(this.#activeVotes).length }
    get activeVotes()   {
        const activeVotes = Object.values(this.#activeVotes);
        activeVotes.sort((vote1,vote2) => {
            const val1 = vote1.ended_at || Math.MIN_VALUE;
            const val2 = vote2.ended_at || Math.MIN_VALUE;
            return val1 - val2;
        });
        return activeVotes
    }


    endControlPeriod(endAt) {
        const time = endAt.getTime() - this.#controlStartedAt.getTime();
        this.#ridingTime += time/1000;
        this.#controlStartedAt = null;
    }
}


function calculateRidingTime(votes, judges, endAt) {
    const calculator = new RidingTimeCalculator(votes, judges, endAt)
    calculator.calculate();
    return calculator.ridingTime;
}



module.exports = {
    calculateRidingTime
};
