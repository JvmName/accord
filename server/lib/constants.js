const ENV = process.env.NODE_ENV || 'development';
const DEV = ENV == 'development';


module.exports = {
    DEV,
    ENV,
};
