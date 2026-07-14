const {Sequelize} = require('sequelize');
const {config} = require('../config/config');
const setupModels = require('../db/models');

const USER = encodeURIComponent(config.dbUser);
const PASSWORD = encodeURIComponent(config.dbPassword);
const URI = `postgresql://${USER}:${PASSWORD}@${config.dbHost}:${config.dbPort}/${config.dbName}`;

const sequelize = new Sequelize(URI, {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false, // Solo logs en desarrollo
    pool: {
        max: 5,           // Máximo de conexiones en el pool
        min: 0,           // Mínimo de conexiones en el pool
        acquire: 30000,   // Tiempo máximo en ms que el pool intentará conectar antes de lanzar error
        idle: 10000       // Tiempo máximo en ms que una conexión puede estar inactiva antes de ser liberada
    },
    dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
            require: true,
            rejectUnauthorized: false // Solo en desarrollo, en producción usar certificados válidos
        } : false
    },
    define: {
        timestamps: true,      // Agregar createdAt y updatedAt automáticamente
        underscored: true,     // Usar snake_case en lugar de camelCase
        underscoredAll: true
    },
    retry: {
        max: 3,                // Número de reintentos en caso de error
        match: [
            /SequelizeConnectionError/,
            /SequelizeConnectionRefusedError/,
            /SequelizeHostNotFoundError/,
            /SequelizeHostNotReachableError/,
            /SequelizeInvalidConnectionError/,
            /SequelizeConnectionTimedOutError/
        ]
    }
});

setupModels(sequelize);
module.exports = sequelize;