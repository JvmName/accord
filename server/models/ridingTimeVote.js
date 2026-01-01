const { BaseRecord } = require('../lib/active_record');


class RidingTimeVote extends BaseRecord {
    async end() {
        this.ended_at = new Date();
        await this.save();
    }


    get ended()      { return Boolean(this.ended_at); }
    get started()    { return Boolean(this.started_at); }
    get started_at() { return this.created_at }
}


RidingTimeVote.initialize();


module.exports = {
    RidingTimeVote
};
