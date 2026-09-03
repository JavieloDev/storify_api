const {Op} = require('sequelize');
const {safeDestroy} = require('../middlewares/upload.handler');

function rejectInlineImage(data) {
    const next = {...data};
    if (typeof next.image === 'string' && (next.image.startsWith('data:') || next.image.length > 2048)) {
        delete next.image;
    }
    if (typeof next.thumbnail_url === 'string' && (next.thumbnail_url.startsWith('data:') || next.thumbnail_url.length > 2048)) {
        delete next.thumbnail_url;
    }
    return next;
}

function stockStatusFromStock(stock) {
    const n = Number(stock) || 0;
    if (n === 0) return 'out';
    if (n <= 2) return 'critical';
    if (n <= 5) return 'low';
    if (n <= 10) return 'medium';
    return 'in_stock';
}

class ProductService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.model = sequelizeInstance.models.Product;

        if (!this.model) {
            const availableModels = Object.keys(sequelizeInstance.models).join(', ');
            throw new Error(`Modelo Product no encontrado. Modelos disponibles: ${availableModels}`);
        }
    }

    async findAll({
                      page = 1,
                      limit = 10,
                      filters = {},
                      not_paginated = false,
                      since,
                  } = {}) {
        const safeLimit = Math.min(Number(limit) || 10, 100);
        const currentPage = Number(page) || 1;
        const offset = (currentPage - 1) * safeLimit;

        const where = this._buildFilters(filters);
        if (since) {
            where.updated_at = {[Op.gt]: new Date(since)};
        }

        const order = since ? [['updated_at', 'ASC']] : [['created_at', 'DESC']];

        const include = [
            {
                model: this.sequelize.models.Subcategory,
                as: 'subcategory',
                required: false,
                include: [
                    {
                        model: this.sequelize.models.Category,
                        as: 'category',
                        required: false,
                    },
                ],
            },
        ];

        if (!not_paginated) {
            const [total, rows] = await Promise.all([
                this.model.count({where}),
                this.model.findAll({
                    where,
                    limit: safeLimit,
                    offset,
                    order,
                    include,
                    raw: true,
                    nest: true,
                }),
            ]);
            const totalPages = Math.ceil(total / safeLimit);

            return {
                status: 'success',
                code: 200,
                message: 'Productos obtenidos correctamente',
                data: rows,
                pagination: {page: currentPage, limit: safeLimit, total, total_pages: totalPages},
            };
        }

        const rows = await this.model.findAll({
            where,
            order,
            include,
            raw: true,
            nest: true,
        });

        return {
            status: 'success',
            code: 200,
            message: 'Productos obtenidos correctamente',
            data: rows,
        };
    }

    async create(data, file) {
        data = rejectInlineImage({...data});

        if (data.business_id) {
            const business = await this.sequelize.models.Business.findByPk(data.business_id, {
                attributes: ['id', 'status'],
            });
            if (!business) throw new Error('El negocio especificado no existe');
            if (business.status !== 'active') throw new Error('El negocio especificado no está activo');
        }

        if (data.subcategory_id) {
            const subcategory = await this.sequelize.models.Subcategory.findByPk(data.subcategory_id, {
                attributes: ['id', 'active'],
            });
            if (!subcategory) throw new Error('La subcategoría especificada no existe');
            if (!subcategory.active) throw new Error('La subcategoría especificada no está activa');
        }

        if (data.stock !== undefined) {
            data.stock_status = stockStatusFromStock(data.stock);
        }

        if (file) {
            data.image = file.path;
            data.image_public_id = file.publicId;
            data.thumbnail_url = file.thumbnailUrl;
        }

        return this.model.create(data);
    }

    async update(id, data, file) {
        data = rejectInlineImage({...data});

        const record = await this.model.findByPk(id);
        if (!record) throw new Error('Producto no encontrado');

        if (data.business_id) {
            const business = await this.sequelize.models.Business.findByPk(data.business_id, {
                attributes: ['id', 'status'],
            });
            if (!business) throw new Error('El negocio especificado no existe');
            if (business.status !== 'active') throw new Error('El negocio especificado no está activo');
        }

        if (data.subcategory_id) {
            const subcategory = await this.sequelize.models.Subcategory.findByPk(data.subcategory_id, {
                attributes: ['id', 'active'],
            });
            if (!subcategory) throw new Error('La subcategoría especificada no existe');
            if (!subcategory.active) throw new Error('La subcategoría especificada no está activa');
        }

        if (data.stock !== undefined) {
            data.stock_status = stockStatusFromStock(data.stock);
        }

        if (file) {
            const oldPublicId = record.image_public_id;
            data.image = file.path;
            data.image_public_id = file.publicId;
            data.thumbnail_url = file.thumbnailUrl;
            await safeDestroy(oldPublicId);
        }

        return record.update(data);
    }

    async delete(id) {
        const record = await this.model.findByPk(id, {attributes: ['id', 'image_public_id']});
        if (!record) throw new Error('Producto no encontrado');

        const deletedCount = await this.model.destroy({where: {id}});
        if (deletedCount === 0) throw new Error('Producto no encontrado');

        await safeDestroy(record.image_public_id);
        return {deleted: true};
    }

    async findById(id) {
        const record = await this.model.findByPk(id, {
            include: [
                {
                    model: this.sequelize.models.Subcategory,
                    as: 'subcategory',
                    include: [
                        {
                            model: this.sequelize.models.Category,
                            as: 'category',
                        },
                    ],
                },
            ],
        });

        if (!record) {
            return {
                status: 'error',
                code: 404,
                message: 'Producto no encontrado',
                data: null,
            };
        }

        return {
            status: 'success',
            code: 200,
            message: 'Producto obtenido correctamente',
            data: record,
        };
    }

    async findBySubcategory(subcategoryId, page = 1, limit = 10) {
        return this.findAll({
            page,
            limit,
            filters: {subcategory_id: subcategoryId, is_active: true},
        });
    }

    async findByBusiness(businessId, page = 1, limit = 10, filters = {}, not_paginated, since) {
        return this.findAll({
            page,
            limit,
            filters: {...filters, business_id: businessId},
            not_paginated,
            since,
        });
    }

    _buildFilters(filters) {
        const where = {};

        if (filters.name) where.name = {[Op.like]: `%${filters.name}%`};
        if (filters.business_id) where.business_id = filters.business_id;
        if (filters.subcategory_id) where.subcategory_id = filters.subcategory_id;
        if (filters.brand) where.brand = {[Op.like]: `%${filters.brand}%`};
        if (filters.price_min) where.price = {[Op.gte]: Number(filters.price_min)};
        if (filters.price_max) {
            if (where.price) where.price[Op.lte] = Number(filters.price_max);
            else where.price = {[Op.lte]: Number(filters.price_max)};
        }
        if (filters.stock_min !== undefined || filters.quantity_min !== undefined) {
            const min = Number(filters.stock_min ?? filters.quantity_min);
            if (!isNaN(min)) where.stock = {[Op.gte]: min};
        }
        if (filters.has_discount !== undefined) {
            if (filters.has_discount === true || filters.has_discount === 'true') {
                where.discount = {[Op.gt]: 0};
            } else {
                where.discount = 0;
            }
        }
        if (filters.color) where.colors = {[Op.like]: `%${filters.color}%`};
        if (filters.is_active !== undefined && filters.is_active !== null) {
            where.is_active = filters.is_active === true || filters.is_active === 'true';
        }
        if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
            where.id = {[Op.in]: filters.ids};
        }

        return where;
    }

    async getStats() {
        const result = await this.model.findOne({
            attributes: [
                [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'total'],
                [this.sequelize.fn('COUNT', this.sequelize.literal(`CASE WHEN is_active = true THEN 1 END`)), 'active'],
                [this.sequelize.fn('COUNT', this.sequelize.literal(`CASE WHEN on_sale = true AND is_active = true THEN 1 END`)), 'on_sale'],
                [this.sequelize.fn('COUNT', this.sequelize.literal(`CASE WHEN featured = true AND is_active = true THEN 1 END`)), 'featured'],
            ],
            raw: true,
        });

        return {
            total: Number(result.total),
            active: Number(result.active),
            on_sale: Number(result.on_sale),
            featured: Number(result.featured),
        };
    }
}

module.exports = ProductService;