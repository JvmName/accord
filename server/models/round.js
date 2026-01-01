const { BaseRecord }     = require('../lib/active_record');
const { RidingTimeVote } = require('./ridingTimeVote');
const { User }           = require('./user');


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
        await activeVote.destroy();
    }


    async currentRidingTimeVoteForJudge(judge) {
        const where = {
            judge_id: judge.id,
            round_id: this.id,
            ended_at: null,
        };
        return (await this.getRidingTimeVotes({ where }))[0]
    }


    async end({submission, submitter}={}) {
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
            started_at: this.started_at,
            ended_at:   this.ended_at
        }

        if (this.submission) {
            response.submission = this.submission;
            response.submitter  = await this.getSubmitter();
        } else {
            response.submission = null;
            response.submitter  = null;
        }

        return response;
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
