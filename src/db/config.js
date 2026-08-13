const { config } = require('../config/config');

// ✅ Configuración para desarrollo (local) - COMENTADA
// const LOCAL_USER = encodeURIComponent(config.dbUser);
// const LOCAL_PASSWORD = encodeURIComponent(config.dbPassword);
// const LOCAL_URI = `postgres://${LOCAL_USER}:${LOCAL_PASSWORD}@${config.dbHost}:${config.dbPort}/${config.dbName}`;

// ✅ Configuración para producción (Neon) - ACTIVA
const NEON_URI = 'postgresql://neondb_owner:npg_8tJjpHcY3ydh@ep-lingering-morning-ax1l8evk-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// ✅ Obtener el entorno actual
const environment = process.env.NODE_ENV || 'production';

// ✅ Configuraciones disponibles (solo producción activa)
const configs = {
    // development: {
    //     url: LOCAL_URI,
    //     dialect: 'postgres',
    //     logging: console.log,
    // },
    production: {
        url: NEON_URI,
        dialect: 'postgres',
        logging: false,
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        }
    }
};

// ✅ Exportar SOLO la configuración de producción
module.exports = configs.production;