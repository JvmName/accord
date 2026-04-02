const ENV       = process.env.NODE_ENV || 'development';
const DEV       = ENV == 'development';
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();


module.exports = {
    DEV,
    ENV,
    LOG_LEVEL 
};
