const pino = require('pino');

const procName = process.env.PROC_NAME || "SERVER";
const logger = pino({
    transport: {
        level: process.env.LOG_LEVEL ? 'debug' : 'info',
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
