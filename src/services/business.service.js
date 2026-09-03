const {Op} = require('sequelize');
const boom = require('@hapi/boom');
const {safeDestroy} = require('../middlewares/upload.handler');

function rejectInlineMedia(data) {
    const next = {...data};
    const keys = ['logo', 'banner', 'logo_public_id', 'banner_public_id'];
    for (const key of keys) {
        const value = next[key];
        if (typeof value === 'string' && (value.startsWith('data:') || value.length > 2048)) {
            delete next[key];
        }
    }
    return next;
}

class BusinessService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.model = sequelizeInstance.models.Business;

        if (!this.model) {
            const availableModels = Object.keys(sequelizeInstance.models).join(', ');
            throw new Error(`Modelo Business no encontrado. Modelos disponibles: ${availableModels}`);
        }
    }

    async create(data) {
        data = rejectInlineMedia({...data});

        const name = data?.name?.trim();

        if (!name || name.length < 2) {
            throw boom.badRequest('El nombre del negocio es obligatorio y debe tener al menos 2 caracteres.');
        }

        data.name = name;

        const nameTaken = await this._isNameTaken(data.name);
        if (nameTaken) {
            throw boom.conflict('Ya existe un negocio registrado con ese nombre.');
        }

        data.slug = await this._generateUniqueSlug(data.name);
        return this.model.create(data);
    }

    async update(id, data) {
        data = rejectInlineMedia({...data});

        const record = await this.findById(id);
        if (!record) {
            throw boom.notFound('Negocio no encontrado');
        }

        delete data.owner_id;
        delete data.status;
        delete data.total_products;
        delete data.total_orders;
        delete data.total_revenue;

        if (data.name) {
            data.name = data.name.trim();

            const nameTaken = await this._isNameTaken(data.name, id);
            if (nameTaken) {
                throw boom.conflict('Ya existe otro negocio registrado con ese nombre.');
            }

            data.slug = await this._generateUniqueSlug(data.name, id);
        }

        return record.update(data);
    }

    async _isNameTaken(name, excludeId = null) {
        const where = {name: {[Op.iLike]: name}};
        if (excludeId) where.id = {[Op.ne]: excludeId};

        const exists = await this.model.findOne({where, paranoid: false});
        return !!exists;
    }

    async delete(id) {
        const record = await this.findById(id);

        if (!record) {
            return {
                status: 'error',
                code: 404,
                message: 'Negocio no encontrado',
            };
        }

        const logoPublicId = record.logo_public_id;
        const bannerPublicId = record.banner_public_id;

        await record.destroy();

        await safeDestroy(logoPublicId);
        await safeDestroy(bannerPublicId);

        return {
            status: 'success',
            code: 200,
            message: 'Negocio eliminado correctamente',
            data: [],
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
                      where = {},
                      orderBy = 'created_at',
                      orderDirection = 'DESC',
                  } = {}) {
        const safeLimit = Math.min(Number(limit) || 10, 100);
        const currentPage = Number(page) || 1;
        const offset = (currentPage - 1) * safeLimit;

        const filters = this._buildFilters(where);

        const [total, rows] = await Promise.all([
            this.model.count({where: filters}),
            this.model.findAll({
                where: filters,
                limit: safeLimit,
                offset,
                order: [[orderBy, orderDirection]],
                raw: true,
            }),
        ]);

        const businessIds = rows.map((r) => r.id);
        let productCounts = [];
        const ProductModel = this.sequelize.models.Product;

        if (businessIds.length && ProductModel) {
            productCounts = await ProductModel.findAll({
                attributes: [
                    'business_id',
                    [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'total_products'],
                ],
                where: {business_id: businessIds},
                group: ['business_id'],
                raw: true,
            });
        }

        const countMap = productCounts.reduce((acc, item) => {
            acc[item.business_id] = Number(item.total_products);
            return acc;
        }, {});

        const rowsWithSummary = rows.map((row) => ({
            ...row,
            summary: {
                total_products: countMap[row.id] || 0,
            },
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
                total_pages: totalPages,
            },
        };
    }

    async findActive(page = 1, limit = 10) {
        return this.findAll({
            page,
            limit,
            where: {status: 'active'},
            orderBy: 'created_at',
            orderDirection: 'DESC',
        });
    }

    async suspend(id, reason) {
        const record = await this.findById(id);
        if (!record) {
            throw new Error('Negocio no encontrado');
        }
        return record.update({status: 'suspended', suspension_reason: reason || null});
    }

    async reactivate(id) {
        const record = await this.findById(id);
        if (!record) {
            throw new Error('Negocio no encontrado');
        }
        return record.update({status: 'active', suspension_reason: null});
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
        if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
            where.id = {[Op.in]: filters.ids};
        }

        return where;
    }

    async getStats() {
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
            status: 'active',
        };

        return this.model.findAll({
            where,
            limit: Math.min(limit, 50),
            order: [['name', 'ASC']],
            raw: true,
        });
    }

    _slugify(text) {
        return text
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
    }

    async _generateUniqueSlug(name, excludeId = null) {
        const base = this._slugify(name) || 'negocio';
        let slug = base;
        let counter = 1;

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