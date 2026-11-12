import type { Logger } from 'pino';

const { loadConfigOrExit } = require('../src/config');

const pino      = require('pino');
const CONSTANTS = require('./constants');

const procName = loadConfigOrExit().PROC_NAME;
const logger: Logger = pino({
    level: CONSTANTS.LOG_LEVEL,
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            ignore: 'pid,hostname,responseTime',
            translateTime: `SYS:yyyy-mm-dd HH:MM:ss]["${procName}"`,
            messageFormat: '{msg}',
        }
    },
});


module.exports = { logger };
