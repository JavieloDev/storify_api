// src/db/models/category.model.js
const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_CATEGORY = 'CATEGORIES';

const CategorySchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: () => idGenerator.generateId(),
        allowNull: false,
        primaryKey: true,
    },
    name: {
        field: 'name',
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    description: {
        field: 'description',
        type: DataTypes.TEXT,
        allowNull: true,
    },
    priority: {
        field: 'priority',
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    active: {
        field: 'active',
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    icon: {
        field: 'icon',
        type: DataTypes.STRING(255),
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

class Category extends Model {
    static associate(models) {
        // Una categoría puede tener muchos productos
        Category.hasMany(models.Subcategory, {
            foreignKey: 'category_id',
            as: 'subcategories'
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_CATEGORY,
            modelName: 'Category',
            timestamps: false,
            hooks: {
                beforeCreate: (category) => {
                    category.created_at = new Date();
                    category.updated_at = new Date();
                },
                beforeUpdate: (category) => {
                    category.updated_at = new Date();
                }
            }
        };
    }
}

module.exports = {TABLE_CATEGORY, Category, CategorySchema};