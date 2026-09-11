const {Op} = require('sequelize');

/**
 * ClosingService
 * Mismo patrón que CategoryService/BusinessService del proyecto
 */
class ClosingService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.models = sequelizeInstance.models;
    }

    // ----------------------------------------------------------------
    // Resumen del período
    // ----------------------------------------------------------------
    async getSummary(businessId, salesPointId = null, options = {}) {
        const {transaction = null} = options;
        const {Order, OrderPayment, OrderItem, Product, DayClosing, CashMovement} = this.models;

        const lastClosing = await DayClosing.findOne({
            where: {business_id: businessId, sales_point_id: salesPointId},
            order: [['period_end', 'DESC']],
            transaction,
        });
        const periodStart = lastClosing ? lastClosing.period_end : null;
        const periodEnd = new Date();

        const orderWhere = {
            business_id: businessId,
            status: {[Op.notIn]: ['cancelled']},
            ...(salesPointId ? {sales_point_id: salesPointId} : {}),
            ...(periodStart ? {created_at: {[Op.gt]: periodStart}} : {}),
        };

        const orders = await Order.findAll({
            where: orderWhere,
            include: [
                {model: OrderPayment, as: 'payments'},
                {
                    model: OrderItem,
                    as: 'items',
                    // 🔧 'name' no existe en ORDER_ITEMS — se saca de PRODUCTS más abajo
                    attributes: ['id', 'product_id', 'quantity', 'unit_price', 'subtotal'],
                },
            ],
            transaction,
        });

        const summary = {
            period_start: periodStart,
            period_end: periodEnd,
            orders_count: orders.length,
            total_sales: 0,
            cash_sales: 0,
            card_sales: 0,
            transfer_sales: 0,
            other_sales: 0,
        };

        for (const order of orders) {
            for (const payment of order.payments || []) {
                const amount = Number(payment.amount);
                summary.total_sales += amount;
                if (payment.method === 'cash') summary.cash_sales += amount;
                else if (payment.method === 'card') summary.card_sales += amount;
                else if (payment.method === 'transfer') summary.transfer_sales += amount;
                else summary.other_sales += amount;
            }
        }

        // ----------------------------------------------------------------
        // 🆕 Agregación de productos vendidos en el período.
        // ORDER_ITEMS no guarda el nombre del producto, así que lo traemos
        // de PRODUCTS junto con el stock actual, en el mismo fetch.
        // ----------------------------------------------------------------
        const productAgg = new Map();
        for (const order of orders) {
            for (const item of order.items || []) {
                const key = item.product_id;
                const acc = productAgg.get(key) || {quantity: 0, total: 0};
                acc.quantity += Number(item.quantity);
                acc.total += Number(item.subtotal);
                productAgg.set(key, acc);
            }
        }

        const productIds = Array.from(productAgg.keys());
        const productRows = productIds.length
            ? await Product.findAll({
                where: {id: {[Op.in]: productIds}},
                attributes: ['id', 'name', 'stock', 'stock_status'],
                transaction,
            })
            : [];
        const productById = new Map(productRows.map((p) => [p.id, p]));

        const products = productIds
            .map((id) => {
                const agg = productAgg.get(id);
                const product = productById.get(id);
                const remaining = Number(product?.stock ?? 0);
                const status =
                    product?.stock_status ??
                    (remaining <= 0 ? 'critical' : remaining <= 5 ? 'low' : 'normal');

                return {
                    product_id: id,
                    name: product?.name || 'Producto eliminado',
                    quantity_sold: agg.quantity,
                    total_amount: agg.total,
                    remaining_stock: remaining,
                    stock_status: status,
                };
            })
            .sort((a, b) => b.total_amount - a.total_amount);

        summary.products = products;
        summary.products_total = products.reduce((acc, p) => acc + p.total_amount, 0);

        // ----------------------------------------------------------------
        const movementWhere = {
            business_id: businessId,
            day_closing_id: null,
            ...(salesPointId ? {sales_point_id: salesPointId} : {}),
            ...(periodStart ? {created_at: {[Op.gt]: periodStart}} : {}),
        };
        const movements = await CashMovement.findAll({where: movementWhere, transaction});

        const cashExpenses = movements
            .filter((m) => ['expense', 'withdrawal'].includes(m.type))
            .reduce((acc, m) => acc + Number(m.amount), 0);
        const cashDeposits = movements
            .filter((m) => m.type === 'deposit')
            .reduce((acc, m) => acc + Number(m.amount), 0);

        // 🔧 opening_float ahora lee carried_float (con fallback a counted_cash
        // para compatibilidad con cierres viejos que no tenían ese campo)
        const openingFloat = lastClosing
            ? Number(lastClosing.carried_float ?? lastClosing.counted_cash)
            : 0;

        summary.cash_expenses = cashExpenses;
        summary.opening_float = openingFloat;
        summary.expected_cash = openingFloat + summary.cash_sales + cashDeposits - cashExpenses;
        summary.movements = movements;

        return {
            status: true,
            code: 200,
            message: 'Resumen calculado correctamente',
            data: summary,
        };
    }

    // ----------------------------------------------------------------
    // Elegibilidad de cierre general
    // ----------------------------------------------------------------
    async getGeneralClosingEligibility(businessId, options = {}) {
        const {transaction = null} = options;
        const {SalesPoint, DayClosing} = this.models;

        const activePoints = await SalesPoint.findAll({
            where: {business_id: businessId, status: 'active'},
            transaction,
        });

        const lastGeneralClosing = await DayClosing.findOne({
            where: {business_id: businessId, sales_point_id: null},
            order: [['period_end', 'DESC']],
            transaction,
        });
        const since = lastGeneralClosing ? lastGeneralClosing.period_end : null;

        const pending = [];
        let earliestPeriodEnd = null;

        for (const point of activePoints) {
            const closing = await DayClosing.findOne({
                where: {
                    business_id: businessId,
                    sales_point_id: point.id,
                    ...(since ? {period_end: {[Op.gt]: since}} : {}),
                },
                order: [['period_end', 'DESC']],
                transaction,
            });

            if (!closing) {
                pending.push({sales_point_id: point.id, name: point.name});
            } else if (!earliestPeriodEnd || closing.period_end < earliestPeriodEnd) {
                earliestPeriodEnd = closing.period_end;
            }
        }

        const eligible = activePoints.length > 0 && pending.length === 0;

        return {
            status: true,
            code: 200,
            message: eligible
                ? 'El negocio está listo para cierre general'
                : 'Hay puntos de venta pendientes de cerrar',
            data: {
                eligible,
                pending_sales_points: pending,
                suggested_period_end: earliestPeriodEnd,
            },
        };
    }

    // ----------------------------------------------------------------
    // Ejecuta el cierre (con soporte para snapshot offline)
    // ----------------------------------------------------------------
    async closeDay(input) {
        const {
            business_id,
            sales_point_id = null,
            counted_cash,
            denominations = {},
            notes = null,
            employee_id = null,
            closed_by = null,
            remote_id = null,
            snapshot = null,
            cash_action = 'withdraw_all',
            next_opening_float = 0,
        } = input;

        const {DayClosing, CashMovement} = this.models;

        // Validación defensiva: el fondo a dejar nunca puede superar lo contado
        const carriedFloat = cash_action === 'keep_float'
            ? Math.min(Math.max(Number(next_opening_float) || 0, 0), Number(counted_cash))
            : 0;

        return this.sequelize.transaction(async (t) => {
            // Bloqueo de concurrencia
            await this.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
                replacements: {key: `closing:${business_id}`},
                transaction: t,
            });

            let summary;
            let eligibility = null;

            if (sales_point_id === null) {
                eligibility = await this.getGeneralClosingEligibility(business_id, {transaction: t});
                if (!eligibility.data.eligible) {
                    return {
                        status: false,
                        code: 409,
                        message: 'No se puede hacer cierre general: hay puntos de venta sin cerrar',
                        data: eligibility.data,
                    };
                }
            }

            if (snapshot) {
                // ✅ CONFIANZA: Usar lo que el cliente calculó
                summary = {
                    period_start: snapshot.period_start,
                    period_end: snapshot.period_end,
                    orders_count: snapshot.orders_count,
                    total_sales: snapshot.total_sales,
                    cash_sales: snapshot.cash_sales,
                    card_sales: snapshot.card_sales,
                    transfer_sales: snapshot.transfer_sales,
                    other_sales: snapshot.other_sales,
                    cash_expenses: snapshot.cash_expenses,
                    opening_float: snapshot.opening_float,
                    expected_cash: snapshot.expected_cash,
                    movements: snapshot.movement_ids?.map(id => ({id})) || [],
                };
            } else {
                // 🔄 RECÁLCULO: Cierre online directo
                const summaryResult = await this.getSummary(business_id, sales_point_id, {transaction: t});
                summary = summaryResult.data;
            }

            // Determinar period_end para cierre general
            const periodEnd = sales_point_id === null
                ? (eligibility?.data?.suggested_period_end || summary.period_end)
                : summary.period_end;

            const difference = Number(counted_cash) - Number(summary.expected_cash);
            const status = Math.abs(difference) < 0.01 ? 'balanced' : difference > 0 ? 'over' : 'short';

            const closing = await DayClosing.create({
                business_id,
                sales_point_id,
                period_start: summary.period_start,
                period_end: periodEnd,
                opening_float: summary.opening_float,
                orders_count: summary.orders_count,
                total_sales: summary.total_sales,
                cash_sales: summary.cash_sales,
                card_sales: summary.card_sales,
                transfer_sales: summary.transfer_sales,
                other_sales: summary.other_sales,
                cash_expenses: summary.cash_expenses,
                expected_cash: summary.expected_cash,
                counted_cash,
                carried_float: carriedFloat,
                difference,
                denominations,
                notes,
                status,
                employee_id,
                closed_by,
                remote_id,
                source: snapshot ? 'offline' : 'online',
            }, {transaction: t});

            // Asignar movimientos al cierre
            const movementIds = summary.movements.map(m => m.id);
            if (movementIds.length) {
                await CashMovement.update(
                    {day_closing_id: closing.id},
                    {where: {id: {[Op.in]: movementIds}}, transaction: t}
                );
            }

            return {
                status: true,
                code: 201,
                message: 'Cierre registrado correctamente',
                data: closing,
            };
        });
    }

    // ----------------------------------------------------------------
    // Historial paginado
    // ----------------------------------------------------------------
    async getHistory(businessId, {salesPointId = undefined, page = 1, limit = 20} = {}) {
        const {DayClosing} = this.models;
        const offset = (page - 1) * limit;

        const where = {
            business_id: businessId,
            ...(salesPointId !== undefined ? {sales_point_id: salesPointId} : {}),
        };

        const {rows, count} = await DayClosing.findAndCountAll({
            where,
            order: [['period_end', 'DESC']],
            limit,
            offset,
        });

        return {
            status: true,
            code: 200,
            message: 'Historial de cierres',
            data: {
                items: rows,
                pagination: {page, limit, total: count, totalPages: Math.ceil(count / limit)},
            },
        };
    }

    async getById(businessId, id) {
        if (!businessId) {
            return {status: false, code: 400, message: 'business_id es requerido', data: null};
        }

        const {DayClosing, CashMovement} = this.models;

        const closing = await DayClosing.findOne({
            where: {id, business_id: businessId},
            include: [{model: CashMovement, as: 'cashMovements'}],
        });

        if (!closing) {
            return {status: false, code: 404, message: 'Cierre no encontrado', data: null};
        }

        return {status: true, code: 200, message: 'Cierre encontrado', data: closing};
    }
}

module.exports = ClosingService;