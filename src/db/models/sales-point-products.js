// src/db/models/salesPointProduct.model.js
const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_SALES_POINT_PRODUCT = 'SALES_POINT_PRODUCTS';

const SalesPointProductSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: () => idGenerator.generateId(),
        allowNull: false,
        primaryKey: true,
    },
    active: {
        field: 'active',
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    assigned_quantity: {
        field: 'assigned_quantity',
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0,
        },
    },
    custom_price: {
        field: 'custom_price',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
    },
    created_at: {
        field: 'created_at',
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    sales_point_id: {
        field: 'sales_point_id',
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'SALES_POINTS',
            key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    },
    product_id: {
        field: 'product_id',
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'PRODUCTS',
            key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    },
};

class SalesPointProduct extends Model {
    static associate(models) {
        SalesPointProduct.belongsTo(models.SalesPoint, {
            foreignKey: 'sales_point_id',
            as: 'salesPoint'
        });
        SalesPointProduct.belongsTo(models.Product, {
            foreignKey: 'product_id',
            as: 'product'
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_SALES_POINT_PRODUCT,
            modelName: 'SalesPointProduct',
            timestamps: false,
            indexes: [
                {
                    unique: true,
                    fields: ['sales_point_id', 'product_id'],
                    name: 'uq_sales_point_product'
                }
            ]
        };
    }
}

module.exports = {TABLE_SALES_POINT_PRODUCT, SalesPointProduct, SalesPointProductSchema};