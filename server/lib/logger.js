const pino = require('pino');
const logger = pino({
    transport: {
        level: process.env.LOG_LEVEL ? 'debug' : 'info',
        target: 'pino-pretty',
        options: {
            colorize: true,
            ignore: 'pid,hostname,responseTime',
            translateTime: 'SYS:standard',
            messageFormat: '{msg}',
        }
    },
});


module.exports = { logger };
