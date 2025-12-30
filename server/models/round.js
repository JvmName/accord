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
        }

        return response;
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
