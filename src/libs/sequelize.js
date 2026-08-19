const {Sequelize} = require('sequelize');
const {config} = require('../config/config');
const setupModels = require('../db/models');

let sequelizeUri;
let sslConfig = false;

const isProduction = config.isProd || process.env.NODE_ENV === 'production';

if (isProduction) {
    if (!config.databaseUrl) {
        throw new Error('DATABASE_URL es requerida en producción');
    }
    sequelizeUri = config.databaseUrl;
    dialectOptions = {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    };
} else {
    const USER = encodeURIComponent(config.dbUser);
    const PASSWORD = encodeURIComponent(config.dbPassword);
    sequelizeUri = `postgresql://${USER}:${PASSWORD}@${config.dbHost}:${config.dbPort}/${config.dbName}`;
}

const sequelize = new Sequelize(sequelizeUri, {
    dialect: 'postgres',
    logging: config.isProd ? false : console.log,
    dialectOptions: sslConfig ? {ssl: sslConfig} : {},
    pool: {
        max: config.isProd ? 3 : 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
    },
    define: {
        timestamps: true,
        underscored: true,
        underscoredAll: true,
    },
});

setupModels(sequelize);
module.exports = sequelize;