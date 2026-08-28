const {Product, ProductSchema} = require('./products');
const {Category, CategorySchema} = require("./category");
const {Subcategory, SubcategorySchema} = require("./subcategories.model");
const {Business, BusinessSchema} = require("./business.model");
const {Order, OrderSchema} = require("./order.model");
const {OrderItem, OrderItemSchema} = require("./order-item.model");
const {Device, DeviceSchema} = require("./device.model");
const {SalesPoint, SalesPointSchema} = require("./sales-point");
const {SalesPointProduct, SalesPointProductSchema} = require("./sales-point-products");
const {SalesPointUser, SalesPointUserSchema} = require("./sales-point-users");
const {SalesPointDevice, SalesPointDeviceSchema} = require("./sales-point-device");
const {Employee, EmployeeSchema} = require("./employee.model");

function setupModels(sequelize) {
    Product.init(ProductSchema, Product.config(sequelize));
    Category.init(CategorySchema, Category.config(sequelize));
    Subcategory.init(SubcategorySchema, Subcategory.config(sequelize));
    Business.init(BusinessSchema, Business.config(sequelize));
    Order.init(OrderSchema, Order.config(sequelize));
    OrderItem.init(OrderItemSchema, OrderItem.config(sequelize));
    Device.init(DeviceSchema, Device.config(sequelize));
    SalesPoint.init(SalesPointSchema, SalesPoint.config(sequelize));
    SalesPointProduct.init(SalesPointProductSchema, SalesPointProduct.config(sequelize));
    SalesPointUser.init(SalesPointUserSchema, SalesPointUser.config(sequelize));
    SalesPointDevice.init(SalesPointDeviceSchema, SalesPointDevice.config(sequelize));
    Employee.init(EmployeeSchema, Employee.config(sequelize));

    Product.associate(sequelize.models);
    Category.associate(sequelize.models);
    Subcategory.associate(sequelize.models);
    Business.associate(sequelize.models);
    Order.associate(sequelize.models);
    OrderItem.associate(sequelize.models);
    Device.associate(sequelize.models);
    SalesPoint.associate(sequelize.models);
    SalesPointProduct.associate(sequelize.models);
    SalesPointUser.associate(sequelize.models);
    SalesPointDevice.associate(sequelize.models);
    Employee.associate(sequelize.models);
}

module.exports = setupModels;
