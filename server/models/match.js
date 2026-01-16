const { BaseRecord }     = require('../lib/active_record');
const { getRoundConfig } = require('../lib/roundConfig');
const { Mat }            = require('./mat');
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
            await this.endRound({ submission, submitter });
        });
    }


    async competitorForColor(color) {
              color  = color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
        const method = `get${color}Competitor`;
        return await this[method]();
    }


    getRoundConfig() {
        const roundType = this.round_type || 'RdojoKombat';
        return getRoundConfig(roundType);
    }


    async createRound(roundIndex) {
        const config = this.getRoundConfig();
        const maxPoints = config.getMaxPoints(roundIndex);

        const newRound = await Round.create({
            match_id: this.id,
            round_index: roundIndex,
            max_points: maxPoints
        });

        return newRound;
    }


    async startRound() {
        const lastRound = await this.getLastRound();
        if (lastRound && !lastRound.ended) {
            throw new Error("Cannot start a new round while there is an active round");
        }

        // Determine round index (1 for first round)
        const allRounds = await this.getRounds();
        const roundIndex = allRounds.length + 1;

        await this.createRound(roundIndex);
    }


    async endRound({ submission, submitter, techFallWinner }={}) {
        const lastRound = await this.getLastRound();
        if (!lastRound || lastRound.ended) {
            throw new Error("No available round to end");
        }

        await lastRound.end({ submission, submitter, techFallWinner });

        // AUTO-CREATE NEXT ROUND (Best 2 of 3 logic)
        const allRounds = await this.getRounds();
        const endedRounds = allRounds.filter(r => r.ended);
        const roundCount = endedRounds.length;

        if (roundCount === 1) {
            // After round 1: always create round 2
            await this.createRound(2);
        } else if (roundCount === 2) {
            // After round 2: check if 1-1
            // Determine winners
            let redWins = 0;
            let blueWins = 0;

            for (const round of endedRounds) {
                const response = {};
                await round.addRoundResultToApiResponse(response);
                const winner = response.result?.winner;

                if (winner?.id === this.red_competitor_id) {
                    redWins++;
                } else if (winner?.id === this.blue_competitor_id) {
                    blueWins++;
                }
                // Ties don't count as wins for either side
            }

            if (redWins === 1 && blueWins === 1) {
                // Score is 1-1, create optional round 3
                await this.createRound(3);
            }
            // Else: 2-0 or 0-2, match is over, don't create round 3
        }
        // After round 3: match is over (don't create more rounds)
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
Round.belongsTo(Match);


module.exports = {
    Match
}
