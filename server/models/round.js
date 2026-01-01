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


    async end({submission, submitter}={}) {
        const where = {ended_at: null};
        const ridingTimeVotes = await this.getRidingTimeVotes({ where });
        for (const vote of ridingTimeVotes) {
            await vote.end();
        }

        const match = await this.getMatch();
        if (submission) {
            const competitor   = await match.competitorForColor(submitter);
            this.submission    = submission;
            this.submission_by = competitor?.id;
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
        const redRidingTime  = calculateRidingTime(redVotes,  judges, this.ended_at);
        const blueRidingTime = calculateRidingTime(blueVotes, judges, this.ended_at);

        response.ridingTime = {[red.id]:  redRidingTime, [blue.id]: blueRidingTime};
        response.result     = {winner: null, method: {type: null, value: null}};

        if (!this.ended) return;

        if (this.submission) {
            response.result.winner       = red.id == response.submitter_id ? red : blue;
            response.result.method.type  = 'submission'
            response.result.method.value = this.submission;

        } else if (redRidingTime != blueRidingTime) {
            response.result.winner       = redRidingTime > blueRidingTime ? red : blue;
            response.result.method.type  = 'riding_time';
            response.result.method.value = Math.max(redRidingTime, blueRidingTime);
        } else {
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
