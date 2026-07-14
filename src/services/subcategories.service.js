const {Op} = require('sequelize');

class SubcategoryService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.model = sequelizeInstance.models.Subcategory;

        if (!this.model) {
            const availableModels = Object.keys(sequelizeInstance.models).join(', ');
            throw new Error(`Modelo Subcategory no encontrado. Modelos disponibles: ${availableModels}`);
        }
    }

    async create(data) {
        // Verificar que la categoría existe
        const category = await this.sequelize.models.Category.findByPk(data.category_id);
        if (!category) {
            throw new Error('La categoría especificada no existe');
        }
        return this.model.create(data);
    }

    async update(id, data) {
        // findById (con include de Category) y la verificación de la nueva categoría
        // (si aplica) son independientes -> se paralelizan
        const [record, newCategory] = await Promise.all([
            this.findById(id),
            data.category_id
                ? this.sequelize.models.Category.findByPk(data.category_id)
                : Promise.resolve(null)
        ]);

        if (!record) {
            throw new Error('Subcategoría no encontrada');
        }

        if (data.category_id && !newCategory) {
            throw new Error('La categoría especificada no existe');
        }

        return await record.update(data);
    }

    async delete(id) {
        // Para eliminar solo necesitamos confirmar existencia (findByPk, sin el JOIN
        // de Category que trae findById) y el conteo de productos -> se paralelizan
        const [record, productCount] = await Promise.all([
            this.model.findByPk(id),
            this.sequelize.models.Product.count({where: {subcategory_id: id}})
        ]);

        if (!record) {
            throw new Error('Subcategoría no encontrada');
        }

        if (productCount > 0) {
            throw new Error(`No se puede eliminar la subcategoría porque tiene ${productCount} producto(s) asociado(s). Elimina o reasigna los productos primero.`);
        }

        await record.destroy();

        return {
            deleted: true,
            message: 'Subcategoría eliminada correctamente'
        };
    }

    async findById(id) {
        return await this.model.findByPk(id, {
            include: [
                {
                    model: this.sequelize.models.Category,
                    as: 'category',
                    attributes: ['id', 'name']
                }
            ]
        });
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

        // count y findAll son independientes -> se paralelizan
        const [total, rows] = await Promise.all([
            this.model.count({where}),
            this.model.findAll({
                where,
                limit: safeLimit,
                offset,
                order: [[orderBy, orderDirection]],
                include: [
                    {
                        model: this.sequelize.models.Category,
                        as: 'category',
                        attributes: ['id', 'name']
                    }
                ]
            })
        ]);

        const totalPages = Math.ceil(total / safeLimit);

        return {
            status: 'success',
            code: 200,
            message: 'Subcategorías obtenidas correctamente',
            data: rows.map(r => r.toJSON()),
            pagination: {
                page: currentPage,
                limit: safeLimit,
                total,
                total_pages: totalPages
            }
        };
    }

    async findByCategory(categoryId, page = 1, limit = 10) {
        return this.findAll({
            page,
            limit,
            filters: {category_id: categoryId, active: true},
            orderBy: 'priority',
            orderDirection: 'ASC'
        });
    }

    async findBySubCategories(businessId, page = 1, limit = 10, filters = {}) {
        return this.findAll({
            page,
            limit,
            filters: {...filters, business_id: businessId}
        });
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

    _buildFilters(filters) {
        const where = {};

        if (filters.name) {
            where.name = {[Op.like]: `%${filters.name}%`};
        }

        if (filters.category_id) {
            where.category_id = filters.category_id;
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
        // Antes: 3 queries secuenciales (total, active, inactive) + byCategory después.
        // Ahora: 1 query agrupada por 'active' + byCategory en paralelo.
        const [grouped, byCategory] = await Promise.all([
            this.model.count({group: ['active']}),
            this.model.findAll({
                attributes: [
                    'category_id',
                    [this.sequelize.fn('COUNT', this.sequelize.col('category_id')), 'count']
                ],
                group: ['category_id'],
                include: [
                    {
                        model: this.sequelize.models.Category,
                        as: 'category',
                        attributes: ['name']
                    }
                ],
                raw: true
            })
        ]);

        const stats = {total: 0, active: 0, inactive: 0};

        grouped.forEach(({active, count}) => {
            const c = Number(count);
            stats.total += c;
            if (active === true || active === 1) {
                stats.active += c;
            } else {
                stats.inactive += c;
            }
        });

        return {
            ...stats,
            by_category: byCategory
        };
    }

    async searchByName(query, limit = 10) {
        const where = {
            name: {[Op.like]: `%${query}%`},
            active: true
        };

        const rows = await this.model.findAll({
            where,
            limit: Math.min(Number(limit) || 10, 50),
            order: [['name', 'ASC']],
            include: [
                {
                    model: this.sequelize.models.Category,
                    as: 'category',
                    attributes: ['id', 'name']
                }
            ]
        });

        return rows.map(r => r.toJSON());
    }
}

module.exports = SubcategoryService;