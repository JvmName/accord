const { BaseRecord } = require('../lib/active_record');


class RidingTimeVote extends BaseRecord {
    async end() {
        this.ended_at = new Date();
        await this.save();
    }
}


RidingTimeVote.initialize();


module.exports = {
    RidingTimeVote
};
