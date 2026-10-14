/**
 * Broadcasts `match.update` for every match with an open round or a running
 * break, about once a second, and once more, immediately, when a match leaves
 * that set (it just ended), so judges see the ended state without waiting.
 */
import type { Logger } from 'pino';
import { findMatchGraphsByIds, findMatchesInBreak, type MatchGraph } from '../db/repositories/matches';
import { findOpenRounds } from '../db/repositories/rounds';
import { serializeLeakedMatch, type MatchRenderOptions } from '../serialize';
import { EVENTS } from '../ws/workerWebSocket';
import { MATCH_UPDATE_TICK_MS, Worker } from './worker';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger }: { logger: Logger } = require('../../lib/logger');

/** Minimum time between two regular broadcasts of the same match set. */
export const BROADCAST_INTERVAL_MS = 1000;

const RENDER_OPTIONS: MatchRenderOptions = { includeMat: true, includeMatchJudges: true, includeRounds: true };

export class MatchUpdateWorker extends Worker {
    #previousMatchIds = new Set<string>();
    #lastBroadcastTime = 0;

    get requeueInterval(): number { return MATCH_UPDATE_TICK_MS; }

    async performJob(): Promise<void> {
        const [rounds, breakMatches] = await Promise.all([
            findOpenRounds(this.db),
            findMatchesInBreak(this.db),
        ]);

        const currentMatchIds = new Set([
            ...rounds.map(r => r.match_id),
            ...breakMatches.map(m => m.id),
        ]);

        const now = Date.now();
        if (now - this.#lastBroadcastTime >= BROADCAST_INTERVAL_MS) {
            logger.debug(`Broadcasting match updates for ${rounds.length} open round(s): [${rounds.map(r => r.match_id).join(', ')}]`);
            logger.debug(`Broadcasting match updates for ${breakMatches.length} match(es) in break`);
            const graphs = await findMatchGraphsByIds(this.db, [...currentMatchIds]);
            // One broadcast per open round, then one per match in a break.
            for (const round of rounds)       this.#broadcast(graphs.get(round.match_id));
            for (const match of breakMatches) this.#broadcast(graphs.get(match.id));
            this.#lastBroadcastTime = now;
        }

        const justEndedIds = [...this.#previousMatchIds].filter(id => !currentMatchIds.has(id));
        if (justEndedIds.length) {
            const graphs = await findMatchGraphsByIds(this.db, justEndedIds);
            for (const id of justEndedIds) {
                const graph = graphs.get(id);
                if (graph) this.#broadcast(graph);
            }
        }

        this.#previousMatchIds = currentMatchIds;
    }

    #broadcast(graph: MatchGraph): void {
        this.notifyServer(EVENTS.MATCH_UPDATE, serializeLeakedMatch(graph, RENDER_OPTIONS));
    }
}
