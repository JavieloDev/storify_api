const {Pool} = require('pg');

const {config} = require('../config/config');

const USER = encodeURIComponent(config.dbUser);
const PASSWORD = encodeURIComponent(config.dbPassword);
const URI = `postgres://${USER}:${PASSWORD}@${config.dbHost}:${config.dbPort}/${config.dbName}`

const options = {
    connectionString: URI
}

if (config.isProd) {
    options.ssl = {
        rejectUnauthorized: false
    };
}

const pool = new Pool(options);

module.exports = pool;