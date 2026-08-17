require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const config = {
    isProd,
    dbUser: process.env.DB_USER,
    dbPassword: process.env.DB_PASSWORD,
    dbHost: process.env.DB_HOST,
    dbPort: process.env.DB_PORT || 5432,
    dbName: process.env.DB_NAME,
    databaseUrl: process.env.DATABASE_URL,
};

module.exports = { config };