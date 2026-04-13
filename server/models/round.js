const { BaseRecord }          = require('../lib/activeRecord');
const { logger }              = require('../lib/logger');
const { RidingTimeVote }      = require('./ridingTimeVote');
const { RoundPause }          = require('./roundPause');
const { RDojoKombatRules }    = require('../lib/rules');
const { User }                = require('./user');


class Round extends BaseRecord {
    #blueScore;
    #index;
    #redScore;
    #winMethod;
    #winner;


    static async getOpenRounds() {
        const rounds = await this.where({ended_at: null});
        return rounds;
    }


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
        const pauses = await this.getCachedAssociation('pauses',
                                                        RoundPause,
                                                        {round_id: this.id},
                                                        queryOptions);
        this._cachedPauses = pauses;
        return pauses;
    }


    async getCurrentPause() {
        const pauses = await this.getPauses();
        return pauses.slice().reverse().find(p => p.isOpen) || null;
    }


    async isPaused() {
        return !!(await this.getCurrentPause());
    }


    get paused() {
        const pauses = this._cachedPauses;
        if (!pauses?.length) return false;
        return !!pauses.slice().reverse().find(p => p.isOpen);
    }


    async getRoundNumber() {
        const match  = await this.getMatch();
        const rounds = await match.getRounds();
        return rounds.findIndex(round => round.id == this.id) + 1;
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
    async pause() {
        if (!this.started) throw new Error('Round has not started');
        if (this.ended)    throw new Error('Round has already ended');
        if (await this.isPaused()) throw new Error('Round is already paused');

        const roundPause = new RoundPause({round_id: this.id, paused_at: new Date()});
        await roundPause.save();

        this.clearCachedAssociation('pauses');
    }


    async resume() {
        const openPause = await this.getCurrentPause();
        if (!openPause) throw new Error('Round is not paused');

        openPause.resumed_at = new Date();
        await openPause.save();
    }


    async end({submission, submitter, stoppage, stopper}={}) {
        const where = {ended_at: null};
        const ridingTimeVotes = await this.getRidingTimeVotes({ where });
        for (const vote of ridingTimeVotes) {
            await vote.end();
        }

        if (await this.isPaused()) await this.resume();

        const match = await this.getMatch();
        if (submission) {
            const competitor   = await match.competitorForColor(submitter);
            this.submission    = submission;
            this.submission_by = competitor?.id;
        } else if (stoppage) {
            const competitor   = await match.competitorForColor(stopper);
            this.stoppage_by   = competitor?.id;
        }

        this.ended_at = new Date();
        await this.save();

        const redScore  = await this.getRedScore();
        const blueScore = await this.getBlueScore();
        const sub       = submission ? ` submission=${submission} by=${submitter}` : '';
        const stop      = stoppage   ? ` stoppage by=${stopper}` : '';
        logger.info(`Round ended: match=${this.match_id} round=${this.id} red=${redScore} blue=${blueScore}${sub}${stop}`);

        const allRounds = await match.getRounds();
        logger.info(`Round transition: match=${this.match_id} completedRounds=${allRounds.length} maxRounds=${match.maxRounds}`);

        if (allRounds.length == match.maxRounds) {
            logger.info(`Match ending: match=${this.match_id} reason=max-rounds-reached`);
            await match.end();
        } else {
            const breakDuration = match.rules.getBreakDuration(allRounds.length);
            logger.info(`Break check: match=${this.match_id} breakDuration=${breakDuration}`);
            if (breakDuration > 0) {
                match.break_started_at = new Date();
                match.break_duration   = breakDuration;
                await match.save();
                match.clearCachedAssociation('rounds');
                logger.info(`Break started: match=${this.match_id} duration=${breakDuration}s`);
            }
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


    async hasReachedTechFallThreshold() {
        const roundNumber = await this.getRoundNumber();
        const threshold   = this.rules.techFallThreshold(roundNumber);

        const blueScore   = await this.getBlueScore();
        if (blueScore >= threshold) return true;

        const redScore    = await this.getRedScore();
        return redScore >= threshold;
    }


    async #collectResultsData() {
        if (this.#redScore !== undefined) return;

        const match       = await this.getMatch();
        const red         = await match.getRedCompetitor();
        const blue        = await match.getBlueCompetitor();
        const judges      = await match.getJudges();
        const roundNumber = await this.getRoundNumber();

        const { redScore, blueScore } = await this.#getScore(red, blue, judges);
        const { winner, method }      = this.#determineWinner(red, blue, redScore, blueScore, roundNumber);

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


    #determineWinner(red, blue, redScore, blueScore, roundNumber) {
        return this.rules.determineWinner(red, blue, redScore, blueScore, roundNumber, this);
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
        const pauses      = await this.getPauses();
        const currentPause = pauses.slice().reverse().find(p => p.isOpen) || null;

        let timeRemaining = null;
        if (!this.ended_at) {
            const ref = currentPause ? new Date(currentPause.paused_at) : new Date();
            let pausedMs = 0;
            for (const p of pauses) {
                if (p.resumed_at) pausedMs += new Date(p.resumed_at) - new Date(p.paused_at);
            }
            timeRemaining = Math.max(0, maxDuration - Math.floor((ref - new Date(this.started_at) - pausedMs) / 1000));
        }

        const score = {
            [match.red_competitor_id]:  redScore,
            [match.blue_competitor_id]: blueScore,
        }

        const result = { winner, method };

        const response = {
            id:             this.id,
            started_at:     this.started_at,
            ended_at:       this.ended_at,
            max_duration:   maxDuration,
            paused:         !!currentPause,
            time_remaining: timeRemaining,
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
