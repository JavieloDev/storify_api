const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');

// ============================
// LISTAR POR NEGOCIO
// GET /order/:businessId/orders
// ============================
router.get('/:businessId/orders', async (req, res, next) => {
    try {
        const service = getService(req, 'ORDER');
        const {businessId} = req.params;
        const {page = 1, limit = 10, filter = {}} = req.query;

        const result = await service.findByBusiness(businessId, page, limit, filter);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// ESTADÍSTICAS
// GET /order/stats
// ============================
router.get('/stats', async (req, res, next) => {
    try {
        const service = getService(req, 'ORDER');
        const stats = await service.getStats();
        res.json(stats);
    } catch (error) {
        next(error);
    }
});

// ============================
// OBTENER POR ID
// GET /order/:id
// ============================
router.get('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'ORDER');
        const {id} = req.params;

        const record = await service.findById(id);

        if (!record) {
            return res.status(404).json({message: 'Orden no encontrada'});
        }

        res.json(record);
    } catch (error) {
        next(error);
    }
});

// ============================
// CREAR
// POST /order/create
// body: { business_id, status, notes, customer_name, customer_phone, customer_email,
//         items: [{ product_id, quantity }] }
// ============================
router.post('/create', async (req, res, next) => {
    try {
        const service = getService(req, 'ORDER');
        const {items, ...orderData} = req.body;

        if (!orderData.business_id) {
            return res.status(400).json({
                status: 'error',
                message: 'business_id es requerido'
            });
        }

        const created = await service.create(orderData, items);

        res.status(201).json({
            status: 'success',
            code: 201,
            message: 'Orden creada correctamente',
            data: created
        });
    } catch (error) {
        console.error('❌ Error creando orden:', error);
        next(error);
    }
});

// ============================
// ACTUALIZAR (datos generales, no items)
// PUT /order/:id
// ============================
router.put('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'ORDER');
        const {id} = req.params;

        const updated = await service.update(id, req.body);

        res.json({
            status: 'success',
            code: 200,
            message: 'Orden actualizada correctamente',
            data: updated
        });
    } catch (error) {
        console.error('Error actualizando orden:', error);
        next(error);
    }
});

// ============================
// ACTUALIZAR ESTADO
// PATCH /order/:id/status
// body: { status }
// ============================
router.patch('/:id/status', async (req, res, next) => {
    try {
        const service = getService(req, 'ORDER');
        const {id} = req.params;
        const {status} = req.body;

        const updated = await service.updateStatus(id, status);

        res.json({
            status: 'success',
            code: 200,
            message: 'Estado de la orden actualizado correctamente',
            data: updated
        });
    } catch (error) {
        console.error('Error actualizando estado de la orden:', error);
        next(error);
    }
});

// ============================
// CANCELAR (la orden nunca se elimina, solo cambia de estado)
// PATCH /order/:id/cancel
// body: { reason }  <-- requerido
// ============================
router.patch('/:id/cancel', async (req, res, next) => {
    try {
        const service = getService(req, 'ORDER');
        const {id} = req.params;
        const {reason} = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                status: 'error',
                message: 'El motivo de cancelación (reason) es requerido'
            });
        }

        const result = await service.cancel(id, reason);
        res.json({
            status: 'success',
            code: 200,
            message: 'Orden cancelada correctamente',
            data: result
        });
    } catch (error) {
        console.error('Error cancelando orden:', error);
        next(error);
    }
});

module.exports = router;