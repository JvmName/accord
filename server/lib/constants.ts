const { loadConfigOrExit } = require('../src/config');

const { NODE_ENV: ENV, LOG_LEVEL } = loadConfigOrExit();
const DEV = ENV == 'development';


module.exports = {
    DEV,
    ENV,
    LOG_LEVEL 
} as const;
