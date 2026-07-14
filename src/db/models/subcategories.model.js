// src/db/models/subcategory.model.js
const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_SUBCATEGORY = 'SUBCATEGORIES';

const SubcategorySchema = {
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
    category_id: {
        field: 'category_id',
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'CATEGORIES',
            key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
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

class Subcategory extends Model {
    static associate(models) {
        Subcategory.belongsTo(models.Category, {
            foreignKey: 'category_id',
            as: 'category'
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_SUBCATEGORY,
            modelName: 'Subcategory',
            timestamps: false,
            hooks: {
                beforeCreate: (subcategory) => {
                    subcategory.created_at = new Date();
                    subcategory.updated_at = new Date();
                },
                beforeUpdate: (subcategory) => {
                    subcategory.updated_at = new Date();
                }
            }
        };
    }
}

module.exports = {TABLE_SUBCATEGORY, Subcategory, SubcategorySchema};