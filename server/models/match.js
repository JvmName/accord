const { BaseRecord } = require('../lib/active_record');
const { User }       = require('./user');
const { Mat }        = require('./mat');


class Match extends BaseRecord {
    get sortKey() {
        return this.created_at.getTime();
    }


    get apiSafeKeys() {
        return ['creator_id', 'id', 'mat_id', 'started_at', 'completed_at'];
    }


    async toApiResponse(options={}) {
        const response           = await super.toApiResponse();
        response.red_competitor  = await this.getRedCompetitor();
        response.blue_competitor = await this.getBlueCompetitor();

        if (options.includeMat) response.mat = await this.getMat();

        return response;
    }


    get completed() {
        return Boolean(this.completed_at);
    }


    get started() {
        return Boolean(this.started_at);
    }
}


Match.initialize();


Match.belongsTo(User, {
    foreignKey: 'creator_id',
    as:         'creator'
});
Match.belongsTo(User, {
    foreignKey: 'red_competitor_id',
    as:         'redCompetitor'
});
Match.belongsTo(User, {
    foreignKey: 'blue_competitor_id',
    as:         'blueCompetitor'
});
Match.belongsTo(Mat);
Mat.hasMany(Match);


module.exports = {
    Match
}
