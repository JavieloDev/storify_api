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
                      filters = {}
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
                order: [['created_at', 'DESC']],
                include: [
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
                ],
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
            pagination: {
                page: currentPage,
                limit: safeLimit,
                total,
                total_pages: totalPages
            }
        };
    }

    // ✅ FIX: ahora recibe 'file' y lo agrega a 'data' antes de crear
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

        // ✅ Si se subió un archivo, guardamos la ruta relativa en 'image'
        if (file) {
            data.image = `/uploads/${file.filename}`;
        }

        return this.model.create(data);
    }

    // ✅ FIX: ahora recibe 'file' y lo agrega a 'data' antes de actualizar
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

        // ✅ Si se subió un archivo nuevo, actualizamos la ruta y borramos la imagen anterior
        if (file) {
            const oldImage = record.image;
            data.image = `/uploads/${file.filename}`;

            if (oldImage) {
                const path = require('path');
                const fsp = require('fs/promises');
                const oldImagePath = path.join(__dirname, '..', '..', oldImage);
                try {
                    await fsp.unlink(oldImagePath);
                } catch {
                    // la imagen anterior ya no existe, no pasa nada
                }
            }
        }

        return await record.update(data);
    }

    // product.service.js
    async delete(id) {
        // Solo necesitamos el campo 'image', no el registro completo con sus includes
        const record = await this.model.findByPk(id, {attributes: ['id', 'image']});
        if (!record) {
            throw new Error('Producto no encontrado');
        }

        const deletedCount = await this.model.destroy({where: {id}});
        if (deletedCount === 0) {
            throw new Error('Producto no encontrado');
        }

        // Borrar la imagen del disco después de confirmar el delete en DB
        if (record.image) {
            const path = require('path');
            const fsp = require('fs/promises');
            const imagePath = path.join(__dirname, '..', '..', record.image);
            try {
                await fsp.unlink(imagePath);
            } catch {
                // la imagen ya no existe o no se pudo borrar, no bloquea el flujo
            }
        }

        return {deleted: true};
    }

    async findById(id) {
        return await this.model.findByPk(id, {
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
    }

    async findBySubcategory(subcategoryId, page = 1, limit = 10) {
        return this.findAll({
            page,
            limit,
            filters: {subcategory_id: subcategoryId, is_active: true}
        });
    }

    async findByBusiness(businessId, page = 1, limit = 10, filters = {}) {
        return this.findAll({
            page,
            limit,
            filters: {...filters, business_id: businessId}
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