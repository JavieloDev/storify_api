require('dotenv').config();
const { config } = require('../config/config');

const useNeon = !!config.databaseUrl;

module.exports = {
    development: useNeon
        ? {
            use_env_variable: 'DATABASE_URL',
            dialect: 'postgres',
            logging: console.log,
            dialectOptions: {
                ssl: { require: true, rejectUnauthorized: false },
            },
        }
        : {
            username: config.dbUser,
            password: config.dbPassword,
            database: config.dbName,
            host: config.dbHost,
            port: config.dbPort,
            dialect: 'postgres',
            logging: console.log,
        },
    production: {
        use_env_variable: 'DATABASE_URL',
        dialect: 'postgres',
        logging: false,
        dialectOptions: {
            ssl: { require: true, rejectUnauthorized: false },
        },
    },
    test: {
        username: config.dbUser,
        password: config.dbPassword,
        database: config.dbName,
        host: config.dbHost,
        port: config.dbPort,
        dialect: 'postgres',
        logging: false,
    },
};