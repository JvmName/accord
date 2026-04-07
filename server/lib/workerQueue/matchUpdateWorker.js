const { logger } = require('../logger');
const { Match }  = require('../../models/match');
const { Round }  = require('../../models/round');
const { EVENTS } = require('../server/workerWebSocket');
const { Worker } = require('./worker');

const RENDER_OPTIONS = { includeMat: true, includeMatchJudges: true, includeRounds: true };

class MatchUpdateWorker extends Worker {
    async performJob() {
        const rounds = await Round.getOpenRounds();
        logger.debug(`Broadcasting match updates for ${rounds.length} open round(s): [${rounds.map(r => r.match_id).join(', ')}]`);
        await Promise.all(rounds.map(round => this.#broadcastMatchUpdate(round)));

        const Op             = Match.Operators;
        const breakMatches   = await Match.where({ break_started_at: { [Op.ne]: null }, ended_at: null });
        logger.debug(`Broadcasting match updates for ${breakMatches.length} match(es) in break`);
        await Promise.all(breakMatches.map(match => this.#broadcastBreakMatchUpdate(match)));
    }

    async #broadcastMatchUpdate(round) {
        const match    = await round.getMatch();
        const response = await match.toApiResponse(RENDER_OPTIONS);
        this.notifyServer(EVENTS.MATCH_UPDATE, response);
    }

    async #broadcastBreakMatchUpdate(match) {
        const response = await match.toApiResponse(RENDER_OPTIONS);
        this.notifyServer(EVENTS.MATCH_UPDATE, response);
    }
}

module.exports = { MatchUpdateWorker };
