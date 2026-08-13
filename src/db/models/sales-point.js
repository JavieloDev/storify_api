// src/db/models/salesPoint.model.js
const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_SALES_POINT = 'SALES_POINTS';

const SalesPointSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: () => idGenerator.generateId(),
        allowNull: false,
        primaryKey: true,
    },
    name: {
        field: 'name',
        type: DataTypes.STRING(150),
        allowNull: false,
    },
    description: {
        field: 'description',
        type: DataTypes.TEXT,
        allowNull: true,
    },
    address: {
        field: 'address',
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    phone: {
        field: 'phone',
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    status: {
        field: 'status',
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
    },
    created_at: {
        field: 'created_at',
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    updated_at: {
        field: 'updated_at',
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    business_id: {
        field: 'business_id',
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'BUSINESSES',
            key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    },
};

class SalesPoint extends Model {
    static associate(models) {
        SalesPoint.belongsTo(models.Business, {
            foreignKey: 'business_id',
            as: 'business'
        });

        // Productos asignados (N:M vía SALES_POINT_PRODUCTS)
        SalesPoint.belongsToMany(models.Product, {
            through: models.SalesPointProduct,
            foreignKey: 'sales_point_id',
            otherKey: 'product_id',
            as: 'products'
        });

        // Acceso directo a la tabla puente (para ver custom_price/active por asignación)
        SalesPoint.hasMany(models.SalesPointProduct, {
            foreignKey: 'sales_point_id',
            as: 'productAssignments'
        });

        // Usuarios asignados
        SalesPoint.hasMany(models.SalesPointUser, {
            foreignKey: 'sales_point_id',
            as: 'assignedUsers'
        });

        // 🆕 Dispositivos asignados (N:M vía SALES_POINT_DEVICES)
        SalesPoint.belongsToMany(models.Device, {
            through: models.SalesPointDevice,
            foreignKey: 'sales_point_id',
            otherKey: 'device_id',
            as: 'devices'
        });

        // Acceso directo a la tabla puente (para ver active por asignación)
        SalesPoint.hasMany(models.SalesPointDevice, {
            foreignKey: 'sales_point_id',
            as: 'deviceAssignments'
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_SALES_POINT,
            modelName: 'SalesPoint',
            timestamps: false,
            hooks: {
                beforeCreate: (salesPoint) => {
                    salesPoint.created_at = new Date();
                    salesPoint.updated_at = new Date();
                },
                beforeUpdate: (salesPoint) => {
                    salesPoint.updated_at = new Date();
                }
            }
        };
    }
}

module.exports = {TABLE_SALES_POINT, SalesPoint, SalesPointSchema};