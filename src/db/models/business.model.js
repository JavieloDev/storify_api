const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_BUSINESS = 'BUSINESSES';

const BusinessSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: () => idGenerator.generateId(),
        allowNull: false,
        primaryKey: true,
    },
    owner_id: {
        field: 'owner_id',
        type: DataTypes.UUID,
        allowNull: false,
    },
    name: {
        field: 'name',
        type: DataTypes.STRING(150),
        allowNull: false,
    },
    slug: {
        field: 'slug',
        type: DataTypes.STRING(160),
        allowNull: false,
        unique: true,
    },
    description: {
        field: 'description',
        type: DataTypes.TEXT,
        allowNull: true,
    },
    logo: {
        field: 'logo',
        type: DataTypes.STRING(500),
        allowNull: true,
    },
    banner: {
        field: 'banner',
        type: DataTypes.STRING(500),
        allowNull: true,
    },
    category: {
        field: 'category',
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    tags: {
        field: 'tags',
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
    },
    status: {
        field: 'status',
        type: DataTypes.ENUM('active', 'inactive', 'pending', 'suspended'),
        allowNull: false,
        defaultValue: 'pending',
    },
    suspension_reason: {
        field: 'suspension_reason',
        type: DataTypes.TEXT,
        allowNull: true,
    },
    email: {
        field: 'email',
        type: DataTypes.STRING(150),
        allowNull: true,
        validate: {
            isEmail: true,
        },
    },
    phone: {
        field: 'phone',
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    address: {
        field: 'address',
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    currency: {
        field: 'currency',
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'USD',
    },
    timezone: {
        field: 'timezone',
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'UTC',
    },
    social_links: {
        field: 'social_links',
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    settings: {
        field: 'settings',
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    plan: {
        field: 'plan',
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'free',
    },
    plan_expires_at: {
        field: 'plan_expires_at',
        type: DataTypes.DATE,
        allowNull: true,
    },
    total_products: {
        field: 'total_products',
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    total_orders: {
        field: 'total_orders',
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    total_revenue: {
        field: 'total_revenue',
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
    },
    last_activity_at: {
        field: 'last_activity_at',
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

class Business extends Model {
    static associate(models) {
        Business.hasMany(models.Product, {
            foreignKey: 'business_id',
            as: 'products'
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_BUSINESS,
            modelName: 'Business',
            timestamps: false,
            paranoid: true,
            deletedAt: 'deleted_at',
            hooks: {
                beforeCreate: (business) => {
                    business.created_at = new Date();
                    business.updated_at = new Date();
                },
                beforeUpdate: (business) => {
                    business.updated_at = new Date();
                }
            }
        };
    }
}

module.exports = {TABLE_BUSINESS, Business, BusinessSchema};