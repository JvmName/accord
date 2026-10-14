/**
 * Ends any open round in which a competitor has reached the tech-fall score
 * for that round number, then emits `round.tech-fall` once.
 */
import type { Logger } from 'pino';
import { findMatchGraph, findMatchGraphsByIds, type MatchGraph } from '../db/repositories/matches';
import { findOpenRounds } from '../db/repositories/rounds';
import type { Round } from '../db/types';
import type { Rules } from '../domain/types';
import { roundOutcome, serializeLeakedMatch } from '../serialize';
import { endRound } from '../services/matchLifecycle';
import { EVENTS } from '../ws/workerWebSocket';
import { Worker } from './worker';

/* eslint-disable @typescript-eslint/no-require-imports */
const CONSTANTS                                         = require('../../lib/constants');
const { logger }: { logger: Logger }                    = require('../../lib/logger');
const { RDojoKombatRules }: { RDojoKombatRules: Rules } = require('../domain/rules');
/* eslint-enable @typescript-eslint/no-require-imports */

const rules = RDojoKombatRules;

/** The round's 1-based position among its match's rounds (0 when absent). */
function roundNumber(graph: MatchGraph, round: Pick<Round, 'id'>): number {
    return graph.rounds.findIndex(r => r.id == round.id) + 1;
}

/** Blue is checked first, then red, against the threshold for the round number. */
export function hasReachedTechFallThreshold(graph: MatchGraph, round: Pick<Round, 'id'>, now: Date = new Date()): boolean {
    const threshold = rules.techFallThreshold(roundNumber(graph, round));
    const { redScore, blueScore } = roundOutcome(graph, graph.rounds.find(r => r.id == round.id), now);
    if (blueScore >= threshold) return true;
    return redScore >= threshold;
}

export class TechFallTrackerWorker extends Worker {
    async performJob(): Promise<void> {
        const rounds = await findOpenRounds(this.db);
        logger.debug(`Checking ${rounds.length} round(s) for tech fall`);
        const graphs = await findMatchGraphsByIds(this.db, rounds.map(r => r.match_id));
        await Promise.all(rounds.map(round => this.checkTechFallStatus(round, graphs.get(round.match_id))));
    }

    async checkTechFallStatus(round: Round, graph: MatchGraph): Promise<void> {
        const label = `${graph.id}.${round.id}`;

        logger.debug(`Checking round ${label} for tech fall`);
        if (CONSTANTS.LOG_LEVEL == 'debug') {
            const { redScore, blueScore } = roundOutcome(graph, graph.rounds.find(r => r.id == round.id), new Date());
            const threshold = rules.techFallThreshold(roundNumber(graph, round));
            logger.debug(`Round ${label} tech fall status: Red: ${redScore} Blue: ${blueScore} Threshold: ${threshold}`);
        }

        if (!hasReachedTechFallThreshold(graph, round)) return;

        logger.info(`Tech fall threshold reached: ending round ${label}`);
        await endRound(this.db, graph.id);

        // Rounds only: no mat and no judges in this payload.
        const ended = await findMatchGraph(this.db, graph.id);
        this.notifyServer(EVENTS.TECH_FALL, serializeLeakedMatch(ended, { includeRounds: true }));
    }
}
