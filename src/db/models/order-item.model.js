const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_ORDER_ITEM = 'ORDER_ITEMS';

const OrderItemSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: () => idGenerator.generateId(),
        allowNull: false,
        primaryKey: true,
    },
    quantity: {
        field: 'quantity',
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    unit_price: {
        field: 'unit_price',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    subtotal: {
        field: 'subtotal',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },

    created_at: {
        field: 'created_at',
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
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
    product_id: {
        field: 'product_id',
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'PRODUCTS',
            key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
    },
};

class OrderItem extends Model {
    static associate(models) {
        OrderItem.belongsTo(models.Order, {
            foreignKey: 'order_id',
            as: 'order'
        });

        OrderItem.belongsTo(models.Product, {
            foreignKey: 'product_id',
            as: 'product'
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_ORDER_ITEM,
            modelName: 'OrderItem',
            timestamps: false,
            hooks: {
                beforeCreate: (item) => {
                    item.created_at = new Date();
                    item.subtotal = Number(item.unit_price) * Number(item.quantity);
                },
                beforeUpdate: (item) => {
                    if (item.changed('quantity') || item.changed('unit_price')) {
                        item.subtotal = Number(item.unit_price) * Number(item.quantity);
                    }
                }
            }
        };
    }
}

module.exports = {TABLE_ORDER_ITEM, OrderItem, OrderItemSchema};