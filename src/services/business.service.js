// src/services/business.service.js
const {Op} = require('sequelize');

class BusinessService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.model = sequelizeInstance.models.Business;

        if (!this.model) {
            const availableModels = Object.keys(sequelizeInstance.models).join(', ');
            throw new Error(`Modelo Business no encontrado. Modelos disponibles: ${availableModels}`);
        }
    }

    async create(data /*, ownerId */) {
        // TODO(auth): cuando se reactive auth, recibir ownerId y setearlo:
        // data.owner_id = ownerId;

        if (!data.name || data.name.trim().length < 2) {
            const error = new Error('El nombre del negocio es obligatorio y debe tener al menos 2 caracteres.');
            error.status = 400;
            throw error;
        }

        data.name = data.name.trim();
        data.slug = await this._generateUniqueSlug(data.name);

        return this.model.create(data);
    }

    async update(id, data /*, ownerId */) {
        const record = await this.findById(id);

        if (!record) {
            throw new Error('Negocio no encontrado');
        }

        // TODO(auth): validar propiedad antes de permitir la actualización
        // if (record.owner_id !== ownerId) {
        //     const error = new Error('No tienes permiso para modificar este negocio.');
        //     error.status = 403;
        //     throw error;
        // }

        // Evita que se sobreescriban campos sensibles por esta vía
        delete data.owner_id;
        delete data.status;
        delete data.total_products;
        delete data.total_orders;
        delete data.total_revenue;

        if (data.name) {
            data.slug = await this._generateUniqueSlug(data.name, id);
        }

        return record.update(data);
    }

    async delete(id /*, ownerId */) {
        const record = await this.findById(id);

        if (!record) {
            return {
                status: 'error',
                code: 404,
                message: 'Negocio no encontrado'
            };
        }

        // TODO(auth): validar propiedad antes de permitir eliminar
        // if (record.owner_id !== ownerId) { ... }

        await record.destroy(); // soft delete (paranoid: true en el modelo)

        return {
            status: 'success',
            code: 200,
            message: 'Negocio eliminado correctamente',
            data: []
        };
    }

    async findById(id) {
        return this.model.findByPk(id);
    }

    async findBySlug(slug) {
        return this.model.findOne({where: {slug}});
    }

    async findAll({
                      page = 1,
                      limit = 10,
                      filters = {},
                      orderBy = 'created_at',
                      orderDirection = 'DESC'
                  } = {}) {

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
                raw: true
            })
        ]);

        // Conteo de productos por negocio (solo para los negocios de esta página)
        const businessIds = rows.map(r => r.id);
        let productCounts = [];

        const ProductModel = this.sequelize.models.Product;

        if (businessIds.length && ProductModel) {
            productCounts = await ProductModel.findAll({
                attributes: [
                    'business_id',
                    [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'total_products']
                ],
                where: {business_id: businessIds},
                group: ['business_id'],
                raw: true
            });
        }

        const countMap = productCounts.reduce((acc, item) => {
            acc[item.business_id] = Number(item.total_products);
            return acc;
        }, {});

        const rowsWithSummary = rows.map(row => ({
            ...row,
            summary: {
                total_products: countMap[row.id] || 0
            }
        }));

        const totalPages = Math.ceil(total / safeLimit);

        return {
            status: 'success',
            code: 200,
            message: 'Negocios obtenidos correctamente',
            data: rowsWithSummary,
            pagination: {
                page: currentPage,
                limit: safeLimit,
                total,
                total_pages: totalPages
            }
        };
    }

    async findActive(page = 1, limit = 10) {
        return this.findAll({
            page,
            limit,
            filters: {status: 'active'},
            orderBy: 'created_at',
            orderDirection: 'DESC'
        });
    }

    // TODO(auth): cuando se reactive auth, reemplazar por findAll({ filters: { owner_id: ownerId } })
    // async findByOwner(ownerId, page = 1, limit = 10) {
    //     return this.findAll({page, limit, filters: {owner_id: ownerId}});
    // }

    async suspend(id, reason /*, ownerId */) {
        const record = await this.findById(id);

        if (!record) {
            throw new Error('Negocio no encontrado');
        }

        // TODO(auth): validar propiedad antes de permitir suspender

        return record.update({status: 'suspended', suspension_reason: reason || null});
    }

    async reactivate(id /*, ownerId */) {
        const record = await this.findById(id);

        if (!record) {
            throw new Error('Negocio no encontrado');
        }

        // TODO(auth): validar propiedad antes de permitir reactivar

        return record.update({status: 'active', suspension_reason: null});
    }

    async incrementMetrics(id, {totalProducts = 0, totalOrders = 0, totalRevenue = 0} = {}) {
        const {literal} = require('sequelize');

        await this.model.update(
            {
                total_products: literal(`total_products + ${Number(totalProducts)}`),
                total_orders: literal(`total_orders + ${Number(totalOrders)}`),
                total_revenue: literal(`total_revenue + ${Number(totalRevenue)}`),
                last_activity_at: new Date()
            },
            {where: {id}}
        );

        return this.findById(id);
    }

    _buildFilters(filters) {
        const where = {};

        if (filters.name) {
            where.name = {[Op.like]: `%${filters.name}%`};
        }

        if (filters.category) {
            where.category = filters.category;
        }

        if (filters.status) {
            where.status = filters.status;
        }

        // TODO(auth): filtrar por dueño cuando se reactive auth
        // if (filters.owner_id) {
        //     where.owner_id = filters.owner_id;
        // }

        if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
            where.id = {[Op.in]: filters.ids};
        }

        return where;
    }

    async getStats() {
        // 1 sola query agrupando por 'status' en vez de N queries secuenciales
        const grouped = await this.model.count({group: ['status']});

        const stats = {total: 0, active: 0, inactive: 0, pending: 0, suspended: 0};

        grouped.forEach(({status, count}) => {
            stats.total += count;
            if (stats[status] !== undefined) {
                stats[status] += count;
            }
        });

        return stats;
    }

    async searchByName(query, limit = 10) {
        const where = {
            name: {[Op.like]: `%${query}%`},
            status: 'active'
        };

        // raw:true evita la hidratación de instancias, ya que solo se devuelve JSON plano
        const rows = await this.model.findAll({
            where,
            limit: Math.min(limit, 50),
            order: [['name', 'ASC']],
            raw: true
        });

        return rows;
    }

    /**
     * Convierte "Mi Negocio Genial!" -> "mi-negocio-genial"
     */
    _slugify(text) {
        return text
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // quita tildes
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
    }

    /**
     * Genera un slug único agregando un sufijo numérico si ya existe.
     * paranoid:false para no reciclar el slug de un negocio borrado
     * (soft delete) que aún podría restaurarse.
     */
    async _generateUniqueSlug(name, excludeId = null) {
        const base = this._slugify(name) || 'negocio';
        let slug = base;
        let counter = 1;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const where = {slug};
            if (excludeId) where.id = {[Op.ne]: excludeId};

            const exists = await this.model.findOne({where, paranoid: false});
            if (!exists) break;

            counter++;
            slug = `${base}-${counter}`;
        }

        return slug;
    }
}

module.exports = BusinessService;