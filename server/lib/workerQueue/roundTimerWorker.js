const   CONSTANTS = require('../constants');
const { EVENTS }  = require('../server/workerWebSocket');
const { logger }  = require('../logger');
const { Round }   = require('../../models/round');
const { Worker }  = require('./worker');


class RoundTimerWorker extends Worker {
    async performJob() {
        const rounds = await Round.getOpenRounds();
        logger.debug(`Checking ${rounds.length} round(s) for timer expiry`);
        await Promise.all(rounds.map(round => this.checkRoundTimer(round)));
    }


    async checkRoundTimer(round) {
        const checker = new RoundTimerChecker(round, this);
        await checker.check();
    }
}


class RoundTimerChecker {
    #round;
    #match;
    #worker;

    constructor(round, worker) {
        this.#round  = round;
        this.#worker = worker;
    }


    async check() {
        this.#match = await this.#round.getMatch();

        const timeRemaining = await this.#computeTimeRemaining();
        logger.debug(`Round ${this.#roundLabel} timer: remaining=${timeRemaining}s`);

        if (timeRemaining !== 0) return;

        logger.info(`Round timer expired: ending round ${this.#roundLabel}`);
        await this.#match.endRound();
        await this.#notifyServer();
    }


    async #computeTimeRemaining() {
        const maxDuration = await this.#round.getMaxDuration();
        const pauses      = await this.#round.getPauses();
        const currentPause = pauses.slice().reverse().find(p => p.isOpen) || null;

        const ref = currentPause ? new Date(currentPause.paused_at) : new Date();
        let pausedMs = 0;
        for (const p of pauses) {
            if (p.resumed_at) pausedMs += new Date(p.resumed_at) - new Date(p.paused_at);
        }

        return Math.max(0, maxDuration - Math.floor((ref - new Date(this.#round.started_at) - pausedMs) / 1000));
    }


    async #notifyServer() {
        const rounds   = await this.#match.getRounds();
        const response = await this.#match.toApiResponse({includeRounds: true});
        response.rounds = [];
        for (const r of rounds) {
            response.rounds.push(await r.toApiResponse());
        }
        this.#worker.notifyServer(EVENTS.MATCH_UPDATE, response);
    }


    get #roundLabel() {
        return `${this.#match?.id}.${this.#round.id}`;
    }
}


module.exports = {
    RoundTimerWorker
}
