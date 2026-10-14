/**
 * Ends any open round whose clock has run out (elapsed time minus pauses has
 * reached the round's duration), then emits `match.update`.
 */
import type { Logger } from 'pino';
import { findMatchGraph, findMatchGraphsByIds, type MatchGraph } from '../db/repositories/matches';
import { findOpenRounds } from '../db/repositories/rounds';
import type { Round } from '../db/types';
import { roundMaxDuration, roundTimeRemaining, serializeLeakedMatch } from '../serialize';
import { endRound } from '../services/matchLifecycle';
import { EVENTS } from '../ws/workerWebSocket';
import { Worker } from './worker';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger }: { logger: Logger } = require('../../lib/logger');

export class RoundTimerWorker extends Worker {
    async performJob(): Promise<void> {
        const rounds = await findOpenRounds(this.db);
        logger.debug(`Checking ${rounds.length} round(s) for timer expiry`);
        const graphs = await findMatchGraphsByIds(this.db, rounds.map(r => r.match_id));
        await Promise.all(rounds.map(round => this.checkRoundTimer(round, graphs.get(round.match_id))));
    }

    async checkRoundTimer(round: Round, graph: MatchGraph | undefined): Promise<void> {
        const label = `${graph?.id}.${round.id}`;

        const timeRemaining = this.#timeRemaining(round, graph);
        logger.debug(`Round ${label} timer: remaining=${timeRemaining}s`);

        if (timeRemaining !== 0) return;

        logger.info(`Round timer expired: ending round ${label}`);
        await endRound(this.db, graph.id);

        // Rounds only: no mat and no judges in this payload.
        const ended = await findMatchGraph(this.db, graph.id);
        this.notifyServer(EVENTS.MATCH_UPDATE, serializeLeakedMatch(ended, { includeRounds: true }));
    }

    #timeRemaining(round: Round, graph: MatchGraph | undefined): number | null {
        const loaded = graph.rounds.find(r => r.id == round.id);
        return roundTimeRemaining(loaded, roundMaxDuration(graph, round), new Date());
    }
}
