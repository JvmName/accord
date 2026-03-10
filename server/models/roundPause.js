const { BaseRecord } = require('../lib/active_record');


class RoundPause extends BaseRecord {
    get apiSafeKeys() {
        return ['id', 'round_id', 'paused_at', 'resumed_at'];
    }
}


RoundPause.initialize();


module.exports = {
    RoundPause
};
