#!/usr/bin/env bun
import { loadConfigOrExit } from '../src/config';
import { BreakTransitionWorker, HeartbeatWorker, MatchUpdateWorker, RoundTimerWorker, TechFallTrackerWorker } from '../src/workers';

const { logger } = require('../lib/logger');

// `WORKER_TOKEN` is how the web process hands the token over; a positional argument still works.
const config      = loadConfigOrExit();
const workerToken = config.WORKER_TOKEN ?? process.argv[2];
if (workerToken) {
    new TechFallTrackerWorker(workerToken).start();
    new MatchUpdateWorker(workerToken).start();
    new BreakTransitionWorker(workerToken).start();
    new RoundTimerWorker(workerToken).start();
    if (config.HEARTBEAT_URL) new HeartbeatWorker(workerToken, config.HEARTBEAT_URL).start();
} else {
    logger.error('Missing worker token. Set WORKER_TOKEN or pass it as the first argument. Unable to start worker');
    process.exit(1);
}
