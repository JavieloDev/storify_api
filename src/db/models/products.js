const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_PRODUCT = 'PRODUCTS';

const ProductSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: () => idGenerator.generateId(),
        allowNull: false,
        primaryKey: true,
    },
    name: {
        field: 'name',
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    description: {
        field: 'description',
        type: DataTypes.TEXT,
        allowNull: true,
    },
    brand: {
        field: 'brand',
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    price: {
        field: 'price',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    original_price: {
        field: 'original_price',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
    },
    discount: {
        field: 'discount',
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
    },

    quantity: {
        field: 'quantity',
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },

    stock_status: {
        field: 'stock_status',
        type: DataTypes.ENUM('in_stock', 'medium', 'low', 'critical', 'out'),
        allowNull: false,
        defaultValue: 'in_stock',
    },

    colors: {
        field: 'colors',
        type: DataTypes.ARRAY(DataTypes.STRING(7)),
        allowNull: true,
        defaultValue: [],
    },

    image: {
        field: 'image',
        type: DataTypes.TEXT,
        allowNull: true,
    },

    featured: {
        field: 'featured',
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },

    on_sale: {
        field: 'on_sale',
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    is_new: {
        field: 'is_new',
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    is_active: {
        field: 'is_active',
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
    updated_at: {
        field: 'updated_at',
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },

    subcategory_id: {
        field: 'subcategory_id',
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'SUBCATEGORIES',
            key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
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

class Product extends Model {
    static associate(models) {
        Product.belongsTo(models.Subcategory, {
            foreignKey: 'subcategory_id',
            as: 'subcategory'
        });

        Product.belongsTo(models.Business, {
            foreignKey: 'business_id',
            as: 'business'
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_PRODUCT,
            modelName: 'Product',
            timestamps: false,
            hooks: {
                beforeCreate: (product) => {
                    product.created_at = new Date();
                    product.updated_at = new Date();
                    if (!product.stock_status) {
                        product.stock_status = product.quantity === 0 ? 'out' : 'in_stock';
                    }
                },
                beforeUpdate: (product) => {
                    product.updated_at = new Date();
                    if (product.changed('quantity')) {
                        const qty = product.quantity;
                        if (qty === 0) product.stock_status = 'out';
                        else if (qty <= 2) product.stock_status = 'critical';
                        else if (qty <= 5) product.stock_status = 'low';
                        else if (qty <= 10) product.stock_status = 'medium';
                        else product.stock_status = 'in_stock';
                    }
                }
            }
        };
    }
}

module.exports = {TABLE_PRODUCT, Product, ProductSchema};