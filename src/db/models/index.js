const {Product, ProductSchema} = require('./products');
const {Category, CategorySchema} = require("./category");
const {Subcategory, SubcategorySchema} = require("./subcategories.model");
const {Business, BusinessSchema} = require("./business.model");
const {Order, OrderSchema} = require("./order.model");
const {OrderItem, OrderItemSchema} = require("./order-item.model");

function setupModels(sequelize) {
    Product.init(ProductSchema, Product.config(sequelize));
    Category.init(CategorySchema, Category.config(sequelize));
    Subcategory.init(SubcategorySchema, Subcategory.config(sequelize));
    Business.init(BusinessSchema, Business.config(sequelize));
    Order.init(OrderSchema, Order.config(sequelize));
    OrderItem.init(OrderItemSchema, OrderItem.config(sequelize));

    Product.associate(sequelize.models);
    Category.associate(sequelize.models);
    Subcategory.associate(sequelize.models);
    Business.associate(sequelize.models);
    Order.associate(sequelize.models);
    OrderItem.associate(sequelize.models);
}

module.exports = setupModels;
