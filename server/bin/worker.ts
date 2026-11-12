#!/usr/bin/env bun
import { loadConfigOrExit } from '../src/config';
import { BreakTransitionWorker, MatchUpdateWorker, RoundTimerWorker, TechFallTrackerWorker } from '../src/workers';

const { logger } = require('../lib/logger');

// `WORKER_TOKEN` is how the web process hands the token over; a positional argument still works.
const workerToken = loadConfigOrExit().WORKER_TOKEN ?? process.argv[2];
if (workerToken) {
    new TechFallTrackerWorker(workerToken).start();
    new MatchUpdateWorker(workerToken).start();
    new BreakTransitionWorker(workerToken).start();
    new RoundTimerWorker(workerToken).start();
} else {
    logger.error('Missing worker token. Set WORKER_TOKEN or pass it as the first argument. Unable to start worker');
    process.exit(1);
}
