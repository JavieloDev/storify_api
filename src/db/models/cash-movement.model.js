const {Model, DataTypes} = require('sequelize');

const TABLE_NAME = 'CASH_MOVEMENTS';

const CashMovementSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
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
    sales_point_id: {
        field: 'sales_point_id',
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'SALES_POINTS',
            key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
    },
    day_closing_id: {
        field: 'day_closing_id',
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'DAY_CLOSINGS',
            key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    },
    // Alineado con CASH_MOVEMENT_SCHEMA del frontend (schema.ts):
    // sin 'income', un solo campo de texto obligatorio ('reason')
    type: {
        field: 'type',
        type: DataTypes.ENUM('expense', 'withdrawal', 'deposit'),
        allowNull: false,
    },
    amount: {
        field: 'amount',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    reason: {
        field: 'reason',
        type: DataTypes.TEXT,
        allowNull: false,
    },
    employee_id: {
        field: 'employee_id',
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'EMPLOYEES',
            key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
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

class CashMovement extends Model {
    static associate(models) {
        CashMovement.belongsTo(models.Business, {
            foreignKey: 'business_id',
            as: 'business',
        });

        CashMovement.belongsTo(models.SalesPoint, {
            foreignKey: 'sales_point_id',
            as: 'salesPoint',
        });

        CashMovement.belongsTo(models.DayClosing, {
            foreignKey: 'day_closing_id',
            as: 'dayClosing',
        });

        CashMovement.belongsTo(models.Employee, {
            foreignKey: 'employee_id',
            as: 'employee',
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_NAME,
            modelName: 'CashMovement',
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
    CashMovement,
    CashMovementSchema,
};