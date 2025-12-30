const { BaseRecord }     = require('../lib/active_record');
const { Mat }            = require('./mat');
const { RidingTimeVote } = require('./ridingTimeVote');
const { Round }          = require('./round');
const { User }           = require('./user');


class Match extends BaseRecord {
    /***********************************************************************************************
    * ROUNDS
    ***********************************************************************************************/
    async start() {
        if (this.started) throw new Error("This match has already started");
        await Match.transaction(async () => {
            this.started_at = new Date();
            await this.save();

            const mat    = await this.getMat();
            const judges = await mat.getJudges();
            await this.setJudges(judges);

            await this.startRound();
        });
    }


    async end({submission, submitter}) {
        if (this.ended)    throw new Error("This match has already ended");
        if (!this.started) throw new Error("This match has already not started");

        await Match.transaction(async () => {
            this.ended_at = new Date();
            await this.save();

            let submissionBy;
            if (submission) {
                  const competitor = await this.competitorForColor(submitter);
                        submissionBy = competitor?.id;
            }
           await this.endRound({ submission, submissionBy });
        });
    }


    async competitorForColor(color) {
              color  = color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
        const method = `get${color}Competitor`;
        return await this[method]();
    }


    async startRound() {
        const lastRound = await this.getLastRound();
        if (lastRound && !lastRound.ended) {
            throw new Error("Cannot start a new round while there is an active round");
        }

        const newRound = await Round.create({match_id: this.id});
    }


    async endRound({ submission, submissionBy }={}) {
        const lastRound = await this.getLastRound();
        if (!lastRound || lastRound.ended) {
            throw new Error("No available round to end");
        }

        lastRound.submission    = submission;
        lastRound.submission_by = submissionBy;
        lastRound.ended_at      = new Date();
        await lastRound.save();
    }


    async getLastRound() {
        const rounds = await this.getRounds();
        rounds.sort((r1, r2) => r2.created_at - r1.created_at);
        return rounds[0] || null;
    }


    /***********************************************************************************************
    * API AND PROPERTIES
    ***********************************************************************************************/
    get apiSafeKeys() {
        return ['creator_id', 'id', 'mat_id', 'started_at', 'ended_at'];
    }


    async toApiResponse(options={}) {
        const response           = await super.toApiResponse();
        response.red_competitor  = await this.getRedCompetitor();
        response.blue_competitor = await this.getBlueCompetitor();

        if (options.includeMat)         response.mat    = await this.getMat();
        if (options.includeMatchJudges) response.judges = await this.getJudges();
        if (options.includeRounds) {
            response.rounds = await this.getRounds();
            response.rounds.sort((r1,r2) => r1.created_at - r2.created_at);
        }

        return response;
    }


    get sortKey() {
        return this.created_at;
    }


    get ended() {
        return Boolean(this.ended_at);
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
Match.belongsToMany(User, {
    as:      'judges',
    through: 'judges_matches'
});
Match.belongsTo(Mat);
Mat.hasMany(Match);

Match.hasMany(Round);


module.exports = {
    Match
}
