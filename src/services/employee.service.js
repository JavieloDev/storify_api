const {Op} = require('sequelize');
const {hashPin} = require("./pin-hash.service");


class EmployeeService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.model = sequelizeInstance.models.Employee;

        if (!this.model) {
            const availableModels = Object.keys(sequelizeInstance.models).join(', ');
            throw new Error(`Modelo Employee no encontrado. Modelos disponibles: ${availableModels}`);
        }
    }

    async create(data) {
        if (!data.business_id) {
            throw new Error('business_id es requerido');
        }
        if (!data.name) {
            throw new Error('name es requerido');
        }
        if (!data.pin || !/^\d{4,6}$/.test(String(data.pin))) {
            throw new Error('pin es requerido y debe tener entre 4 y 6 dígitos');
        }

        const business = await this.sequelize.models.Business.findByPk(data.business_id, {
            attributes: ['id', 'status'],
        });
        if (!business) {
            throw new Error('El negocio especificado no existe');
        }
        if (business.status !== 'active') {
            throw new Error('El negocio especificado no está activo');
        }

        const pin_hash = hashPin(String(data.pin), data.business_id);

        const existing = await this.model.findOne({
            where: {business_id: data.business_id, pin_hash},
        });
        if (existing) {
            throw new Error('Ya existe un empleado con ese PIN en este negocio');
        }

        return this.model.create({
            business_id: data.business_id,
            name: data.name,
            email: data.email || null,
            role: data.role || 'cashier',
            pin_hash,
        });
    }

    async update(id, data) {
        const record = await this.model.findByPk(id);
        if (!record) {
            throw new Error('Empleado no encontrado');
        }

        const updateData = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.status !== undefined) updateData.status = data.status;

        if (data.pin !== undefined) {
            if (!/^\d{4,6}$/.test(String(data.pin))) {
                throw new Error('El PIN debe tener entre 4 y 6 dígitos');
            }
            const pin_hash = hashPin(String(data.pin), record.business_id);

            const existing = await this.model.findOne({
                where: {
                    business_id: record.business_id,
                    pin_hash,
                    id: {[Op.ne]: id},
                },
            });
            if (existing) {
                throw new Error('Ya existe otro empleado con ese PIN en este negocio');
            }

            updateData.pin_hash = pin_hash;
        }

        return record.update(updateData);
    }

    async updateStatus(id, status) {
        const validStatuses = ['active', 'inactive'];
        if (!validStatuses.includes(status)) {
            return {
                status: 'error',
                code: 400,
                message: `El estado debe ser uno de: ${validStatuses.join(', ')}`,
                data: null,
            };
        }

        const record = await this.model.findByPk(id);
        if (!record) {
            return {status: 'error', code: 404, message: 'Empleado no encontrado', data: null};
        }

        await record.update({status});

        return {
            status: 'success',
            code: 200,
            message: 'Estado del empleado actualizado correctamente',
            data: record,
        };
    }

    /** Llamado tras validar PIN online (fallback) o desde admin, para auditoría. */
    async touchLastLogin(id) {
        const record = await this.model.findByPk(id);
        if (!record) {
            return {status: 'error', code: 404, message: 'Empleado no encontrado', data: null};
        }

        await record.update({last_login_at: new Date()});

        return {status: 'success', code: 200, message: 'Empleado actualizado', data: record};
    }

    async delete(id) {
        const record = await this.model.findByPk(id);
        if (!record) {
            return {status: 'error', code: 404, message: 'Empleado no encontrado'};
        }

        await record.destroy();
        return {status: 'success', code: 200, message: 'Empleado eliminado correctamente', data: []};
    }

    async findById(id) {
        const record = await this.model.findByPk(id);

        if (!record) {
            return {status: 'error', code: 404, message: 'Empleado no encontrado', data: null};
        }

        return {status: 'success', code: 200, message: 'Empleado obtenido correctamente', data: record};
    }

    /** Para pantallas de administración — nunca expone pin_hash. */
    async findAll({page = 1, limit = 10, filters = {}, orderBy = 'created_at', orderDirection = 'DESC'} = {}) {
        const safeLimit = Math.min(Number(limit) || 10, 100);
        const currentPage = Number(page) || 1;
        const offset = (currentPage - 1) * safeLimit;

        const where = this._buildFilters(filters);

        const [total, rows] = await Promise.all([
            this.model.count({where}),
            this.model.findAll({
                where,
                limit: safeLimit,
                offset,
                order: [[orderBy, orderDirection]],
                attributes: {exclude: ['pin_hash']},
                raw: true,
            }),
        ]);

        const totalPages = Math.ceil(total / safeLimit);

        return {
            status: 'success',
            code: 200,
            message: 'Empleados obtenidos correctamente',
            data: rows,
            pagination: {page: currentPage, limit: safeLimit, total, total_pages: totalPages},
        };
    }

    /**
     * Usado por SyncService del POS — SÍ incluye pin_hash porque el
     * dispositivo lo necesita para validar el PIN localmente sin red.
     */
    async findByBusiness(businessId, page = 1, limit = 1000, filter = {}, since) {
        const where = {business_id: businessId, ...filter};
        if (since) {
            where.updated_at = {[Op.gt]: new Date(since)};
        }

        const safeLimit = Math.min(Number(limit) || 1000, 1000);
        const currentPage = Number(page) || 1;
        const offset = (currentPage - 1) * safeLimit;

        const {rows, count} = await this.model.findAndCountAll({
            where,
            limit: safeLimit,
            offset,
            order: [['updated_at', 'ASC']],
        });

        return {
            status: 'success',
            code: 200,
            message: 'Empleados obtenidos correctamente',
            data: rows,
            pagination: {page: currentPage, limit: safeLimit, total: count},
        };
    }

    /**
     * Validación ONLINE del PIN — fallback para el primer login antes de
     * que exista sync local, o para uso administrativo. El flujo diario
     * del POS valida offline contra pin_hash ya sincronizado.
     */
    async validatePin(businessId, pin) {
        const pin_hash = hashPin(String(pin), businessId);
        const employee = await this.model.findOne({
            where: {business_id: businessId, pin_hash, status: 'active'},
        });

        if (!employee) {
            return {status: 'error', code: 401, message: 'PIN inválido', data: null};
        }

        await employee.update({last_login_at: new Date()});

        return {status: 'success', code: 200, message: 'Login correcto', data: employee};
    }

    _buildFilters(filters) {
        const where = {};
        if (filters.name) where.name = {[Op.iLike]: `%${filters.name}%`};
        if (filters.business_id) where.business_id = filters.business_id;
        if (filters.role) where.role = filters.role;
        if (filters.status) where.status = filters.status;
        if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
            where.id = {[Op.in]: filters.ids};
        }
        return where;
    }
}

module.exports = EmployeeService;