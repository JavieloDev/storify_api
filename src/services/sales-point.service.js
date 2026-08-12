// src/services/salesPoint.service.js
const {Op} = require('sequelize');

class SalesPointService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.model = sequelizeInstance.models.SalesPoint;

        if (!this.model) {
            const availableModels = Object.keys(sequelizeInstance.models).join(', ');
            throw new Error(`Modelo SalesPoint no encontrado. Modelos disponibles: ${availableModels}`);
        }
    }

    async _assertBusinessActive(businessId) {
        const business = await this.sequelize.models.Business.findByPk(businessId, {
            attributes: ['id', 'status']
        });
        if (!business) {
            throw new Error('El negocio especificado no existe');
        }
        if (business.status !== 'active') {
            throw new Error('El negocio especificado no está activo');
        }
    }

    async create(data) {
        if (data.business_id) {
            await this._assertBusinessActive(data.business_id);
        }
        return this.model.create(data);
    }

    async update(id, data) {
        if (data.business_id) {
            await this._assertBusinessActive(data.business_id);
        }

        const found = await this.findById(id);
        if (!found.data) {
            throw new Error('Punto de venta no encontrado');
        }
        return await found.data.update(data);
    }

    async delete(id) {
        const found = await this.findById(id);

        if (!found.data) {
            return {
                status: 'error',
                code: 404,
                message: 'Punto de venta no encontrado'
            };
        }

        await found.data.destroy();

        return {
            status: 'success',
            code: 200,
            message: 'Punto de venta eliminado correctamente',
            data: []
        };
    }

    async findById(id, {withRelations = false} = {}) {
        const include = withRelations ? [
            {
                model: this.sequelize.models.Product,
                as: 'products',
                attributes: ['id', 'name', 'sales_price', 'image', 'quantity', 'brand'],
                through: {attributes: ['assigned_quantity', 'active', 'custom_price']}
            },
            {
                model: this.sequelize.models.SalesPointUser,
                as: 'assignedUsers',
                attributes: ['id', 'user_id', 'user_name', 'role', 'active']
            }
        ] : [];

        const record = await this.model.findByPk(id, {include});

        if (!record) {
            return {
                status: 'error',
                code: 404,
                message: 'Punto de venta no encontrado',
                data: null
            };
        }

        const plain = record.toJSON ? record.toJSON() : record;

        // 🔥 Aplanar productos también en findById
        const formattedProducts = (plain.products || []).map(product => {
            const pivot = product.SalesPointProduct || {};
            const {SalesPointProduct, ...productData} = product;
            return {
                ...productData,
                assigned_quantity: pivot.assigned_quantity || 0,
                active: pivot.active !== undefined ? pivot.active : true,
                custom_price: pivot.custom_price || null,
            };
        });

        const formattedData = {
            ...plain,
            products: formattedProducts,
            assignedUsers: plain.assignedUsers || [],
        };

        return {
            status: 'success',
            code: 200,
            message: 'Punto de venta obtenido correctamente',
            data: formattedData
        };
    }

    async findByBusiness(businessId, page = 1, limit = 10, filters = {}) {
        const safeLimit = Math.min(Number(limit) || 10, 100);
        const currentPage = Number(page) || 1;
        const offset = (currentPage - 1) * safeLimit;

        const where = {business_id: businessId};
        if (filters.name) {
            where.name = {[Op.like]: `%${filters.name}%`};
        }
        if (filters.status) {
            where.status = filters.status;
        }

        const {count, rows} = await this.model.findAndCountAll({
            where,
            limit: safeLimit,
            offset,
            order: [['name', 'ASC']],
            include: [
                {
                    model: this.sequelize.models.Product,
                    as: 'products',
                    required: false,
                    attributes: ['id', 'name', 'sales_price', 'image', 'quantity', 'brand'],
                    through: {
                        attributes: ['assigned_quantity', 'active', 'custom_price']
                    }
                },
                {
                    model: this.sequelize.models.SalesPointUser,
                    as: 'assignedUsers',
                    required: false,
                    attributes: ['id', 'user_id', 'user_name', 'role', 'active']
                }
            ],
            nest: true,
        });

        const formattedRows = rows.map(record => {
            const plain = record.toJSON ? record.toJSON() : record;
            const {products, assignedUsers, ...rest} = plain;

            // 🔥 Aplanar: mover los datos de SalesPointProduct al nivel del producto
            const formattedProducts = (products || []).map(product => {
                // Los datos de la tabla intermedia están en product.SalesPointProduct
                const pivot = product.SalesPointProduct || {};

                // Eliminar el objeto anidado SalesPointProduct
                const {SalesPointProduct, ...productData} = product;

                // Devolver el producto con los datos del pivot al mismo nivel
                return {
                    ...productData,
                    assigned_quantity: pivot.assigned_quantity || 0,
                    active: pivot.active !== undefined ? pivot.active : true,
                    custom_price: pivot.custom_price || null,
                };
            });

            return {
                ...rest,
                products: formattedProducts,
                users: assignedUsers || [],
            };
        });

        return {
            status: 'success',
            code: 200,
            message: 'Puntos de venta obtenidos correctamente',
            data: formattedRows,
            pagination: {
                page: currentPage,
                limit: safeLimit,
                total: count,
                total_pages: Math.ceil(count / safeLimit)
            }
        };
    }


    /**
     * Cantidad ya asignada de un producto en OTROS puntos de venta
     * (excluyendo, opcionalmente, uno en particular — útil al recalcular
     * el propio punto de venta que se está editando).
     * Debe llamarse dentro de una transacción con `t` para que el lock
     * (FOR UPDATE vía `lock: true`) sea efectivo.
     */
    async _getAssignedElsewhere(productId, excludeSalesPointId, t) {
        const result = await this.sequelize.models.SalesPointProduct.sum('assigned_quantity', {
            where: {
                product_id: productId,
                ...(excludeSalesPointId ? {sales_point_id: {[Op.ne]: excludeSalesPointId}} : {}),
            },
            transaction: t,
        });
        return Number(result) || 0;
    }

    /**
     * Valida que la cantidad total asignada de un producto (sumando todos
     * los puntos de venta, incluyendo la nueva/actualizada) no supere el
     * stock real en PRODUCTS. Lanza error descriptivo si se excede.
     * `lock: t.LOCK.UPDATE` bloquea la fila del producto durante la
     * transacción para que dos asignaciones concurrentes no lean el mismo
     * stock "disponible" y ambas pasen la validación.
     */
    async _assertQuantityAvailable(productId, salesPointId, requestedQuantity, t) {
        const product = await this.sequelize.models.Product.findByPk(productId, {
            attributes: ['id', 'name', 'quantity'],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!product) {
            throw new Error(`El producto ${productId} no existe`);
        }

        const assignedElsewhere = await this._getAssignedElsewhere(productId, salesPointId, t);
        const available = Number(product.quantity) - assignedElsewhere;

        if (requestedQuantity > available) {
            throw new Error(
                `No se puede asignar ${requestedQuantity} unidad(es) de "${product.name}" al punto de venta: ` +
                `stock total ${product.quantity}, ya asignado en otros puntos de venta ${assignedElsewhere}, ` +
                `disponible ${Math.max(available, 0)}.`
            );
        }
    }

    /**
     * Reemplaza el set completo de productos asignados a un punto de venta,
     * validando stock disponible por producto antes de aplicar el cambio.
     * `products`: [{ product_id, assigned_quantity, active?, custom_price? }]
     */
    async setProducts(salesPointId, products = []) {
        const found = await this.findById(salesPointId);
        if (!found.data) {
            throw new Error('Punto de venta no encontrado');
        }

        // Normalizamos primero para validar todo antes de tocar la DB.
        const normalized = products.map((p) => {
            const productId = typeof p === 'string' ? p : p.product_id;
            const assignedQuantity = typeof p === 'object' ? Number(p.assigned_quantity) || 0 : 0;

            if (assignedQuantity < 0) {
                throw new Error(`La cantidad asignada para el producto ${productId} no puede ser negativa`);
            }

            return {
                product_id: productId,
                active: typeof p === 'object' && p.active !== undefined ? p.active : true,
                custom_price: typeof p === 'object' ? (p.custom_price ?? null) : null,
                assigned_quantity: assignedQuantity,
            };
        });

        return this.sequelize.transaction(async (t) => {
            // Validar cada producto (secuencial dentro de la tx para respetar los locks)
            for (const item of normalized) {
                await this._assertQuantityAvailable(item.product_id, salesPointId, item.assigned_quantity, t);
            }

            await this.sequelize.models.SalesPointProduct.destroy({
                where: {sales_point_id: salesPointId},
                transaction: t
            });

            if (normalized.length === 0) return [];

            const rows = normalized.map((item) => ({
                sales_point_id: salesPointId,
                ...item,
            }));

            return this.sequelize.models.SalesPointProduct.bulkCreate(rows, {transaction: t});
        });
    }

    /**
     * Asigna/actualiza UN producto puntual sin tocar el resto del set
     * (alternativa incremental a setProducts, útil si el UI edita de a uno).
     */
    async assignProduct(salesPointId, {product_id, assigned_quantity = 0, active = true, custom_price = null}) {
        const found = await this.findById(salesPointId);
        if (!found.data) {
            throw new Error('Punto de venta no encontrado');
        }

        if (assigned_quantity < 0) {
            throw new Error('La cantidad asignada no puede ser negativa');
        }

        return this.sequelize.transaction(async (t) => {
            await this._assertQuantityAvailable(product_id, salesPointId, assigned_quantity, t);

            const [row] = await this.sequelize.models.SalesPointProduct.upsert(
                {
                    sales_point_id: salesPointId,
                    product_id,
                    assigned_quantity,
                    active,
                    custom_price,
                },
                {transaction: t, conflictFields: ['sales_point_id', 'product_id']}
            );

            return row;
        });
    }

    async removeProduct(salesPointId, productId) {
        const deleted = await this.sequelize.models.SalesPointProduct.destroy({
            where: {sales_point_id: salesPointId, product_id: productId}
        });
        return deleted > 0;
    }

    /**
     * Cantidad disponible de un producto para nuevas asignaciones (stock
     * total - ya asignado en todos los puntos de venta). Útil para que el
     * front muestre el máximo permitido en el input antes de enviar.
     */
    async getAvailableQuantity(productId, excludeSalesPointId = null) {
        const product = await this.sequelize.models.Product.findByPk(productId, {
            attributes: ['id', 'name', 'quantity']
        });
        if (!product) {
            throw new Error('Producto no encontrado');
        }

        const assignedElsewhere = await this._getAssignedElsewhere(productId, excludeSalesPointId, null);

        return {
            product_id: product.id,
            product_name: product.name,
            total_quantity: Number(product.quantity),
            assigned_elsewhere: assignedElsewhere,
            available: Math.max(Number(product.quantity) - assignedElsewhere, 0),
        };
    }

    async setUsers(salesPointId, users = []) {
        const found = await this.findById(salesPointId);
        if (!found.data) {
            throw new Error('Punto de venta no encontrado');
        }

        return this.sequelize.transaction(async (t) => {
            await this.sequelize.models.SalesPointUser.destroy({
                where: {sales_point_id: salesPointId},
                transaction: t
            });

            if (users.length === 0) return [];

            const rows = users.map((u) => ({
                sales_point_id: salesPointId,
                user_id: u.user_id,
                user_name: u.user_name || null,
                role: u.role || 'staff',
                active: u.active !== undefined ? u.active : true,
            }));

            return this.sequelize.models.SalesPointUser.bulkCreate(rows, {transaction: t});
        });
    }

    async removeUser(salesPointId, userId) {
        const deleted = await this.sequelize.models.SalesPointUser.destroy({
            where: {sales_point_id: salesPointId, user_id: userId}
        });
        return deleted > 0;
    }
}

module.exports = SalesPointService;