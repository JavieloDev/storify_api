const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_ORDER = 'ORDERS';

const OrderSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: () => idGenerator.generateId(),
        allowNull: false,
        primaryKey: true,
    },
    order_number: {
        field: 'order_number',
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    order_sequence: {
        field: 'order_sequence',
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    status: {
        field: 'status',
        type: DataTypes.ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
    },
    subtotal: {
        field: 'subtotal',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    discount_total: {
        field: 'discount_total',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    total: {
        field: 'total',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    notes: {
        field: 'notes',
        type: DataTypes.TEXT,
        allowNull: true,
    },
    customer_name: {
        field: 'customer_name',
        type: DataTypes.STRING(150),
        allowNull: true,
    },
    customer_phone: {
        field: 'customer_phone',
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    customer_email: {
        field: 'customer_email',
        type: DataTypes.STRING(150),
        allowNull: true,
    },
    cancellation_reason: {
        field: 'cancellation_reason',
        type: DataTypes.TEXT,
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

class Order extends Model {
    static associate(models) {
        Order.belongsTo(models.Business, {
            foreignKey: 'business_id',
            as: 'business'
        });

        Order.hasMany(models.OrderItem, {
            foreignKey: 'order_id',
            as: 'items'
        });

        Order.belongsToMany(models.Product, {
            through: models.OrderItem,
            foreignKey: 'order_id',
            otherKey: 'product_id',
            as: 'products'
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_ORDER,
            modelName: 'Order',
            timestamps: false,
            hooks: {
                beforeCreate: (order) => {
                    order.created_at = new Date();
                    order.updated_at = new Date();

                    if (!order.business_id) {
                        throw new Error('business_id es requerido para generar el número de orden');
                    }
                },
                beforeUpdate: (order) => {
                    order.updated_at = new Date();
                }
            }
        };
    }
}

module.exports = {TABLE_ORDER, Order, OrderSchema};