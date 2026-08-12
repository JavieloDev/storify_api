const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_DEVICE = 'DEVICES';

const DeviceSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: () => idGenerator.generateId(),
        allowNull: false,
        primaryKey: true,
    },
    business_id: {
        field: 'business_id',
        type: DataTypes.UUID,
        allowNull: false,
    },

    device_uuid: {
        field: 'device_uuid',
        type: DataTypes.STRING(36),
        allowNull: false,
    },

    label: {
        field: 'label',
        type: DataTypes.STRING(150),
        allowNull: true,
    },

    native_device_id: {
        field: 'native_device_id',
        type: DataTypes.STRING(150),
        allowNull: true,
    },

    status: {
        field: 'status',
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
    },

    last_seen_at: {
        field: 'last_seen_at',
        type: DataTypes.DATE,
        allowNull: true,
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

    deleted_at: {
        field: 'deleted_at',
        type: DataTypes.DATE,
        allowNull: true,
    },
};

class Device extends Model {
    static associate(models) {
        Device.belongsTo(models.Business, {
            foreignKey: 'business_id',
            as: 'business'
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_DEVICE,
            modelName: 'Device',
            timestamps: false,
            paranoid: true,
            deletedAt: 'deleted_at',
            indexes: [
                {
                    unique: true,
                    fields: ['business_id', 'device_uuid'],
                    name: 'devices_business_id_device_uuid_unique',
                },
                {
                    fields: ['business_id', 'status'],
                    name: 'devices_business_id_status_idx',
                },
            ],
            hooks: {
                beforeCreate: (device) => {
                    device.created_at = new Date();
                    device.updated_at = new Date();
                },
                beforeUpdate: (device) => {
                    device.updated_at = new Date();
                }
            }
        };
    }
}

module.exports = {TABLE_DEVICE, Device, DeviceSchema};