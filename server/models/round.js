const { BaseRecord }          = require('../lib/active_record');
const { RidingTimeVote }      = require('./ridingTimeVote');
const { RoundPause }          = require('./roundPause');
const { RDojoKombatRules }    = require('../lib/rules');
const { User }                = require('./user');


class Round extends BaseRecord {
    #blueScore;
    #index;
    #pauses = null;
    #redScore;
    #winMethod;
    #winner;


    /***********************************************************************************************
    * ASSOCIATIONS
    ***********************************************************************************************/
    async getRidingTimeVotes(queryOptions={}) {
        return await this.getCachedAssociation('ridingTimeVotes',
                                               RidingTimeVote,
                                               {round_id: this.id},
                                               queryOptions);
    }


    async getMatch(queryOptions={}) {
        const { Match } = require('./match');
        return (await this.getCachedAssociation('match',
                                               Match,
                                               {id: this.match_id},
                                               queryOptions))[0] || null;
    }


    _cacheMatch(match) {
        this._cacheRecord('match', [match]);
    }


    async getPauses(queryOptions={}) {
        const results = await this.getCachedAssociation('pauses',
                                                        RoundPause,
                                                        {round_id: this.id},
                                                        queryOptions);
        // Sort ascending by paused_at and store in private field for sync access
        const sorted = results.slice().sort((a, b) => new Date(a.paused_at) - new Date(b.paused_at));
        this.#pauses = sorted;
        return sorted;
    }


    /***********************************************************************************************
    * RIDING TIME
    ***********************************************************************************************/
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
        await activeVote.end();
    }


    async currentRidingTimeVoteForJudge(judge) {
        const where = {
            judge_id: judge.id,
            ended_at: null,
        };
        return (await this.getRidingTimeVotes({ where }))[0]
    }


    /***********************************************************************************************
    * STATUS
    ***********************************************************************************************/
    get paused() {
        if (!this.#pauses || this.#pauses.length === 0) return false;
        const last = this.#pauses[this.#pauses.length - 1];
        return !last.resumed_at;
    }


    async pause() {
        if (!this.started) throw new Error('Round has not started');
        if (this.ended)    throw new Error('Round has already ended');

        await this.getPauses();
        if (this.paused) throw new Error('Round is already paused');

        const roundPause = new RoundPause({round_id: this.id, paused_at: new Date()});
        await roundPause.save();

        this.clearCachedAssociation('pauses');
        this.#pauses = null;
    }


    async resume() {
        await this.getPauses();
        if (!this.paused) throw new Error('Round is not paused');

        const openPause = this.#pauses.find(p => !p.resumed_at);
        openPause.resumed_at = new Date();
        await openPause.save();

        this.clearCachedAssociation('pauses');
        this.#pauses = null;
    }


    async end({submission, submitter}={}) {
        const where = {ended_at: null};
        const ridingTimeVotes = await this.getRidingTimeVotes({ where });
        for (const vote of ridingTimeVotes) {
            await vote.end();
        }

        await this.getPauses();
        if (this.paused) await this.resume();

        const match = await this.getMatch();
        if (submission) {
            const competitor   = await match.competitorForColor(submitter);
            this.submission    = submission;
            this.submission_by = competitor?.id;
        }

        this.ended_at = new Date();
        await this.save();

        const allRounds = await match.getRounds();
        if (allRounds.length == match.maxRounds) {
            await match.end();
        } else {
            const winner = await match.getWinner();
            if (winner) await match.end()
        }
    }


    /***********************************************************************************************
    * RESULTS
    ***********************************************************************************************/
    async getWinner() {
        await this.#collectResultsData();
        return this.#winner;
    }


    async getRedScore() {
        await this.#collectResultsData();
        return this.#redScore;
    }


    async getBlueScore() {
        await this.#collectResultsData();
        return this.#blueScore;
    }


    async getWinMethod() {
        await this.#collectResultsData();
        return this.#winMethod;
    }


    async #collectResultsData() {
        if (this.#redScore !== undefined) return;

        const match          = await this.getMatch();
        const red            = await match.getRedCompetitor();
        const blue           = await match.getBlueCompetitor();
        const judges         = await match.getJudges();

        const { redScore, blueScore } = await this.#getScore(red, blue, judges);
        const { winner, method }      = this.#determineWinner(red, blue, redScore, blueScore);

        this.#redScore  = redScore;
        this.#blueScore = blueScore;
        this.#winner    = winner;
        this.#winMethod = method;
    }


    async #getScore(red, blue, judges) {
        const votes  = await this.getRidingTimeVotes();
        const pauses = await this.getPauses();
        return this.rules.scoreRound(red, blue, judges, votes, pauses);
    }


    #determineWinner(red, blue, redScore, blueScore) {
        return this.rules.determineWinner(red, blue, redScore, blueScore, this);
    }


    /***********************************************************************************************
    * API
    ***********************************************************************************************/
    async toApiResponse() {
        const match       = await this.getMatch();
        const redScore    = await this.getRedScore();
        const blueScore   = await this.getBlueScore();
        const winner      = await this.getWinner();
        const method      = await this.getWinMethod();
        const maxDuration = await this.getMaxDuration();

        const score = {
            [match.red_competitor_id]:  redScore,
            [match.blue_competitor_id]: blueScore,
        }

        const result = { winner, method };

        const response = {
            id:           this.id,
            started_at:   this.started_at,
            ended_at:     this.ended_at,
            max_duration: maxDuration,
            paused:       this.paused,
            score,
            result,
        }

        return response;
    }


    /***********************************************************************************************
    * PROPERTIES
    ***********************************************************************************************/
    get started_at() { return this.created_at }
    get started()    { return Boolean(this.started_at) }
    get ended()      { return Boolean(this.ended_at) }
    get rules()      { return RDojoKombatRules }


    async getIndex() {
        if (this.#index !== undefined) return this.#index;
        
        const match    = await this.getMatch();
        const rounds   = await match.getRounds();
        const roundIds = rounds.map(r => r.id);

        this.#index    = roundIds.indexOf(this.id);
        return this.#index;
    }


    async getMaxDuration() {
        const idx = await this.getIndex();
        return this.rules.roundDurations[idx] || 0;
    }
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
