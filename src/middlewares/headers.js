const sequelize = require('../libs/sequelize');

const ProductService = require("../services/product.service");
const CategoryService = require("../services/category.service");
const SubcategoryService = require("../services/subcategories.service");
const BusinessService = require("../services/business.service");
const OrderService = require("../services/order.service");
const SalesReportService = require("../services/sales-reports");

function getService(req, modelName) {
    if (!sequelize) {
        throw new Error('No se pudo obtener la instancia de base de datos');
    }

    switch (modelName) {
        case 'PRODUCT':
            return new ProductService(sequelize);
        case 'CATEGORY':
            return new CategoryService(sequelize);
        case 'SUBCATEGORY':
            return new SubcategoryService(sequelize);
        case 'BUSINESS':
            return new BusinessService(sequelize);
        case 'ORDER':
            return new OrderService(sequelize);
        case 'SALES_REPORT':
            return new SalesReportService(sequelize);
        default:
            throw new Error(`Servicio no encontrado para el modelo: ${modelName}`);
    }
}

module.exports = {getService};