const { BaseRecord } = require('../lib/active_record');
const { User }       = require('./user');


class Round extends BaseRecord {
    async toApiResponse() {
        const response = {
            started_at: this.created_at,
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


    get started() { return Boolean(this.started_at) };
    get ended()   { return Boolean(this.ended_at) };
}


Round.initialize();

Round.belongsTo(User, {
    foreignKey: 'submission_by',
    as: 'submitter'
});


module.exports = {
    Round
}
