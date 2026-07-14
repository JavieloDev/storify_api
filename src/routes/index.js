const express = require('express');
const cors = require('cors');

const productsRoutes = require('./products.route');
const categoriesRouter = require('./category.route');
const subcategoriesRouter = require('./subcategories.route');
const businessRouter = require('./business.route');


function routerApi(app) {
    const router = express.Router();
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH']
    }));
    app.use('/api/v1', router);
    router.use('/product', productsRoutes);
    router.use('/categories', categoriesRouter);
    router.use('/subcategories', subcategoriesRouter);

    router.use('/business', businessRouter);
}

module.exports = routerApi
