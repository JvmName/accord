const { logger } = require('../logger');
const { Round }  = require('../../models/round');
const { EVENTS } = require('../server/workerWebSocket');
const { Worker } = require('./worker');

const RENDER_OPTIONS = { includeMat: true, includeMatchJudges: true, includeRounds: true };

class MatchUpdateWorker extends Worker {
    async performJob() {
        const rounds = await Round.getOpenRounds();
        logger.debug(`Broadcasting match updates for ${rounds.length} open round(s)`);
        await Promise.all(rounds.map(round => this.#broadcastMatchUpdate(round)));
    }

    async #broadcastMatchUpdate(round) {
        const match    = await round.getMatch();
        const response = await match.toApiResponse(RENDER_OPTIONS);
        this.notifyServer(EVENTS.MATCH_UPDATE, response);
    }
}

module.exports = { MatchUpdateWorker };
