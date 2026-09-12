const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');

// ============================
// LISTAR MOVIMIENTOS POR NEGOCIO
// GET /cash-movement/:businessId/movements?sales_point_id=&page=&limit=&since=
// ============================
router.get('/:businessId/movements', async (req, res, next) => {
    try {
        const service = getService(req, 'CASH_MOVEMENT');
        const {businessId} = req.params;
        const {sales_point_id, page = 1, limit = 1000, since} = req.query;

        const result = await service.getHistory(businessId, {
            salesPointId: sales_point_id || undefined,
            page: Number(page),
            limit: Number(limit),
            since: since || null,
        });

        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// LISTAR MOVIMIENTOS PENDIENTES (sin day_closing_id)
// GET /cash-movement/:businessId/pending?sales_point_id=
// ============================
router.get('/:businessId/pending', async (req, res, next) => {
    try {
        const service = getService(req, 'CASH_MOVEMENT');
        const {businessId} = req.params;
        const {sales_point_id} = req.query;

        const result = await service.getPending(businessId, sales_point_id || null);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// OBTENER MOVIMIENTO POR ID
// GET /cash-movement/:id
// ============================
router.get('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'CASH_MOVEMENT');
        const {id} = req.params;
        const {business_id} = req.query;

        if (!business_id) {
            return res.status(400).json({
                status: 'error',
                message: 'business_id es requerido'
            });
        }

        const record = await service.getById(business_id, id);

        if (!record.data) {
            return res.status(404).json({
                status: 'error',
                message: 'Movimiento de caja no encontrado'
            });
        }

        res.json(record);
    } catch (error) {
        next(error);
    }
});

// ============================
// CREAR MOVIMIENTO DE CAJA
// POST /cash-movement/create
// body: { business_id, sales_point_id, type, amount, reason, employee_id, day_closing_id }
// ============================
router.post('/create', async (req, res, next) => {
    try {
        const service = getService(req, 'CASH_MOVEMENT');
        const {business_id, type, amount, reason} = req.body;

        if (!business_id) {
            return res.status(400).json({
                status: 'error',
                message: 'business_id es requerido'
            });
        }

        if (!type) {
            return res.status(400).json({
                status: 'error',
                message: 'type es requerido (expense, withdrawal, deposit)'
            });
        }

        if (!['expense', 'withdrawal', 'deposit'].includes(type)) {
            return res.status(400).json({
                status: 'error',
                message: 'type debe ser: expense, withdrawal o deposit'
            });
        }

        if (amount === undefined || amount === null || Number(amount) <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'amount es requerido y debe ser mayor a 0'
            });
        }

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                status: 'error',
                message: 'reason es requerido'
            });
        }

        const result = await service.create(req.body);

        res.status(result.code || 201).json(result);
    } catch (error) {
        console.error('❌ Error creando movimiento de caja:', error);
        next(error);
    }
});

// ============================
// ACTUALIZAR MOVIMIENTO DE CAJA
// PUT /cash-movement/:id
// body: { sales_point_id, type, amount, reason, employee_id, day_closing_id }
// ============================
router.put('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'CASH_MOVEMENT');
        const {id} = req.params;
        const {business_id} = req.query;

        if (!business_id) {
            return res.status(400).json({
                status: 'error',
                message: 'business_id es requerido'
            });
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'reason')) {
            if (!req.body.reason || !req.body.reason.trim()) {
                return res.status(400).json({
                    status: 'error',
                    message: 'reason no puede quedar vacío'
                });
            }
        }

        const result = await service.update(id, business_id, req.body);

        if (!result.data) {
            return res.status(result.code || 404).json({
                status: 'error',
                message: result.message || 'Movimiento de caja no encontrado'
            });
        }

        res.status(result.code || 200).json(result);
    } catch (error) {
        console.error('❌ Error actualizando movimiento de caja:', error);
        next(error);
    }
});

// ============================
// ELIMINAR MOVIMIENTO DE CAJA (solo si no está asociado a un cierre)
// DELETE /cash-movement/:id
// ============================
router.delete('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'CASH_MOVEMENT');
        const {id} = req.params;
        const {business_id} = req.query;

        if (!business_id) {
            return res.status(400).json({
                status: 'error',
                message: 'business_id es requerido'
            });
        }

        const result = await service.delete(id, business_id);

        if (!result.data) {
            return res.status(404).json({
                status: 'error',
                message: 'Movimiento de caja no encontrado'
            });
        }

        res.json(result);
    } catch (error) {
        console.error('❌ Error eliminando movimiento de caja:', error);
        next(error);
    }
});

module.exports = router;