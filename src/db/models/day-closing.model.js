const { Model, DataTypes } = require('sequelize');

const TABLE_NAME = 'DAY_CLOSINGS';

const DayClosingSchema = {
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
    period_start: {
        field: 'period_start',
        type: DataTypes.DATE,
        allowNull: true,
    },
    period_end: {
        field: 'period_end',
        type: DataTypes.DATE,
        allowNull: false,
    },
    opening_float: {
        field: 'opening_float',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    orders_count: {
        field: 'orders_count',
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    total_sales: {
        field: 'total_sales',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    cash_sales: {
        field: 'cash_sales',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    card_sales: {
        field: 'card_sales',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    transfer_sales: {
        field: 'transfer_sales',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    other_sales: {
        field: 'other_sales',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    cash_expenses: {
        field: 'cash_expenses',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    expected_cash: {
        field: 'expected_cash',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    counted_cash: {
        field: 'counted_cash',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // 🆕 Efectivo que efectivamente queda físicamente en la caja al cerrar.
    // Puede ser 0 (si se retira todo) o un valor menor o igual a counted_cash
    // (si se deja un fondo para el próximo turno). El próximo cierre usa este
    // valor como opening_float, en vez de counted_cash directo.
    carried_float: {
        field: 'carried_float',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    difference: {
        field: 'difference',
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    denominations: {
        field: 'denominations',
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    notes: {
        field: 'notes',
        type: DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        field: 'status',
        type: DataTypes.ENUM('balanced', 'over', 'short'),
        allowNull: false,
        defaultValue: 'balanced',
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
    closed_by: {
        field: 'closed_by',
        type: DataTypes.STRING(150),
        allowNull: true,
    },
    remote_id: {
        field: 'remote_id',
        type: DataTypes.UUID,
        allowNull: true,
        unique: true,
    },
    // 🆕 De dónde vino el registro (offline snapshot vs cálculo directo online)
    source: {
        field: 'source',
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: 'online',
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

class DayClosing extends Model {
    static associate(models) {
        DayClosing.belongsTo(models.Business, {
            foreignKey: 'business_id',
            as: 'business',
        });

        DayClosing.belongsTo(models.SalesPoint, {
            foreignKey: 'sales_point_id',
            as: 'salesPoint',
        });

        DayClosing.hasMany(models.CashMovement, {
            foreignKey: 'day_closing_id',
            as: 'cashMovements',
        });

        DayClosing.belongsTo(models.Employee, {
            foreignKey: 'employee_id',
            as: 'employee',
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_NAME,
            modelName: 'DayClosing',
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
    DayClosing,
    DayClosingSchema,
};