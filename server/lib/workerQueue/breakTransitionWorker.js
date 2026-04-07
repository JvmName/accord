const { EVENTS }  = require('../server/workerWebSocket');
const { logger }  = require('../logger');
const { Match }   = require('../../models/match');
const { Worker }  = require('./worker');

const RENDER_OPTIONS = { includeMat: true, includeMatchJudges: true, includeRounds: true };


class BreakTransitionWorker extends Worker {
    async performJob() {
        const Op      = Match.Operators;
        const matches = await Match.where({ break_started_at: { [Op.ne]: null }, ended_at: null });
        logger.debug(`Checking ${matches.length} match(es) for break expiry`);
        await Promise.all(matches.map(match => this.#checkBreakExpiry(match)));
    }


    async #checkBreakExpiry(match) {
        const elapsed = Math.floor((Date.now() - new Date(match.break_started_at).getTime()) / 1000);
        if (elapsed < match.break_duration) return;

        logger.info(`Break expired for match=${match.id}, starting next round`);

        match.break_started_at = null;
        match.break_duration   = null;
        await match.save();

        await match.startRound();

        const freshMatch = await Match.find(match.id);
        const response   = await freshMatch.toApiResponse(RENDER_OPTIONS);
        this.notifyServer(EVENTS.BREAK_ENDED, response);
    }
}


module.exports = {
    BreakTransitionWorker
}
