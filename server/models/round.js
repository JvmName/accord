const { BaseRecord }          = require('../lib/active_record');
const { calculateRidingTime } = require('../lib/ridingTime');
const { RidingTimeVote }      = require('./ridingTimeVote');
const { User }                = require('./user');


class Round extends BaseRecord {
    async startRidingTime(judge, riderColor) {
        const activeVote = await this.currentRidingTimeVoteForJudge(judge)
        if (activeVote) throw new Error(`Riding time is already active`);

        const match      = await this.getMatch();
        const competitor = await match.competitorForColor(riderColor);
        const vote = new RidingTimeVote({competitor_id: competitor.id,
                                         judge_id: judge.id,
                                         round_id: this.id});
        await vote.save();
    }


    async endRidingTime(judge, riderColor) {
        const activeVote = await this.currentRidingTimeVoteForJudge(judge)
        if (!activeVote) throw new Error(`Riding time is not active`);
        await activeVote.end();
    }


    async currentRidingTimeVoteForJudge(judge) {
        const where = {
            judge_id: judge.id,
            ended_at: null,
        };
        return (await this.getRidingTimeVotes({ where }))[0]
    }


    async end({submission, submitter, techFallWinner}={}) {
        const where = {ended_at: null};
        const ridingTimeVotes = await this.getRidingTimeVotes({ where });
        for (const vote of ridingTimeVotes) {
            await vote.end();
        }

        const match = await this.getMatch();

        // Handle submission
        if (submission) {
            const competitor   = await match.competitorForColor(submitter);
            this.submission    = submission;
            this.submission_by = competitor?.id;
        }

        // Handle tech fall
        if (techFallWinner) {
            this.tech_fall_winner = techFallWinner;
        }

        this.ended_at = new Date();
        await this.save();
    }


    async toApiResponse() {
        const response = {
            id:         this.id,
            started_at: this.started_at,
            ended_at:   this.ended_at
        }

        await this.addRoundResultToApiResponse(response);

        return response;
    }


    async addRoundResultToApiResponse(response) {
        const match          = await this.getMatch();
        const red            = await match.getRedCompetitor();
        const blue           = await match.getBlueCompetitor();
        const judges         = await match.getJudges();

        const votes          = await this.getRidingTimeVotes();
        const redVotes       = votes.filter(vote => vote.competitor_id == red.id);
        const blueVotes      = votes.filter(vote => vote.competitor_id == blue.id);

        // Calculate with enhanced return value
        const redResult  = calculateRidingTime(redVotes,  judges, this.ended_at, red.id);
        const blueResult = calculateRidingTime(blueVotes, judges, this.ended_at, blue.id);

        // Points
        response.controlTime = {
            [red.id]:  redResult.points,
            [blue.id]: blueResult.points
        };

        // Active control time (convert ms to seconds, take max)
        const activeControlTime = Math.max(
            redResult.activeControlTimeMs,
            blueResult.activeControlTimeMs
        );
        response.activeControlTime = Math.floor(activeControlTime / 1000);

        // Active competitor (one or the other, not both)
        response.activeCompetitor = redResult.activeCompetitor || blueResult.activeCompetitor;

        // Tech fall winner
        const redTechFall = this.max_points && redResult.points >= this.max_points;
        const blueTechFall = this.max_points && blueResult.points >= this.max_points;
        response.techFallWin = redTechFall ? red.id : (blueTechFall ? blue.id : null);

        // Round metadata
        response.maxPoints = this.max_points;
        response.roundIndex = this.round_index;

        // Result determination
        response.result = {winner: null, method: {type: null, value: null}};

        if (!this.ended) return;

        // Priority 1: Submission
        if (this.submission) {
            response.result.winner       = red.id == this.submission_by ? red : blue;
            response.result.method.type  = 'submission';
            response.result.method.value = this.submission;
        }
        // Priority 2: Tech fall
        else if (this.tech_fall_winner) {
            response.result.winner       = this.tech_fall_winner === red.id ? red : blue;
            response.result.method.type  = 'tech_fall';
            response.result.method.value = this.tech_fall_winner === red.id ? redResult.points : blueResult.points;
        }
        // Priority 3: Control time (points)
        else if (redResult.points != blueResult.points) {
            response.result.winner       = redResult.points > blueResult.points ? red : blue;
            response.result.method.type  = 'control_time';
            response.result.method.value = Math.max(redResult.points, blueResult.points);
        }
        // Priority 4: Tie
        else {
            response.result.method.type  = 'tie';
        }

    }


    get started_at() { return this.created_at };
    get started()    { return Boolean(this.started_at) };
    get ended()      { return Boolean(this.ended_at) };
}


Round.initialize();

Round.belongsTo(User, {
    foreignKey: 'submission_by',
    as:         'submitter'
});
Round.hasMany(RidingTimeVote);


module.exports = {
    Round
}
