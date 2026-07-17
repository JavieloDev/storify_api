const {Op} = require('sequelize');

class OrderService {
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
                model: this.sequelize.models.Business,
                as: 'business',
                required: false,
            }
        ];
    }

    /**
     * Obtener el próximo número de orden para un negocio
     */
    async getNextOrderNumber(businessId, transaction) {
        await this.sequelize.query(
            'SELECT pg_advisory_xact_lock(hashtext(:businessId))',
            {
                replacements: {businessId},
                transaction,
            }
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
                include: this._includeItems(),
            })
        ]);

        const totalPages = Math.ceil(total / safeLimit);

        return {
            status: 'success',
            code: 200,
            message: 'Órdenes obtenidas correctamente',
            data: rows,
            pagination: {
                page: currentPage,
                limit: safeLimit,
                total,
                total_pages: totalPages
            }
        };
    }

    // data: {business_id, status, notes, customer_name, customer_phone, customer_email}
    // items: [{product_id, quantity}]
    async create(data, items = []) {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('La orden debe contener al menos un producto');
        }

        if (!data.business_id) {
            throw new Error('business_id es requerido');
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

        return this.sequelize.transaction(async (t) => {
            // Verificar productos
            const products = await this.sequelize.models.Product.findAll({
                where: {id: {[Op.in]: items.map(i => i.product_id)}},
                transaction: t
            });

            if (products.length !== items.length) {
                throw new Error('Uno o más productos especificados no existen');
            }

            // Calcular subtotal
            const productMap = new Map(products.map(p => [p.id, p]));
            let subtotal = 0;

            const preparedItems = items.map((i) => {
                const product = productMap.get(i.product_id);
                const quantity = parseInt(i.quantity) || 1;
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

            const discountTotal = Number(data.discount_total) || 0;
            const total = subtotal - discountTotal;

            // 🔥 GENERAR EL NÚMERO DE ORDEN AQUÍ
            const nextOrderNumber = await this.getNextOrderNumber(data.business_id, t);
            console.log(`📝 Generando número de orden para negocio ${data.business_id}: ${nextOrderNumber}`);

            // Crear la orden con el order_number explícitamente
            const order = await this.model.create({
                order_number: String(nextOrderNumber),
                order_sequence: nextOrderNumber,
                status: data.status || 'pending',
                notes: data.notes || '',
                customer_name: data.customer_name || null,
                customer_phone: data.customer_phone || null,
                customer_email: data.customer_email || null,
                business_id: data.business_id,
                subtotal,
                discount_total: discountTotal,
                total,
            }, {transaction: t});

            const itemsToCreate = preparedItems.map(i => ({...i, order_id: order.id}));
            await this.itemModel.bulkCreate(itemsToCreate, {transaction: t});

            return this.model.findByPk(order.id, {
                include: this._includeItems(),
                transaction: t
            });
        });
    }

    // ... resto de métodos igual ...
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

        const allowed = ['status', 'notes', 'customer_name', 'customer_phone', 'customer_email', 'business_id', 'discount_total'];
        const patch = {};
        for (const key of allowed) {
            if (data[key] !== undefined) patch[key] = data[key];
        }

        if (patch.discount_total !== undefined) {
            patch.total = Number(existing.subtotal) - Number(patch.discount_total);
        }

        await existing.update(patch);

        return this.model.findByPk(id, {include: this._includeItems()});
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

        await record.update({
            status: 'cancelled',
            cancellation_reason: reason.trim()
        });

        return this.model.findByPk(id, {include: this._includeItems()});
    }

    async findById(id) {
        return this.model.findByPk(id, {include: this._includeItems()});
    }

    async findByBusiness(businessId, page = 1, limit = 10, filters = {}) {
        return this.findAll({
            page,
            limit,
            filters: {...filters, business_id: businessId}
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
        return record;
    }

    _buildFilters(filters) {
        const where = {};

        if (filters.order_number) {
            where.order_number = Number(filters.order_number);
        }

        if (filters.business_id) {
            where.business_id = filters.business_id;
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
            if (filters.date_to) where.created_at[Op.lte] = new Date(filters.date_to);
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