// src/db/models/salesPointUser.model.js
const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_SALES_POINT_USER = 'SALES_POINT_USERS';

// 🔧 MOCK: user_id/user_name sin FK a una tabla Users real todavía.
// Cuando exista el modelo de usuarios, agregar `references` a user_id
// y probablemente quitar user_name (se resolvería vía include).
const SalesPointUserSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: () => idGenerator.generateId(),
        allowNull: false,
        primaryKey: true,
    },
    user_id: {
        field: 'user_id',
        type: DataTypes.UUID,
        allowNull: false,
    },
    user_name: {
        field: 'user_name',
        type: DataTypes.STRING(150),
        allowNull: true,
    },
    role: {
        field: 'role',
        type: DataTypes.ENUM('owner', 'manager', 'cashier', 'staff'),
        allowNull: false,
        defaultValue: 'staff',
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
};

class SalesPointUser extends Model {
    static associate(models) {
        SalesPointUser.belongsTo(models.SalesPoint, {
            foreignKey: 'sales_point_id',
            as: 'salesPoint'
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_SALES_POINT_USER,
            modelName: 'SalesPointUser',
            timestamps: false,
            indexes: [
                {
                    unique: true,
                    fields: ['sales_point_id', 'user_id'],
                    name: 'uq_sales_point_user'
                }
            ]
        };
    }
}

module.exports = {TABLE_SALES_POINT_USER, SalesPointUser, SalesPointUserSchema};