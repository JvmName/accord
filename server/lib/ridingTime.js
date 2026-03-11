class RidingTimeCalculator {
    #activeVotes = {};
    #controlStartedAt;
    #endAt;
    #ridingTime;
    #votes;
    #voteThreshold;
    #pendingControlTime = 0;
    #paused = false;
    #pauses;
    #resumedAt = null;

    constructor(votes, judges, endAt, pauses = []) {
        this.#endAt  = endAt || new Date();
        this.#votes  = votes;
        this.#votes.sort((v1,v2) => v1.started_at - v2.started_at);
        this.#pauses = pauses;

        if (judges.length == 1) {
            this.#voteThreshold = 1;
        } else {
            this.#voteThreshold = Math.max(Math.ceil(judges.length/2), 2);
        }
    }


    calculate() {
        this.#ridingTime = 0;

        // Build combined event list from votes and pauses
        const events = [];

        for (const vote of this.#votes) {
            events.push({ time: new Date(vote.started_at), type: 'voteStart', vote });
            if (vote.ended_at) {
                events.push({ time: new Date(vote.ended_at), type: 'voteEnd', vote });
            }
        }

        for (const pause of this.#pauses) {
            if (pause.paused_at) {
                events.push({ time: new Date(pause.paused_at), type: 'pausedAt' });
            }
            if (pause.resumed_at) {
                events.push({ time: new Date(pause.resumed_at), type: 'resumedAt' });
            }
        }

        // Sort all events chronologically; for ties, process pauses before votes
        // so that a pause at the exact same time as a vote is handled in a predictable order
        events.sort((a, b) => {
            const diff = a.time - b.time;
            if (diff !== 0) return diff;
            // paused_at / resumed_at before vote events at same timestamp
            const order = { pausedAt: 0, resumedAt: 0, voteStart: 1, voteEnd: 1 };
            return (order[a.type] || 0) - (order[b.type] || 0);
        });

        for (const event of events) {
            if (event.type === 'voteStart') {
                this.startVote(event.vote);
            } else if (event.type === 'voteEnd') {
                this.endVote(event.vote);
            } else if (event.type === 'pausedAt') {
                this.#handlePause(event.time);
            } else if (event.type === 'resumedAt') {
                this.#handleResume(event.time);
            }
        }

        if (this.controlActive && !this.#paused) {
            this.endControlPeriod(this.#endAt);
        }
    }


    #handlePause(pausedAt) {
        if (this.#controlStartedAt !== null && this.#controlStartedAt !== undefined) {
            // Suspend the in-progress control period without discarding it
            this.#pendingControlTime = pausedAt.getTime() - this.#controlStartedAt.getTime();
            this.#controlStartedAt = null;
        }
        this.#paused = true;
    }


    #handleResume(resumedAt) {
        this.#paused = false;
        this.#resumedAt = resumedAt;
        if (this.controlActive) {
            // Quorum already met on resume: immediately apply pending time
            this.#controlStartedAt = new Date(resumedAt.getTime() - this.#pendingControlTime);
            this.#pendingControlTime = 0;
            this.#resumedAt = null;
        }
    }


    startVote(vote) {
        this.#activeVotes[vote.judge_id] = vote;
        if (!this.#paused && !this.#controlStartedAt && this.controlActive) {
            const voteTime = new Date(vote.started_at).getTime();
            const withinGrace = this.#resumedAt !== null && (voteTime - this.#resumedAt.getTime()) <= 1500;
            this.#controlStartedAt = new Date(withinGrace ? voteTime - this.#pendingControlTime : voteTime);
            this.#pendingControlTime = 0;
            this.#resumedAt = null;
        }
    }


    endVote(vote) {
        delete this.#activeVotes[vote.judge_id];
        if (!this.controlActive && !this.#paused) {
            // Quorum lost outside a pause: discard everything
            this.#controlStartedAt = null;
            this.#pendingControlTime = 0;
            this.#resumedAt = null;
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


function calculateRidingTime(votes, judges, endAt, pauses = []) {
    const calculator = new RidingTimeCalculator(votes, judges, endAt, pauses)
    calculator.calculate();
    return calculator.ridingTime;
}



module.exports = {
    calculateRidingTime
};
