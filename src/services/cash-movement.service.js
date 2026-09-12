const {Op} = require('sequelize');

/**
 * CashMovementService
 * Mismo patrón que ClosingService
 * - constructor con DI de sequelizeInstance
 * - respuestas estructuradas { status, code, message, data }
 * - lógica de negocio espejada 1:1 con el frontend
 *
 * Identidad offline-first:
 * el cliente puede mandar su UUID local en `id` / `remote_id`.
 * Se busca por id O remote_id, y el create es idempotente.
 */
class CashMovementService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.models = sequelizeInstance.models;
    }

    _cleanReason(reason) {
        return (reason ?? '').toString().trim();
    }

    _findMovement(businessId, id, options = {}) {
        const {CashMovement} = this.models;
        return CashMovement.findOne({
            where: {
                business_id: businessId,
                [Op.or]: [{id}, {remote_id: id}],
            },
            ...options,
        });
    }

    _stripUnsafePatch(input = {}) {
        const {
            id: _id,
            business_id: _businessId,
            remote_id: _remoteId,
            synced: _synced,
            created_at: _createdAt,
            ...safe
        } = input;
        return safe;
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

        const movement = await this._findMovement(businessId, id);

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

        const business = await this.models.Business.findByPk(business_id);
        if (!business) {
            return {
                status: false,
                code: 404,
                message: 'Negocio no encontrado',
                data: null,
            };
        }

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

        const clientId = input.id || remote_id || null;
        if (clientId) {
            const existing = await this._findMovement(business_id, clientId);
            if (existing) {
                return {
                    status: true,
                    code: 200,
                    message: 'Movimiento de caja ya existía',
                    data: existing,
                };
            }
        }

        const movement = await CashMovement.create({
            ...(clientId ? {id: clientId} : {}),
            business_id,
            sales_point_id,
            type,
            amount,
            reason: cleanReason,
            employee_id,
            day_closing_id,
            remote_id: remote_id || clientId || null,
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
        const movement = await this._findMovement(businessId, id);

        if (!movement) {
            return {
                status: false,
                code: 404,
                message: 'Movimiento no encontrado',
                data: null,
            };
        }

        const patch = this._stripUnsafePatch(input);

        if (movement.day_closing_id) {
            const disallowedFields = ['type', 'amount', 'business_id', 'sales_point_id'];
            const attemptedChanges = Object.keys(patch).filter(k => disallowedFields.includes(k));

            if (attemptedChanges.length > 0) {
                return {
                    status: false,
                    code: 409,
                    message: `No se puede modificar un movimiento ya asociado a un cierre. Campos no permitidos: ${attemptedChanges.join(', ')}`,
                    data: null,
                };
            }
        }

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
        const movement = await this._findMovement(businessId, id);

        if (!movement) {
            return {
                status: false,
                code: 404,
                message: 'Movimiento no encontrado',
                data: null,
            };
        }

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
            data: {id: movement.id},
        };
    }

    // ============================================================
    // ASIGNAR MOVIMIENTOS A UN CIERRE
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
                where: {
                    [Op.or]: [
                        {id: {[Op.in]: movementIds}},
                        {remote_id: {[Op.in]: movementIds}},
                    ],
                },
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

            const clientId = movement.id || movement.remote_id || null;
            validMovements.push({
                ...movement,
                ...(clientId ? {id: clientId} : {}),
                reason: cleanReason,
                remote_id: movement.remote_id || clientId || null,
            });
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