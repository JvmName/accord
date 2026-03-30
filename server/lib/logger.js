const pino      = require('pino');
const CONSTANTS = require('./constants');

const procName = process.env.PROC_NAME || "SERVER";
const logger = pino({
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
