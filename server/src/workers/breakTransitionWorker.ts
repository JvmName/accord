/**
 * Starts the next round when a match's break has run its full duration, then
 * emits `break.ended` with the match as it is after the new round opened.
 */
import { present } from '../domain/present';
import type { Logger } from 'pino';
import { findMatchGraph, findMatchesInBreak, updateMatch } from '../db/repositories/matches';
import type { Match } from '../db/types';
import { serializeMatch, type MatchRenderOptions } from '../serialize';
import { startRound } from '../services/matchLifecycle';
import { EVENTS } from '../ws/workerWebSocket';
import { Worker } from './worker';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger }: { logger: Logger } = require('../../lib/logger');

const RENDER_OPTIONS: MatchRenderOptions = { includeMat: true, includeMatchJudges: true, includeRounds: true };

export class BreakTransitionWorker extends Worker {
    async performJob(): Promise<void> {
        // Ended matches are excluded here, which is what keeps a stale break
        // on an ended match from starting a fourth round.
        const matches = await findMatchesInBreak(this.db);
        logger.debug(`Checking ${matches.length} match(es) for break expiry`);
        await Promise.all(matches.map(match => this.#checkBreakExpiry(match)));
    }

    async #checkBreakExpiry(match: Match): Promise<void> {
        const elapsed = Math.floor((Date.now() - new Date(present(match.break_started_at, 'the break start')).getTime()) / 1000);
        // A break without a duration counts as already over, as it always has.
        if (elapsed < (match.break_duration ?? 0)) return;

        logger.info(`Break expired for match=${match.id}, starting next round`);

        await updateMatch(this.db, match.id, { break_started_at: null, break_duration: null });
        await startRound(this.db, match.id);

        const fresh = await findMatchGraph(this.db, match.id);
        this.notifyServer(EVENTS.BREAK_ENDED, serializeMatch(present(fresh, 'the match'), RENDER_OPTIONS));
    }
}
