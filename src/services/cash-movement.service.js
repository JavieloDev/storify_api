const {Op} = require('sequelize');

/**
 * CashMovementService
 * Mismo patrón que ClosingService
 * - constructor con DI de sequelizeInstance
 * - respuestas estructuradas { status, code, message, data }
 * - lógica de negocio espejada 1:1 con el frontend
 */
class CashMovementService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.models = sequelizeInstance.models;
    }

    // ============================================================
    // UTILITY: Validar y limpiar el motivo (reason)
    // ============================================================
    // 🆕 reason es NOT NULL en la tabla y el frontend ya lo valida antes
    // de mandar el request, pero esa validación vive solo en el flujo de
    // sync del POS. Cualquier otro cliente (panel admin, bulkCreate, un
    // request manual) puede mandar reason vacío/undefined y romper el
    // insert con un error crudo de Postgres. Se valida acá también para
    // que la regla de negocio no dependa de un solo cliente.
    _cleanReason(reason) {
        return (reason ?? '').toString().trim();
    }

    // ============================================================
    // HISTORIAL PAGINADO
    // ============================================================
    async getHistory(businessId, {salesPointId = undefined, page = 1, limit = 1000, since = null} = {}) {
        const {CashMovement} = this.models;
        const offset = (page - 1) * limit;

        const where = {
            business_id: businessId,
            ...(salesPointId !== undefined ? {sales_point_id: salesPointId} : {}),
            ...(since ? {updated_at: {[Op.gt]: new Date(since)}} : {}),
        };

        const {rows, count} = await CashMovement.findAndCountAll({
            where,
            order: [['created_at', 'DESC']],
            limit,
            offset,
        });

        return {
            status: true,
            code: 200,
            message: 'Historial de movimientos de caja',
            data: {
                items: rows,
                pagination: {
                    page,
                    limit,
                    total: count,
                    totalPages: Math.ceil(count / limit),
                },
            },
            serverTime: new Date().toISOString(),
        };
    }

    // ============================================================
    // MOVIMIENTOS PENDIENTES (sin day_closing_id)
    // ============================================================
    async getPending(businessId, salesPointId = null) {
        const {CashMovement} = this.models;

        const where = {
            business_id: businessId,
            day_closing_id: null,
            ...(salesPointId ? {sales_point_id: salesPointId} : {}),
        };

        const movements = await CashMovement.findAll({
            where,
            order: [['created_at', 'ASC']],
        });

        return {
            status: true,
            code: 200,
            message: 'Movimientos pendientes de cierre',
            data: movements,
        };
    }

    // ============================================================
    // OBTENER POR ID
    // ============================================================
    async getById(businessId, id) {
        if (!businessId) {
            return {
                status: false,
                code: 400,
                message: 'business_id es requerido',
                data: null,
            };
        }

        const {CashMovement} = this.models;

        const movement = await CashMovement.findOne({
            where: {id, business_id: businessId},
        });

        if (!movement) {
            return {
                status: false,
                code: 404,
                message: 'Movimiento no encontrado',
                data: null,
            };
        }

        return {
            status: true,
            code: 200,
            message: 'Movimiento encontrado',
            data: movement,
        };
    }

    // ============================================================
    // CREAR MOVIMIENTO
    // ============================================================
    async create(input) {
        const {
            business_id,
            sales_point_id = null,
            type,
            amount,
            reason,
            employee_id = null,
            day_closing_id = null,
            remote_id = null,
        } = input;

        // 🆕 Validación defensiva: reason es NOT NULL en la BD.
        // Antes esto no se validaba acá y dependía 100% de que el
        // frontend mandara algo — cualquier otro cliente rompía el
        // insert con un 500 crudo de Postgres en vez de un 400 claro.
        const cleanReason = this._cleanReason(reason);
        if (!cleanReason) {
            return {
                status: false,
                code: 400,
                message: 'El movimiento de caja requiere un motivo (reason)',
                data: null,
            };
        }

        const {CashMovement} = this.models;

        // Validar que el negocio existe
        const business = await this.models.Business.findByPk(business_id);
        if (!business) {
            return {
                status: false,
                code: 404,
                message: 'Negocio no encontrado',
                data: null,
            };
        }

        // Si tiene sales_point_id, validar que existe
        if (sales_point_id) {
            const salesPoint = await this.models.SalesPoint.findByPk(sales_point_id);
            if (!salesPoint) {
                return {
                    status: false,
                    code: 404,
                    message: 'Punto de venta no encontrado',
                    data: null,
                };
            }
        }

        // Si tiene day_closing_id, validar que existe
        if (day_closing_id) {
            const closing = await this.models.DayClosing.findByPk(day_closing_id);
            if (!closing) {
                return {
                    status: false,
                    code: 404,
                    message: 'Cierre no encontrado',
                    data: null,
                };
            }
        }

        const movement = await CashMovement.create({
            business_id,
            sales_point_id,
            type,
            amount,
            reason: cleanReason,
            employee_id,
            day_closing_id,
            remote_id,
        });

        return {
            status: true,
            code: 201,
            message: 'Movimiento de caja creado correctamente',
            data: movement,
        };
    }

    // ============================================================
    // ACTUALIZAR MOVIMIENTO
    // ============================================================
    async update(id, businessId, input) {
        const {CashMovement} = this.models;

        const movement = await CashMovement.findOne({
            where: {id, business_id: businessId},
        });

        if (!movement) {
            return {
                status: false,
                code: 404,
                message: 'Movimiento no encontrado',
                data: null,
            };
        }

        // No permitir actualizar campos críticos si ya está asociado a un cierre
        if (movement.day_closing_id) {
            const disallowedFields = ['type', 'amount', 'business_id', 'sales_point_id'];
            const attemptedChanges = Object.keys(input).filter(k => disallowedFields.includes(k));

            if (attemptedChanges.length > 0) {
                return {
                    status: false,
                    code: 409,
                    message: `No se puede modificar un movimiento ya asociado a un cierre. Campos no permitidos: ${attemptedChanges.join(', ')}`,
                    data: null,
                };
            }
        }

        // 🆕 Si el PUT trae reason, no se puede dejar vacío (mismo criterio
        // que en create). Si no viene reason en el input, no se toca.
        const patch = {...input};
        if (Object.prototype.hasOwnProperty.call(patch, 'reason')) {
            const cleanReason = this._cleanReason(patch.reason);
            if (!cleanReason) {
                return {
                    status: false,
                    code: 400,
                    message: 'El motivo (reason) no puede quedar vacío',
                    data: null,
                };
            }
            patch.reason = cleanReason;
        }

        // Validar sales_point_id si viene
        if (patch.sales_point_id) {
            const salesPoint = await this.models.SalesPoint.findByPk(patch.sales_point_id);
            if (!salesPoint) {
                return {
                    status: false,
                    code: 404,
                    message: 'Punto de venta no encontrado',
                    data: null,
                };
            }
        }

        // Validar day_closing_id si viene
        if (patch.day_closing_id) {
            const closing = await this.models.DayClosing.findByPk(patch.day_closing_id);
            if (!closing) {
                return {
                    status: false,
                    code: 404,
                    message: 'Cierre no encontrado',
                    data: null,
                };
            }
        }

        await movement.update({
            ...patch,
            updated_at: new Date(),
        });

        return {
            status: true,
            code: 200,
            message: 'Movimiento actualizado correctamente',
            data: movement,
        };
    }

    // ============================================================
    // ELIMINAR MOVIMIENTO (solo si no está asociado a un cierre)
    // ============================================================
    async delete(id, businessId) {
        const {CashMovement} = this.models;

        const movement = await CashMovement.findOne({
            where: {id, business_id: businessId},
        });

        if (!movement) {
            return {
                status: false,
                code: 404,
                message: 'Movimiento no encontrado',
                data: null,
            };
        }

        // No permitir eliminar si ya está asociado a un cierre
        if (movement.day_closing_id) {
            return {
                status: false,
                code: 409,
                message: 'No se puede eliminar un movimiento ya asociado a un cierre',
                data: null,
            };
        }

        await movement.destroy();

        return {
            status: true,
            code: 200,
            message: 'Movimiento eliminado correctamente',
            data: {id},
        };
    }

    // ============================================================
    // ASIGNAR MOVIMIENTOS A UN CIERRE (método auxiliar para ClosingService)
    // ============================================================
    async assignToClosing(movementIds, closingId, transaction = null) {
        const {CashMovement} = this.models;

        if (!movementIds || movementIds.length === 0) {
            return {
                status: true,
                code: 200,
                message: 'No hay movimientos para asignar',
                data: 0,
            };
        }

        const [updated] = await CashMovement.update(
            {day_closing_id: closingId},
            {
                where: {id: {[Op.in]: movementIds}},
                transaction,
            }
        );

        return {
            status: true,
            code: 200,
            message: `${updated} movimientos asignados al cierre`,
            data: updated,
        };
    }

    // ============================================================
    // OBTENER MOVIMIENTOS POR CIERRE
    // ============================================================
    async getByClosingId(closingId, businessId) {
        const {CashMovement} = this.models;

        const movements = await CashMovement.findAll({
            where: {
                day_closing_id: closingId,
                business_id: businessId,
            },
            order: [['created_at', 'ASC']],
        });

        return {
            status: true,
            code: 200,
            message: 'Movimientos del cierre',
            data: movements,
        };
    }

    // ============================================================
    // OBTENER RESUMEN DE MOVIMIENTOS POR PERÍODO
    // ============================================================
    async getSummary(businessId, salesPointId = null, periodStart = null, periodEnd = null) {
        const {CashMovement} = this.models;

        const where = {
            business_id: businessId,
            ...(salesPointId ? {sales_point_id: salesPointId} : {}),
            ...(periodStart ? {created_at: {[Op.gte]: new Date(periodStart)}} : {}),
            ...(periodEnd ? {created_at: {[Op.lte]: new Date(periodEnd)}} : {}),
        };

        const movements = await CashMovement.findAll({where});

        const summary = {
            total_expenses: 0,
            total_withdrawals: 0,
            total_deposits: 0,
            total: 0,
            count: movements.length,
            by_type: {
                expense: 0,
                withdrawal: 0,
                deposit: 0,
            },
        };

        for (const movement of movements) {
            const amount = Number(movement.amount);
            summary.by_type[movement.type] += amount;

            if (movement.type === 'expense') {
                summary.total_expenses += amount;
                summary.total -= amount;
            } else if (movement.type === 'withdrawal') {
                summary.total_withdrawals += amount;
                summary.total -= amount;
            } else if (movement.type === 'deposit') {
                summary.total_deposits += amount;
                summary.total += amount;
            }
        }

        return {
            status: true,
            code: 200,
            message: 'Resumen de movimientos',
            data: summary,
        };
    }

    // ============================================================
    // BULK CREATE (para sincronización)
    // ============================================================
    async bulkCreate(movements, options = {}) {
        const {CashMovement} = this.models;
        const {transaction = null} = options;

        // 🆕 Mismo problema que en create(): este método se usa para
        // sincronización masiva y antes no validaba reason en absoluto,
        // dejando pasar cualquier item sin motivo directo al INSERT.
        // Se separan los items válidos de los inválidos en vez de que
        // todo el lote falle por un solo registro corrupto.
        const rejected = [];
        const validMovements = [];

        for (const movement of movements) {
            const cleanReason = this._cleanReason(movement.reason);
            if (!cleanReason) {
                rejected.push({
                    id: movement.id ?? movement.remote_id ?? null,
                    message: 'El movimiento de caja requiere un motivo (reason)',
                });
                continue;
            }
            validMovements.push({...movement, reason: cleanReason});
        }

        const created = validMovements.length
            ? await CashMovement.bulkCreate(validMovements, {
                transaction,
                ignoreDuplicates: true,
            })
            : [];

        return {
            status: true,
            code: 201,
            message: `${created.length} movimientos creados${rejected.length ? `, ${rejected.length} rechazados` : ''}`,
            data: created,
            rejected: rejected.length ? rejected : undefined,
        };
    }
}

module.exports = CashMovementService;