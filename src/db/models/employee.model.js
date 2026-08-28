const {Model, DataTypes} = require('sequelize');
const idGenerator = require('../../services/idGenerator.service');

const TABLE_EMPLOYEE = 'EMPLOYEES';

const EmployeeSchema = {
    id: {
        field: 'id',
        type: DataTypes.UUID,
        defaultValue: () => idGenerator.generateId(),
        allowNull: false,
        primaryKey: true,
    },
    business_id: {
        field: 'business_id',
        type: DataTypes.UUID,
        allowNull: false,
    },
    name: {
        field: 'name',
        type: DataTypes.STRING(150),
        allowNull: false,
    },
    email: {
        field: 'email',
        type: DataTypes.STRING(150),
        allowNull: true,
        validate: {
            isEmail: true,
        },
    },
    pin_hash: {
        field: 'pin_hash',
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    role: {
        field: 'role',
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'cashier',
    },
    status: {
        field: 'status',
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
    },
    last_login_at: {
        field: 'last_login_at',
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

class Employee extends Model {
    static associate(models) {
        Employee.belongsTo(models.Business, {
            foreignKey: 'business_id',
            as: 'business',
        });
    }

    static config(sequelize) {
        return {
            sequelize,
            tableName: TABLE_EMPLOYEE,
            modelName: 'Employee',
            timestamps: false,
            paranoid: true,
            deletedAt: 'deleted_at',
            indexes: [
                {
                    unique: true,
                    fields: ['business_id', 'pin_hash'],
                    name: 'employees_business_id_pin_hash_unique',
                },
                {
                    fields: ['business_id', 'status'],
                    name: 'employees_business_id_status_idx',
                },
            ],
            hooks: {
                beforeCreate: (employee) => {
                    employee.created_at = new Date();
                    employee.updated_at = new Date();
                },
                beforeUpdate: (employee) => {
                    employee.updated_at = new Date();
                },
            },
        };
    }
}

module.exports = {TABLE_EMPLOYEE, Employee, EmployeeSchema};