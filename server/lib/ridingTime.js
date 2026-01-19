class RidingTimeCalculator {
    #activeVotes = {};
    #controlStartedAt;
    #endAt;
    #ridingTime;
    #votes;
    #voteThreshold;
    #competitorId;
    #activeControlTimeMs;
    #activeCompetitor;

    constructor(votes, judges, endAt, competitorId) {
        this.#endAt  = endAt || new Date();
        this.#votes  = votes;
        this.#votes.sort((v1,v2) => v1.started_at - v2.started_at);
        this.#competitorId = competitorId;
        this.#activeControlTimeMs = 0;
        this.#activeCompetitor = null;

        if (judges.length == 1) {
            this.#voteThreshold = 1;
        } else {
            this.#voteThreshold = Math.max(Math.ceil(judges.length/2), 2);
        }
    }

    get activeControlTimeMs() { return this.#activeControlTimeMs; }
    get activeCompetitor() { return this.#activeCompetitor; }


    calculate() {
        this.#ridingTime = 0;
        for (const vote of this.#votes) {
            this.performNextSteps(vote);
        }

        while (this.activeVotes[0]?.ended_at) {
            this.endVote(this.activeVotes[0]);
        }

        // Track ongoing control
        if (this.controlActive) {
            const ongoingTime = this.#endAt.getTime() - this.#controlStartedAt.getTime();
            this.#activeControlTimeMs = ongoingTime % 3000;  // Remainder
            this.#activeCompetitor = this.#competitorId;

            // Add completed periods to points
            this.#ridingTime += Math.floor(ongoingTime / 3000);
            this.#controlStartedAt = null;  // Prevent double-counting
        } else {
            this.#activeControlTimeMs = 0;
            this.#activeCompetitor = null;
        }
    }


    performNextSteps(newVote) {
        let activeVotes  = this.activeVotes;
        let nextStepTime = activeVotes[0]?.ended_at;

        while (nextStepTime && nextStepTime < newVote.started_at) {
            this.endVote(activeVotes[0]);
            activeVotes  = this.activeVotes;
            nextStepTime = activeVotes[0]?.ended_at;
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
        if (endAt < this.#controlStartedAt) {
            console.error('endControlPeriod: endAt < controlStartedAt - data inconsistency');
            return;
        }
        this.#ridingTime += Math.floor(time / 3000);  // POINTS CALCULATION
        this.#controlStartedAt = null;
        this.#activeControlTimeMs = 0;  // Clear active state
        this.#activeCompetitor = null;  // Clear active state
    }
}


function calculateRidingTime(votes, judges, endAt, competitorId) {
    const calculator = new RidingTimeCalculator(votes, judges, endAt, competitorId)
    calculator.calculate();
    return {
        points: calculator.ridingTime,
        activeControlTimeMs: calculator.activeControlTimeMs,
        activeCompetitor: calculator.activeCompetitor
    };
}



module.exports = {
    calculateRidingTime
};
