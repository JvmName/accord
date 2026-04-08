const   CONSTANTS = require('../constants');
const { EVENTS }  = require('../server/workerWebSocket');
const { logger }  = require('../logger');
const { Round }   = require('../../models/round');
const { Worker }  = require('./worker');


class TechFallTrackerWorker extends Worker {
    #currentRound;
    #currentMatch;


    async performJob() {
        await this.forEachRound(this.checkTechFallStatus.bind(this));
    }


    async checkTechFallStatus(round) {
        const checker = new TechFallRoundChecker(round, this);
        await checker.check();

    }


    async forEachRound(fnc) {
        const rounds = await this.getOpenRounds();
        logger.debug(`Checking ${rounds.length} round(s) for tech fall`);
        await Promise.all(rounds.map(round => fnc(round)));
    }


    async getOpenRounds() {
        return await Round.getOpenRounds();
    }
}


class TechFallRoundChecker {
    #currentRound;
    #currentMatch;
    #worker;

    constructor(round, worker) {
        this.#currentRound = round;
        this.#worker       = worker;
    }


    async check() {
        this.#currentMatch = await this.#currentRound.getMatch();

        logger.debug(`Checking round ${this.currentRoundLabel} for tech fall`);
        await this.logStatus();

        const hasReachedTechFallThreshold = await this.#currentRound.hasReachedTechFallThreshold();
        if (!hasReachedTechFallThreshold) return;

        await this.endRound();
        await this.notifyServerOfRoundEnd()
    }


    async endRound() {
        logger.info(`Tech fall threshold reached: ending round ${this.currentRoundLabel}`);
        await this.#currentMatch.endRound();
    }


    async notifyServerOfRoundEnd() {
        const match     = await this.#currentMatch;
        const rounds    = await match.getRounds();
        const response  = await match.toApiResponse({includeRounds: true});
        response.rounds = [];
        for (const aRound of rounds) {
            response.rounds.push(await aRound.toApiResponse());
        }
        this.#worker.notifyServer(EVENTS.TECH_FALL, response);
    }


    async logStatus() {
        if (CONSTANTS.LOG_LEVEL == 'debug') {
            const redScore    = await this.#currentRound.getRedScore();
            const blueScore   = await this.#currentRound.getBlueScore();
            const roundNumber = await this.#currentRound.getRoundNumber();
            const threshold   = this.#currentRound.rules.techFallThreshold(roundNumber);
            logger.debug(`Round ${this.currentRoundLabel} tech fall status: Red: ${redScore} Blue: ${blueScore} Threshold: ${threshold}`);
        }
    }


    get currentRoundLabel() {
        return `${this.#currentMatch.id}.${this.#currentRound.id}`;
    }
}


module.exports = {
    TechFallTrackerWorker 
}
