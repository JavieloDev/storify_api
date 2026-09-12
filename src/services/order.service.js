const {Op} = require('sequelize');
const {stockStatusFromStock} = require('./product.service');

class OrderService {
    static AUTO_PAYMENT_REFERENCE = 'Registro automático desde total de orden';

    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.model = sequelizeInstance.models.Order;
        this.itemModel = sequelizeInstance.models.OrderItem;

        if (!this.model) {
            const availableModels = Object.keys(sequelizeInstance.models).join(', ');
            throw new Error(`Modelo Order no encontrado. Modelos disponibles: ${availableModels}`);
        }
    }

    _includeItems() {
        return [
            {
                model: this.sequelize.models.OrderItem,
                as: 'items',
                include: [
                    {
                        model: this.sequelize.models.Product,
                        as: 'product',
                        required: false,
                    }
                ]
            },
            {
                model: this.sequelize.models.OrderPayment,
                as: 'payments',
                required: false,
            },
            {
                model: this.sequelize.models.Business,
                as: 'business',
                required: false,
            }
        ];
    }

    _wrapSingle(data, message) {
        return {
            status: 'success',
            code: 200,
            message,
            data,
        };
    }

    _qtyByProduct(items) {
        const map = new Map();
        for (const item of items || []) {
            const id = item.product_id;
            if (!id) continue;
            const quantity = parseInt(item.quantity, 10) || 1;
            map.set(id, (map.get(id) || 0) + quantity);
        }
        return map;
    }

    /**
     * delta > 0  → entra stock (cancelar / sacar productos)
     * delta < 0  → sale stock (crear / agregar productos)
     */
    async _adjustProductsStock(deltas, transaction) {
        const ids = [...deltas.entries()]
            .filter(([, delta]) => Number(delta) !== 0)
            .map(([id]) => id);

        if (ids.length === 0) return;

        const products = await this.sequelize.models.Product.findAll({
            where: {id: {[Op.in]: ids}},
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        const byId = new Map(products.map((p) => [p.id, p]));

        for (const productId of ids) {
            const product = byId.get(productId);
            if (!product) {
                throw new Error(`Producto ${productId} no encontrado al ajustar stock`);
            }

            const next = Number(product.stock || 0) + Number(deltas.get(productId));
            if (next < 0) {
                throw new Error(`Stock insuficiente para el producto "${product.name}"`);
            }

            await product.update({
                stock: next,
                stock_status: stockStatusFromStock(next),
            }, {transaction});
        }
    }

    async _syncPayments(orderId, total, data, transaction) {
        const {OrderPayment} = this.sequelize.models;

        let payments;

        if (Array.isArray(data.payments)) {
            payments = data.payments;
        } else if (data.payment_method !== undefined || data.payment_amount !== undefined) {
            const amount = data.payment_amount !== undefined ? Number(data.payment_amount) : Number(total);
            payments = amount > 0
                ? [{method: data.payment_method || 'cash', amount, reference: data.payment_reference}]
                : [];
        } else {
            payments = Number(total) > 0
                ? [{method: 'cash', amount: Number(total), reference: OrderService.AUTO_PAYMENT_REFERENCE}]
                : [];
        }

        for (const p of payments) {
            if (!(Number(p.amount) > 0)) {
                throw new Error('Cada pago debe tener un monto mayor a 0');
            }
            if (!['cash', 'card', 'transfer', 'other'].includes(p.method)) {
                throw new Error(`Método de pago inválido: ${p.method}`);
            }
        }

        await OrderPayment.destroy({where: {order_id: orderId}, transaction});

        if (payments.length > 0) {
            await OrderPayment.bulkCreate(
                payments.map(p => ({
                    order_id: orderId,
                    method: p.method || 'cash',
                    amount: Number(p.amount),
                    reference: p.reference ?? null,
                })),
                {transaction}
            );
        }
    }

    async getNextOrderNumber(businessId, transaction) {
        await this.sequelize.query(
            'SELECT pg_advisory_xact_lock(hashtext(:businessId))',
            {replacements: {businessId}, transaction}
        );

        const lastOrder = await this.model.findOne({
            where: {business_id: businessId},
            order: [['order_sequence', 'DESC']],
            attributes: ['order_sequence'],
            transaction,
        });

        return lastOrder ? Number(lastOrder.order_sequence) + 1 : 1;
    }

    async findAll({
                      page = 1,
                      limit = 10,
                      filters = {},
                      since
                  } = {}) {
        const safeLimit = Math.min(Number(limit) || 10, 100);
        const currentPage = Number(page) || 1;
        const offset = (currentPage - 1) * safeLimit;

        const where = this._buildFilters(filters);
        if (since) {
            where.updated_at = {[Op.gt]: new Date(since)};
        }

        const order = since
            ? [['updated_at', 'ASC'], ['id', 'ASC']]
            : [['created_at', 'DESC'], ['id', 'DESC']];

        const [total, rows] = await Promise.all([
            this.model.count({where}),
            this.model.findAll({
                where,
                limit: safeLimit,
                offset,
                order,
                include: this._includeItems(),
            })
        ]);

        const totalPages = Math.ceil(total / safeLimit);

        return {
            status: 'success',
            code: 200,
            message: 'Órdenes obtenidas correctamente',
            data: rows,
            pagination: {page: currentPage, limit: safeLimit, total, total_pages: totalPages}
        };
    }

    async _assertSalesPointBelongsToBusiness(salesPointId, businessId, transaction) {
        const salesPoint = await this.sequelize.models.SalesPoint.findByPk(salesPointId, {
            attributes: ['id', 'business_id', 'status'],
            transaction,
        });

        if (!salesPoint) {
            throw new Error('El punto de venta especificado no existe');
        }
        if (salesPoint.business_id !== businessId) {
            throw new Error('El punto de venta especificado no pertenece a este negocio');
        }
        if (salesPoint.status !== 'active') {
            throw new Error('El punto de venta especificado no está activo');
        }
    }

    async create(data, items = []) {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('La orden debe contener al menos un producto');
        }
        if (!data.business_id) {
            throw new Error('business_id es requerido');
        }
        if (!data.sales_point_id) {
            throw new Error('sales_point_id es requerido');
        }

        const business = await this.sequelize.models.Business.findByPk(data.business_id, {
            attributes: ['id', 'status']
        });
        if (!business) {
            throw new Error('El negocio especificado no existe');
        }
        if (business.status !== 'active') {
            throw new Error('El negocio especificado no está activo');
        }

        const createdOrder = await this.sequelize.transaction(async (t) => {
            await this._assertSalesPointBelongsToBusiness(data.sales_point_id, data.business_id, t);

            const uniqueIds = [...new Set(items.map(i => i.product_id))];
            const products = await this.sequelize.models.Product.findAll({
                where: {id: {[Op.in]: uniqueIds}},
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (products.length !== uniqueIds.length) {
                throw new Error('Uno o más productos especificados no existen');
            }

            const productMap = new Map(products.map(p => [p.id, p]));
            let subtotal = 0;

            const preparedItems = items.map((i) => {
                const product = productMap.get(i.product_id);
                const quantity = parseInt(i.quantity, 10) || 1;
                const unitPrice = Number(product.price);
                const itemSubtotal = unitPrice * quantity;
                subtotal += itemSubtotal;
                return {
                    product_id: i.product_id,
                    quantity,
                    unit_price: unitPrice,
                    subtotal: itemSubtotal,
                };
            });

            const stockDeltas = new Map();
            for (const [productId, quantity] of this._qtyByProduct(preparedItems)) {
                stockDeltas.set(productId, -quantity);
            }
            await this._adjustProductsStock(stockDeltas, t);

            const discountTotal = Number(data.discount_total) || 0;
            const total = subtotal - discountTotal;

            const nextOrderNumber = await this.getNextOrderNumber(data.business_id, t);
            console.log(`📝 Generando número de orden para negocio ${data.business_id}: ${nextOrderNumber}`);

            const order = await this.model.create({
                order_number: String(nextOrderNumber),
                order_sequence: nextOrderNumber,
                status: data.status || 'pending',
                notes: data.notes || '',
                customer_name: data.customer_name || null,
                customer_phone: data.customer_phone || null,
                customer_email: data.customer_email || null,
                business_id: data.business_id,
                sales_point_id: data.sales_point_id,
                subtotal,
                discount_total: discountTotal,
                total,
            }, {transaction: t});

            const itemsToCreate = preparedItems.map(i => ({...i, order_id: order.id}));
            await this.itemModel.bulkCreate(itemsToCreate, {transaction: t});

            await this._syncPayments(order.id, total, data, t);

            return this.model.findByPk(order.id, {
                include: this._includeItems(),
                transaction: t
            });
        });

        return this._wrapSingle(createdOrder, 'Orden creada correctamente');
    }

    async update(id, data) {
        const existing = await this.model.findByPk(id);
        if (!existing) {
            throw new Error('Orden no encontrada');
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

        if (data.sales_point_id) {
            const targetBusinessId = data.business_id || existing.business_id;
            await this._assertSalesPointBelongsToBusiness(data.sales_point_id, targetBusinessId);
        }

        const allowed = ['status', 'notes', 'customer_name', 'customer_phone', 'customer_email', 'business_id', 'sales_point_id', 'discount_total'];
        const patch = {};
        for (const key of allowed) {
            if (data[key] !== undefined) patch[key] = data[key];
        }

        if (patch.discount_total !== undefined) {
            patch.total = Number(existing.subtotal) - Number(patch.discount_total);
        }

        const updated = await this.sequelize.transaction(async (t) => {
            await existing.update(patch, {transaction: t});

            const total = patch.total !== undefined ? patch.total : Number(existing.total);
            if (patch.total !== undefined || data.payment_method !== undefined || data.payment_amount !== undefined || Array.isArray(data.payments)) {
                await this._syncPayments(id, total, data, t);
            }

            return this.model.findByPk(id, {include: this._includeItems(), transaction: t});
        });

        return this._wrapSingle(updated, 'Orden actualizada correctamente');
    }

    async cancel(id, reason) {
        if (!reason || !reason.trim()) {
            throw new Error('El motivo de cancelación es requerido');
        }

        const record = await this.model.findByPk(id);
        if (!record) {
            throw new Error('Orden no encontrada');
        }
        if (record.status === 'cancelled') {
            throw new Error('La orden ya se encuentra cancelada');
        }

        await this.sequelize.transaction(async (t) => {
            const items = await this.itemModel.findAll({
                where: {order_id: id},
                transaction: t,
            });

            const stockDeltas = new Map();
            for (const [productId, quantity] of this._qtyByProduct(items)) {
                stockDeltas.set(productId, quantity);
            }
            await this._adjustProductsStock(stockDeltas, t);

            await record.update({
                status: 'cancelled',
                cancellation_reason: reason.trim()
            }, {transaction: t});
        });

        const cancelled = await this.model.findByPk(id, {include: this._includeItems()});
        return this._wrapSingle(cancelled, 'Orden cancelada correctamente');
    }

    async findById(id) {
        const order = await this.model.findByPk(id, {include: this._includeItems()});
        if (!order) {
            return this._wrapSingle(null, 'Orden no encontrada');
        }
        return this._wrapSingle(order, 'Orden obtenida correctamente');
    }

    async findByBusiness(businessId, page = 1, limit = 10, filters = {}, since) {
        return this.findAll({
            page,
            limit,
            filters: {...filters, business_id: businessId},
            since
        });
    }

    async updateStatus(id, status) {
        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            throw new Error('Estado de orden inválido');
        }
        if (status === 'cancelled') {
            throw new Error('Para cancelar una orden use el endpoint de cancelación e indique el motivo');
        }

        const record = await this.model.findByPk(id);
        if (!record) {
            throw new Error('Orden no encontrada');
        }

        await record.update({status});
        return this._wrapSingle(record, 'Estado de la orden actualizado correctamente');
    }

    async updateItems(id, items, additionalData = {}) {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('La orden debe contener al menos un producto');
        }

        const record = await this.model.findByPk(id);
        if (!record) {
            throw new Error('Orden no encontrada');
        }

        const editableStatuses = ['pending', 'confirmed', 'processing'];
        if (!editableStatuses.includes(record.status)) {
            throw new Error(`No se pueden modificar los productos de una orden en estado "${record.status}"`);
        }

        return this.sequelize.transaction(async (t) => {
            const uniqueIds = [...new Set(items.map(i => i.product_id))];
            const products = await this.sequelize.models.Product.findAll({
                where: {id: {[Op.in]: uniqueIds}},
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (products.length !== uniqueIds.length) {
                throw new Error('Uno o más productos especificados no existen');
            }

            const productMap = new Map(products.map(p => [p.id, p]));
            let subtotal = 0;

            const preparedItems = items.map((i) => {
                const product = productMap.get(i.product_id);
                const quantity = parseInt(i.quantity, 10) || 1;
                const unitPrice = Number(product.price);
                const itemSubtotal = unitPrice * quantity;
                subtotal += itemSubtotal;
                return {
                    order_id: id,
                    product_id: i.product_id,
                    quantity,
                    unit_price: unitPrice,
                    subtotal: itemSubtotal,
                };
            });

            const oldItems = await this.itemModel.findAll({
                where: {order_id: id},
                transaction: t,
            });
            const oldQty = this._qtyByProduct(oldItems);
            const newQty = this._qtyByProduct(preparedItems);
            const stockDeltas = new Map();
            for (const productId of new Set([...oldQty.keys(), ...newQty.keys()])) {
                const delta = (oldQty.get(productId) || 0) - (newQty.get(productId) || 0);
                if (delta !== 0) stockDeltas.set(productId, delta);
            }
            await this._adjustProductsStock(stockDeltas, t);

            await this.itemModel.destroy({where: {order_id: id}, transaction: t});
            await this.itemModel.bulkCreate(preparedItems, {transaction: t});

            const discountTotal = additionalData.discount_total !== undefined
                ? Number(additionalData.discount_total)
                : Number(record.discount_total);
            const total = subtotal - discountTotal;

            const patch = {subtotal, discount_total: discountTotal, total};
            if (additionalData.notes !== undefined) patch.notes = additionalData.notes;
            if (additionalData.customer_name !== undefined) patch.customer_name = additionalData.customer_name;
            if (additionalData.customer_phone !== undefined) patch.customer_phone = additionalData.customer_phone;
            if (additionalData.customer_email !== undefined) patch.customer_email = additionalData.customer_email;

            await record.update(patch, {transaction: t});

            await this._syncPayments(id, total, additionalData, t);

            const updated = await this.model.findByPk(id, {include: this._includeItems(), transaction: t});
            return this._wrapSingle(updated, 'Orden actualizada correctamente');
        });
    }

    _buildFilters(filters) {
        const where = {};

        if (filters.order_number) {
            where.order_number = Number(filters.order_number);
        }
        if (filters.business_id) {
            where.business_id = filters.business_id;
        }
        if (filters.sales_point_id) {
            where.sales_point_id = filters.sales_point_id;
        }
        if (filters.status) {
            where.status = filters.status;
        }
        if (filters.customer_name) {
            where.customer_name = {[Op.like]: `%${filters.customer_name}%`};
        }
        if (filters.date_from || filters.date_to) {
            where.created_at = {};
            if (filters.date_from) where.created_at[Op.gte] = new Date(filters.date_from);
            if (filters.date_to) {
                const end = new Date(filters.date_to);
                end.setHours(23, 59, 59, 999);
                where.created_at[Op.lte] = end;
            }
        }
        if (filters.total_min) {
            where.total = {[Op.gte]: Number(filters.total_min)};
        }
        if (filters.total_max) {
            if (where.total) {
                where.total[Op.lte] = Number(filters.total_max);
            } else {
                where.total = {[Op.lte]: Number(filters.total_max)};
            }
        }

        return where;
    }

    async getStats() {
        const result = await this.model.findOne({
            attributes: [
                [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'total'],
                [this.sequelize.fn('COUNT', this.sequelize.literal(`CASE WHEN status = 'pending' THEN 1 END`)), 'pending'],
                [this.sequelize.fn('COUNT', this.sequelize.literal(`CASE WHEN status = 'delivered' THEN 1 END`)), 'delivered'],
                [this.sequelize.fn('COUNT', this.sequelize.literal(`CASE WHEN status = 'cancelled' THEN 1 END`)), 'cancelled'],
                [this.sequelize.fn('COALESCE', this.sequelize.fn('SUM', this.sequelize.col('total')), 0), 'revenue'],
            ],
            raw: true
        });

        return {
            total: Number(result.total),
            pending: Number(result.pending),
            delivered: Number(result.delivered),
            cancelled: Number(result.cancelled),
            revenue: Number(result.revenue)
        };
    }
}

module.exports = OrderService;