const   CONSTANTS = require('../constants');
const { EVENTS }  = require('../server/workerWebSocket');
const { logger }  = require('../logger');
const { Round }   = require('../../models/round');
const { Worker }  = require('./worker');


class TechFallTrackerWorker extends Worker {
    async performJob() {
        await this.forEachRound(this.checkTechFallStatus.bind(this));
    }


    async checkTechFallStatus(round) {
        logger.debug(`Checking round ${round.id} for tech fall`);
        await this.logStatus(round);

        const hasReachedTechFallThreshold = await round.hasReachedTechFallThreshold();
        if (!hasReachedTechFallThreshold) return;

        await round.end();

        const match     = await round.getMatch();
        const rounds    = await match.getRounds();
        const response  = await match.toApiResponse();
        response.rounds = [];
        for (const aRound of rounds) {
            response.rounds.push(await round.toApiResponse());
        }
        this.notifyServer(EVENTS.TECH_FALL, response);
    }


    async forEachRound(fnc) {
        const rounds = await this.getOpenRounds();
        logger.debug(`Checking ${rounds.length} round(s) for tech fall`);
        await Promise.all(rounds.map(round => fnc(round)));
    }


    async getOpenRounds() {
        return await Round.getOpenRounds();
    }


    async logStatus(round) {
        if (CONSTANTS.LOG_LEVEL == 'debug') {
            const redScore    = await round.getRedScore();
            const blueScore   = await round.getBlueScore();
            const roundNumber = await round.getRoundNumber();
            const threshold   = round.rules.techFallThreshold(roundNumber);
            logger.debug(`Round ${round.id} tech fall status: Red: ${redScore} Blue: ${blueScore} Threshold: ${threshold}`);
        }
    }
}


module.exports = {
    TechFallTrackerWorker 
}
