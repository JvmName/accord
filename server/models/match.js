const { BaseRecord }       = require('../lib/active_record');
const { Mat }              = require('./mat');
const { RDojoKombatRules } = require('../lib/rules');
const { Round }            = require('./round');
const { User }             = require('./user');


class Match extends BaseRecord {
    #winner;

    /***********************************************************************************************
    * ASSOCIATIONS
    ***********************************************************************************************/
    async getRounds(queryOptions={}) {
        const rounds = await this.getCachedAssociation('rounds',
                                                       Round,
                                                       {match_id: this.id},
                                                       queryOptions);
        rounds.forEach(r => r._cacheMatch(this));
        return rounds;
    }


    async getRedCompetitor(queryOptions={}) {
        return (await this.getCachedAssociation('redCompetitor',
                                                User,
                                                {id: this.red_competitor_id},
                                                queryOptions))[0] || null;
    }


    async getBlueCompetitor(queryOptions={}) {
        return (await this.getCachedAssociation('blueCompetitor',
                                                User,
                                                {id: this.blue_competitor_id},
                                                queryOptions))[0] || null;
    }


    async getWinner(clear=false) {
        if (this.#winner != undefined) return this.#winner;

        const rounds = (await this.getRounds()).filter(r => r.ended);

        let redWins  = 0;
        let blueWins = 0;
        let winner;
        for (const round of rounds) {
            winner = await round.getWinner();
            if (!winner)                              continue;
            if (winner.id == this.red_competitor_id)  redWins += 1;
            if (winner.id == this.blue_competitor_id) blueWins += 1;
        }

        const roundsToWin = Math.ceil(this.maxRounds/2)
        if (redWins  >= roundsToWin)        return this.#winner = await this.getRedCompetitor();
        if (blueWins >= roundsToWin)        return this.#winner = await this.getBlueCompetitor();
        if (rounds.length < this.maxRounds) return this.#winner = null;
        if (redWins > blueWins)             return this.#winner = await this.getRedCompetitor();
        if (blueWins > redWins)             return this.#winner = await this.getBlueCompetitor();
        return this.#winner = null;
    }


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


    async end() {
        if (this.ended)    throw new Error("This match has already ended");
        if (!this.started) throw new Error("This match has already not started");

        await Match.transaction(async () => {
            this.ended_at = new Date();
            await this.save();
            await this.endRound({safe: true});
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
        this.clearCachedAssociation('rounds')
    }


    async endRound({ submission, submitter, safe }={}) {
        const lastRound = await this.getLastRound();
        if (!lastRound || lastRound.ended) {
            if (safe) return;
            throw new Error("No available round to end");
        }

        await lastRound.end({ submission, submitter });
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
        response.winner          = await this.getWinner();

        if (options.includeMat)         response.mat    = await this.getMat();
        if (options.includeMatchJudges) response.judges = await this.getJudges();
        if (options.includeRounds) {
            response.rounds = await this.getRounds();
            response.rounds.sort((r1,r2) => r1.created_at - r2.created_at);
        }

        return response;
    }


    get sortKey()   { return this.created_at }
    get ended()     { return Boolean(this.ended_at) }
    get started()   { return Boolean(this.started_at) }
    get rules()     { return RDojoKombatRules }
    get maxRounds() { return this.rules.maxRounds }
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
