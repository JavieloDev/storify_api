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


function routerApi(app) {
    const router = express.Router();
    app.use(cors({
        origin: [
            'https://tu-panel-web.vercel.app',
            'capacitor://localhost',
            'http://localhost',
            'https://localhost',
        ],
        methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
        credentials: true,
    }));
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
}

module.exports = routerApi
