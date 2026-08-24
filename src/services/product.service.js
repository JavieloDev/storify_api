const {Op} = require('sequelize');

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
                      since
                  } = {}) {
        const safeLimit = Math.min(Number(limit) || 10, 100);
        const currentPage = Number(page) || 1;
        const offset = (currentPage - 1) * safeLimit;

        const where = this._buildFilters(filters);
        if (since) {
            where.updated_at = {[Op.gt]: new Date(since)};
        }

        // 🔧 nuevo: si es un pull incremental (viene `since`), ordenar por
        // updated_at ASC para que la paginación avance de forma estable aunque
        // se inserten/actualicen filas mientras se está paginando. Si no hay
        // `since` (listado normal del admin), se mantiene created_at DESC.
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
                    }
                ],
            }
        ];

        if (!not_paginated) {
            const [total, rows] = await Promise.all([
                this.model.count({where}),
                this.model.findAll({
                    where,
                    limit: safeLimit,
                    offset,
                    order, // 🔧 antes: hardcodeado a created_at DESC siempre
                    include,
                    raw: true,
                    nest: true,
                })
            ]);
            const totalPages = Math.ceil(total / safeLimit);

            return {
                status: 'success',
                code: 200,
                message: 'Productos obtenidos correctamente',
                data: rows,
                pagination: {page: currentPage, limit: safeLimit, total, total_pages: totalPages}
            };
        } else {
            const rows = await this.model.findAll({
                where,
                order, // 🔧 antes: hardcodeado a created_at DESC siempre
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
    }

    async create(data, file) {
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

        if (data.subcategory_id) {
            const subcategory = await this.sequelize.models.Subcategory.findByPk(data.subcategory_id, {
                attributes: ['id', 'active']
            });
            if (!subcategory) {
                throw new Error('La subcategoría especificada no existe');
            }

            if (!subcategory.active) {
                throw new Error('La subcategoría especificada no está activa');
            }
        }

        if (file) {
            data.image = `/uploads/${file.filename}`;
            // 🆕 mismo criterio que image: solo se setea si el thumbnail se generó
            if (file.thumbnailFilename) {
                data.thumbnail_url = `/uploads/${file.thumbnailFilename}`;
            }
        }

        return this.model.create(data);
    }

    async update(id, data, file) {
        const record = await this.model.findByPk(id);
        if (!record) {
            throw new Error('Producto no encontrado');
        }

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

        if (data.subcategory_id) {
            const subcategory = await this.sequelize.models.Subcategory.findByPk(data.subcategory_id, {
                attributes: ['id', 'active']
            });
            if (!subcategory) {
                throw new Error('La subcategoría especificada no existe');
            }
            if (!subcategory.active) {
                throw new Error('La subcategoría especificada no está activa');
            }
        }

        if (file) {
            const oldImage = record.image;
            const oldThumbnail = record.thumbnail_url; // 🆕

            data.image = `/uploads/${file.filename}`;
            if (file.thumbnailFilename) {
                data.thumbnail_url = `/uploads/${file.thumbnailFilename}`;
            }

            const path = require('path');
            const fsp = require('fs/promises');

            if (oldImage) {
                const oldImagePath = path.join(__dirname, '..', '..', oldImage);
                try {
                    await fsp.unlink(oldImagePath);
                } catch {
                    // la imagen anterior ya no existe, no pasa nada
                }
            }

            // 🆕 mismo criterio de limpieza para el thumbnail viejo
            if (oldThumbnail) {
                const oldThumbnailPath = path.join(__dirname, '..', '..', oldThumbnail);
                try {
                    await fsp.unlink(oldThumbnailPath);
                } catch {
                    // el thumbnail anterior ya no existe, no pasa nada
                }
            }
        }

        return await record.update(data);
    }

    async delete(id) {
        // 🔧 antes: attributes: ['id', 'image']. Ahora también thumbnail_url.
        const record = await this.model.findByPk(id, {attributes: ['id', 'image', 'thumbnail_url']});
        if (!record) {
            throw new Error('Producto no encontrado');
        }

        const deletedCount = await this.model.destroy({where: {id}});
        if (deletedCount === 0) {
            throw new Error('Producto no encontrado');
        }

        const path = require('path');
        const fsp = require('fs/promises');

        if (record.image) {
            const imagePath = path.join(__dirname, '..', '..', record.image);
            try {
                await fsp.unlink(imagePath);
            } catch {
                // la imagen ya no existe o no se pudo borrar, no bloquea el flujo
            }
        }

        // 🆕 mismo criterio para el thumbnail
        if (record.thumbnail_url) {
            const thumbnailPath = path.join(__dirname, '..', '..', record.thumbnail_url);
            try {
                await fsp.unlink(thumbnailPath);
            } catch {
                // el thumbnail ya no existe o no se pudo borrar, no bloquea el flujo
            }
        }

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
                            as: 'category'
                        }
                    ]
                }
            ]
        });

        if (!record) {
            return {
                status: 'error',
                code: 404,
                message: 'Producto no encontrado',
                data: null
            };
        }

        return {
            status: 'success',
            code: 200,
            message: 'Producto obtenido correctamente',
            data: record
        };
    }

    async findBySubcategory(subcategoryId, page = 1, limit = 10) {
        return this.findAll({
            page,
            limit,
            filters: {subcategory_id: subcategoryId, is_active: true}
        });
    }

    // 🔧 antes: firma no tenía `since`, así que el que le pasaban las rutas
    // (5to argumento posicional) caía afuera silenciosamente
    async findByBusiness(businessId, page = 1, limit = 10, filters = {}, not_paginated, since) {
        return this.findAll({
            page,
            limit,
            filters: {...filters, business_id: businessId},
            not_paginated,
            since
        });
    }

    _buildFilters(filters) {
        const where = {};

        if (filters.name) {
            where.name = {[Op.like]: `%${filters.name}%`};
        }
        if (filters.business_id) {
            where.business_id = filters.business_id;
        }
        if (filters.subcategory_id) {
            where.subcategory_id = filters.subcategory_id;
        }
        if (filters.brand) {
            where.brand = {[Op.like]: `%${filters.brand}%`};
        }
        if (filters.price_min) {
            where.price = {[Op.gte]: Number(filters.price_min)};
        }
        if (filters.price_max) {
            if (where.price) {
                where.price[Op.lte] = Number(filters.price_max);
            } else {
                where.price = {[Op.lte]: Number(filters.price_max)};
            }
        }
        if (filters.quantity_min) {
            where.quantity = {[Op.gte]: Number(filters.quantity_min)};
        }
        if (filters.has_discount !== undefined) {
            if (filters.has_discount === true || filters.has_discount === 'true') {
                where.discount = {[Op.gt]: 0};
            } else {
                where.discount = 0;
            }
        }
        if (filters.color) {
            where.colors = {[Op.like]: `%${filters.color}%`};
        }
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
            raw: true
        });

        return {
            total: Number(result.total),
            active: Number(result.active),
            on_sale: Number(result.on_sale),
            featured: Number(result.featured)
        };
    }
}

module.exports = ProductService;