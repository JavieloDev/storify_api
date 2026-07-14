const {Op} = require('sequelize');

class CategoryService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.model = sequelizeInstance.models.Category;

        if (!this.model) {
            const availableModels = Object.keys(sequelizeInstance.models).join(', ');
            throw new Error(`Modelo Category no encontrado. Modelos disponibles: ${availableModels}`);
        }
    }

    async create(data) {
        if (data.business_id) {
            const business = await this.sequelize.models.Business.findByPk(data.business_id, {
                attributes: ['id', 'status']
            });
            if (!business) {
                throw new Error('El negocio especificado no existe');
            }
            if (business.status !== 'active') {
                throw new Error('El negocio especificado no está activo');
            }
        }

        return this.model.create(data);
    }

    async update(id, data) {
        if (data.business_id) {
            const business = await this.sequelize.models.Business.findByPk(data.business_id, {
                attributes: ['id', 'status']
            });
            if (!business) {
                throw new Error('El negocio especificado no existe');
            }
            if (business.status !== 'active') {
                throw new Error('El negocio especificado no está activo');
            }
        }

        const record = await this.findById(id);
        if (!record) {
            throw new Error('Categoría no encontrada');
        }
        return await record.update(data);
    }

    async delete(id) {
        const [record, subcategoryCount] = await Promise.all([
            this.findById(id),
            this.sequelize.models.Subcategory.count({where: {category_id: id}})
        ]);

        if (!record) {
            return {
                status: 'error',
                code: 404,
                message: 'Categoría no encontrada'
            };
        }

        if (subcategoryCount > 0) {
            return {
                status: 'error',
                code: 422,
                message: `No se puede eliminar la categoría porque tiene ${subcategoryCount} subcategoría(s) asociada(s). Elimina o reasigna las subcategorías primero.`
            };
        }

        await record.destroy();
        return {
            status: 'success',
            code: 200,
            message: 'Categoría eliminada correctamente',
            data: []
        };
    }

    async findById(id) {
        return await this.model.findByPk(id);
    }

    async findAll({
                      page = 1,
                      limit = 10,
                      filters = {},
                      orderBy = 'priority',
                      orderDirection = 'ASC'
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

        const totalPages = Math.ceil(total / safeLimit);

        return {
            status: 'success',
            code: 200,
            message: 'Categorías obtenidas correctamente',
            data: rows,
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
            filters: {active: true},
            orderBy: 'priority',
            orderDirection: 'ASC'
        });
    }

    async findByCategories(businessId, page = 1, limit = 10,filters={}) {
        return this.findAll({
            page,
            limit,
            filters: {...filters, business_id: businessId}
        });
    }

    async findWithSubcategory(page = 1, limit = 10) {
        const {Subcategory} = this.sequelize.models;

        const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : Number(limit);
        const parsedPage = typeof page === 'string' ? parseInt(page, 10) : Number(page);

        const safeLimit = Math.min(parsedLimit || 10, 100);
        const currentPage = parsedPage || 1;
        const offset = (currentPage - 1) * safeLimit;
        const where = {active: true};

        const [total, rows] = await Promise.all([
            this.model.count({where}),
            this.model.findAll({
                where,
                limit: safeLimit,
                offset,
                order: [['priority', 'ASC']],
                include: [
                    {
                        model: Subcategory,
                        as: 'products',
                        attributes: ['id', 'name', 'price', 'image'],
                        limit: 5,
                        required: false
                    }
                ]
            })
        ]);

        const totalPages = Math.ceil(total / safeLimit);

        return {
            status: 'success',
            code: 200,
            message: 'Categorías con productos obtenidas correctamente',
            data: rows.map(r => r.toJSON()),
            pagination: {
                page: currentPage,
                limit: safeLimit,
                total,
                total_pages: totalPages
            }
        };
    }

    _buildFilters(filters) {
        const where = {};

        if (filters.name) {
            where.name = {[Op.like]: `%${filters.name}%`};
        }

        if (filters.business_id) {
            where.business_id = filters.business_id;
        }

        if (filters.active !== undefined && filters.active !== null) {
            where.active = filters.active === true || filters.active === 'true';
        }

        if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
            where.id = {[Op.in]: filters.ids};
        }

        return where;
    }

    async getStats() {
        // Antes: 3 queries secuenciales (total, active, inactive)
        // Ahora: 1 sola query agrupando por 'active'
        const grouped = await this.model.count({group: ['active']});

        const stats = {total: 0, active: 0, inactive: 0};

        grouped.forEach(({active, count}) => {
            stats.total += count;
            if (active === true || active === 1) {
                stats.active += count;
            } else {
                stats.inactive += count;
            }
        });

        return stats;
    }

    async searchByName(query, limit = 10) {
        const where = {
            name: {[Op.like]: `%${query}%`},
            active: true
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
}

module.exports = CategoryService;