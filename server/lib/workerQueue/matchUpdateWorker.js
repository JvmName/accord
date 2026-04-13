const { logger } = require('../logger');
const { Match }  = require('../../models/match');
const { Round }  = require('../../models/round');
const { EVENTS } = require('../server/workerWebSocket');
const { Worker } = require('./worker');

const RENDER_OPTIONS = { includeMat: true, includeMatchJudges: true, includeRounds: true };

class MatchUpdateWorker extends Worker {
    #previousMatchIds = new Set();
    #lastBroadcastTime = 0;

    get requeueInterval() { return 250; }

    async performJob() {
        const Op = Match.Operators;
        const [rounds, breakMatches] = await Promise.all([
            Round.getOpenRounds(),
            Match.where({ break_started_at: { [Op.ne]: null }, ended_at: null }),
        ]);

        const currentMatchIds = new Set([
            ...rounds.map(r => r.match_id),
            ...breakMatches.map(m => m.id),
        ]);

        // Regular broadcasts throttled to ~1s
        const now = Date.now();
        if (now - this.#lastBroadcastTime >= 1000) {
            logger.debug(`Broadcasting match updates for ${rounds.length} open round(s): [${rounds.map(r => r.match_id).join(', ')}]`);
            logger.debug(`Broadcasting match updates for ${breakMatches.length} match(es) in break`);
            await Promise.all(rounds.map(round => this.#broadcastMatchUpdate(round)));
            await Promise.all(breakMatches.map(match => this.#broadcastBreakMatchUpdate(match)));
            this.#lastBroadcastTime = now;
        }

        // Final update fires immediately whenever a match exits the active set
        const justEndedIds = [...this.#previousMatchIds].filter(id => !currentMatchIds.has(id));
        await Promise.all(justEndedIds.map(id => this.#broadcastFinalUpdate(id)));

        this.#previousMatchIds = currentMatchIds;
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

    async #broadcastFinalUpdate(matchId) {
        const match = await Match.find(matchId);
        if (!match) return;
        const response = await match.toApiResponse(RENDER_OPTIONS);
        this.notifyServer(EVENTS.MATCH_UPDATE, response);
    }
}

module.exports = { MatchUpdateWorker };
