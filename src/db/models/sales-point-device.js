// src/db/models/salesPointDevice.model.js
const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_SALES_POINT_DEVICE = 'SALES_POINT_DEVICES';

const SalesPointDeviceSchema = {
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
    device_id: {
        field: 'device_id',
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'DEVICES',
            key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    },
};

class SalesPointDevice extends Model {
    static associate(models) {
        SalesPointDevice.belongsTo(models.SalesPoint, {foreignKey: 'sales_point_id', as: 'salesPoint'});
        SalesPointDevice.belongsTo(models.Device, {foreignKey: 'device_id', as: 'device'});
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_SALES_POINT_DEVICE,
            modelName: 'SalesPointDevice',
            timestamps: false,
            indexes: [
                {unique: true, fields: ['sales_point_id', 'device_id'], name: 'uq_sales_point_device'}
            ]
        };
    }
}

module.exports = {TABLE_SALES_POINT_DEVICE, SalesPointDevice, SalesPointDeviceSchema};