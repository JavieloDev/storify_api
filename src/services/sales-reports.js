const {Op, fn, col, literal} = require('sequelize');

const VALID_PERIODS = ['day', 'month', 'year'];

class SalesReportService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.orderModel = sequelizeInstance.models.Order;
        this.itemModel = sequelizeInstance.models.OrderItem;
        this.productModel = sequelizeInstance.models.Product;

        if (!this.orderModel || !this.itemModel || !this.productModel) {
            const availableModels = Object.keys(sequelizeInstance.models).join(', ');
            throw new Error(`Modelos requeridos no encontrados (Order/OrderItem/Product). Modelos disponibles: ${availableModels}`);
        }
    }

    /**
     * Construye el WHERE base para filtrar órdenes por negocio, rango de fechas
     * y si se deben excluir las canceladas (por defecto sí se excluyen de las ventas).
     */
    _buildOrderWhere(businessId, {date_from, date_to, include_cancelled = false} = {}) {
        if (!businessId) {
            throw new Error('business_id es requerido');
        }

        const where = {business_id: businessId};

        if (!include_cancelled) {
            where.status = {[Op.ne]: 'cancelled'};
        }

        if (date_from || date_to) {
            where.created_at = {};
            if (date_from) where.created_at[Op.gte] = new Date(date_from);
            if (date_to) where.created_at[Op.lte] = new Date(date_to);
        }

        return where;
    }

    /**
     * Resumen general: total de órdenes, ingresos, ticket promedio y unidades vendidas.
     */
    async getSalesSummary(businessId, options = {}) {
        const where = this._buildOrderWhere(businessId, options);

        const [orderStats, itemStats] = await Promise.all([
            this.orderModel.findOne({
                where,
                attributes: [
                    [fn('COUNT', col('id')), 'total_orders'],
                    [fn('COALESCE', fn('SUM', col('total')), 0), 'total_revenue'],
                    [fn('COALESCE', fn('SUM', col('discount_total')), 0), 'total_discounts'],
                    [fn('COALESCE', fn('AVG', col('total')), 0), 'average_order_value'],
                ],
                raw: true,
            }),
            this.itemModel.findOne({
                attributes: [
                    [fn('COALESCE', fn('SUM', col('OrderItem.quantity')), 0), 'total_items_sold'],
                ],
                include: [
                    {
                        model: this.orderModel,
                        as: 'order',
                        attributes: [],
                        where,
                        required: true,
                    }
                ],
                raw: true,
            }),
        ]);

        return {
            total_orders: Number(orderStats.total_orders),
            total_revenue: Number(orderStats.total_revenue),
            total_discounts: Number(orderStats.total_discounts),
            average_order_value: Number(orderStats.average_order_value),
            total_items_sold: Number(itemStats.total_items_sold),
        };
    }

    /**
     * Cantidad de órdenes e ingresos agrupados por estado.
     */
    async getSalesByStatus(businessId, {date_from, date_to} = {}) {
        // Aquí siempre incluimos canceladas porque el punto es ver la distribución completa
        const where = this._buildOrderWhere(businessId, {date_from, date_to, include_cancelled: true});

        const rows = await this.orderModel.findAll({
            where,
            attributes: [
                'status',
                [fn('COUNT', col('id')), 'orders_count'],
                [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
            ],
            group: ['status'],
            raw: true,
        });

        return rows.map(r => ({
            status: r.status,
            orders_count: Number(r.orders_count),
            revenue: Number(r.revenue),
        }));
    }

    /**
     * Productos más vendidos: cantidad vendida e ingresos generados por producto.
     */
    async getTopProducts(businessId, options = {}) {
        const {limit = 10} = options;
        const where = this._buildOrderWhere(businessId, options);
        const safeLimit = Math.min(Number(limit) || 10, 100);

        const rows = await this.itemModel.findAll({
            attributes: [
                'product_id',
                [fn('SUM', col('OrderItem.quantity')), 'total_quantity'],
                [fn('SUM', col('OrderItem.subtotal')), 'total_revenue'],
                [fn('COUNT', literal('DISTINCT "OrderItem"."order_id"')), 'orders_count'],
            ],
            include: [
                {
                    model: this.orderModel,
                    as: 'order',
                    attributes: [],
                    where,
                    required: true,
                },
                {
                    model: this.productModel,
                    as: 'product',
                    attributes: ['id', 'name', 'brand', 'image', 'price'],
                    required: false,
                }
            ],
            group: [
                'product_id',
                'product.id', 'product.name', 'product.brand', 'product.image', 'product.price'
            ],
            order: [[literal('total_quantity'), 'DESC']],
            limit: safeLimit,
            subQuery: false,
            raw: true,
            nest: true,
        });

        return rows.map(r => ({
            product_id: r.product_id,
            product_name: r.product?.name ?? 'Producto eliminado',
            brand: r.product?.brand ?? null,
            image: r.product?.image ?? null,
            current_price: r.product ? Number(r.product.price) : null,
            total_quantity: Number(r.total_quantity),
            total_revenue: Number(r.total_revenue),
            orders_count: Number(r.orders_count),
        }));
    }

    /**
     * Ventas agrupadas por periodo (día, mes o año) — útil para graficar tendencias.
     */
    async getSalesByPeriod(businessId, options = {}) {
        const {group_by = 'day'} = options;

        if (!VALID_PERIODS.includes(group_by)) {
            throw new Error(`group_by inválido. Use uno de: ${VALID_PERIODS.join(', ')}`);
        }

        const where = this._buildOrderWhere(businessId, options);

        const rows = await this.orderModel.findAll({
            where,
            attributes: [
                [fn('DATE_TRUNC', group_by, col('created_at')), 'period'],
                [fn('COUNT', col('id')), 'orders_count'],
                [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
            ],
            group: [literal('period')],
            order: [[literal('period'), 'ASC']],
            raw: true,
        });

        return rows.map(r => ({
            period: r.period,
            orders_count: Number(r.orders_count),
            revenue: Number(r.revenue),
        }));
    }

    /**
     * Reporte completo: junta todo lo anterior en una sola respuesta,
     * útil para poblar un dashboard con una sola petición.
     */
    async getFullReport(businessId, options = {}) {
        const [summary, byStatus, topProducts, byPeriod] = await Promise.all([
            this.getSalesSummary(businessId, options),
            this.getSalesByStatus(businessId, options),
            this.getTopProducts(businessId, options),
            this.getSalesByPeriod(businessId, options),
        ]);

        return {
            summary,
            by_status: byStatus,
            top_products: topProducts,
            by_period: byPeriod,
        };
    }

    /**
     * Reporte de productos: cantidad en inventario, unidades vendidas (de órdenes
     * no canceladas ni eliminadas), disponible (cantidad - vendido) y subtotal
     * generado. La ganancia se calculará más adelante (por ahora null).
     */
    async getProductsSalesReport(businessId, options = {}) {
        if (!businessId) {
            throw new Error('business_id es requerido');
        }

        const orderWhere = this._buildOrderWhere(businessId, options);

        const [products, soldStats] = await Promise.all([
            this.productModel.findAll({
                where: {business_id: businessId}, // ajustar si business_id no vive en Product
                attributes: ['id', 'name', 'brand', 'image', 'price', 'quantity'],
                raw: true,
            }),
            this.itemModel.findAll({
                attributes: [
                    'product_id',
                    [fn('SUM', col('OrderItem.quantity')), 'vendido'],
                    [fn('SUM', col('OrderItem.subtotal')), 'subtotal'],
                ],
                include: [
                    {
                        model: this.orderModel,
                        as: 'order',
                        attributes: [],
                        where: orderWhere,
                        required: true,
                    }
                ],
                group: ['product_id'],
                subQuery: false,
                raw: true,
            }),
        ]);

        const soldMap = new Map(
            soldStats.map(s => [s.product_id, {
                vendido: Number(s.vendido),
                subtotal: Number(s.subtotal),
            }])
        );

        return products.map(p => {
            const sold = soldMap.get(p.id) || {vendido: 0, subtotal: 0};
            const cantidad = Number(p.quantity) || 0;

            return {
                producto_id: p.id,
                producto: p.name,
                brand: p.brand,
                image: p.image,
                precio: Number(p.price),
                cantidad,
                vendido: sold.vendido,
                disponible: cantidad - sold.vendido,
                subtotal: sold.subtotal,
                ganancia: null,
            };
        });
    }
}

module.exports = SalesReportService;