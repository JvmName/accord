import type { Logger } from 'pino';

const { loadConfigOrExit } = require('../src/config');

const pino      = require('pino');
const CONSTANTS = require('./constants');

const procName = loadConfigOrExit().PROC_NAME;

// pino-pretty runs in a worker thread, which `bun test --isolate` kills at the
// end of each test file, so the test run logs plain JSON instead.
const transport = CONSTANTS.ENV == 'test' ? undefined : {
    target: 'pino-pretty',
    options: {
        colorize: true,
        ignore: 'pid,hostname,responseTime',
        translateTime: `SYS:yyyy-mm-dd HH:MM:ss]["${procName}"`,
        messageFormat: '{msg}',
    },
};
const logger: Logger = pino({ level: CONSTANTS.LOG_LEVEL, transport });


module.exports = { logger };
