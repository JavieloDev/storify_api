const {Model, DataTypes} = require('sequelize');

const TABLE_NAME = 'ORDER_PAYMENTS';

const OrderPaymentSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
    },
    order_id: {
        field: 'order_id',
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'ORDERS',
            key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    },
    method: {
        field: 'method',
        type: DataTypes.ENUM('cash', 'card', 'transfer', 'other'),
        allowNull: false,
    },
    amount: {
        field: 'amount',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    reference: {
        field: 'reference',
        type: DataTypes.STRING(150),
        allowNull: true,
    },
    remote_id: {
        field: 'remote_id',
        type: DataTypes.UUID,
        allowNull: true,
        unique: true,
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
};

class OrderPayment extends Model {
    static associate(models) {
        OrderPayment.belongsTo(models.Order, {
            foreignKey: 'order_id',
            as: 'order',
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_NAME,
            modelName: 'OrderPayment',
            timestamps: false,
            hooks: {
                beforeCreate: (instance) => {
                    instance.created_at = new Date();
                    instance.updated_at = new Date();
                },
                beforeUpdate: (instance) => {
                    instance.updated_at = new Date();
                },
            },
        };
    }
}

module.exports = {
    TABLE_NAME,
    OrderPayment,
    OrderPaymentSchema,
};