const express = require('express');
const cors = require('cors');

const productsRoutes = require('./products.route');
const categoriesRouter = require('./category.route');
const subcategoriesRouter = require('./subcategories.route');
const businessRouter = require('./business.route');
const orderRouter = require('./order.route');
const salesReportRoute = require('./sales-report.route');
const deviceRouter = require('./device.route');
const salesPointRouter = require('./sales-point.route');
const syncRouter = require('./sync.route');
const employeeRouter = require('./employee.route');


function routerApi(app) {
    const router = express.Router();

    const allowedOrigins = [
        'https://tu-panel-web.vercel.app',
        'http://localhost:4200',
        'http://127.0.0.1:4200',
        'http://localhost:3000',
        'capacitor://localhost',
        'https://localhost',
        'http://localhost:8299/'
    ];

    app.use(cors({
        origin: function (origin, callback) {
            // Permite peticiones sin Origin, por ejemplo Postman/server-to-server
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(new Error(`Origen no permitido por CORS: ${origin}`));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'Accept',
            'Origin',
            'X-Requested-With'
        ],
    }));
    app.use((req, res, next) => {
        console.log('🌐 REQUEST');
        console.log('Origin:', req.headers.origin);
        console.log('Method:', req.method);
        console.log('URL:', req.originalUrl);

        next();
    });

    app.use('/api/v1', router);

    router.use('/product', productsRoutes);
    router.use('/categories', categoriesRouter);
    router.use('/subcategories', subcategoriesRouter);
    router.use('/business', businessRouter);
    router.use('/order', orderRouter);
    router.use('/sales-report', salesReportRoute);
    router.use('/devices', deviceRouter);
    router.use('/sales-points', salesPointRouter);
    router.use('/sync', syncRouter);
    router.use('/employees', employeeRouter);
}

module.exports = routerApi
