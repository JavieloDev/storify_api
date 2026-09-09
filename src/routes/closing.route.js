const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');

// ============================
// RESUMEN DEL PERÍODO
// GET /closing/:businessId/summary?sales_point_id=...
// ============================
router.get('/:businessId/summary', async (req, res, next) => {
    try {
        const service = getService(req, 'CLOSING');
        const {businessId} = req.params;
        const {sales_point_id} = req.query;

        const result = await service.getSummary(businessId, sales_point_id || null);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// ELEGIBILIDAD DE CIERRE GENERAL
// GET /closing/:businessId/eligibility
// ============================
router.get('/:businessId/eligibility', async (req, res, next) => {
    try {
        const service = getService(req, 'CLOSING');
        const {businessId} = req.params;

        const result = await service.getGeneralClosingEligibility(businessId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// HISTORIAL
// GET /closing/:businessId/history?sales_point_id=&page=&limit=
// ============================
router.get('/:businessId/history', async (req, res, next) => {
    try {
        const service = getService(req, 'CLOSING');
        const {businessId} = req.params;
        const {sales_point_id, page = 1, limit = 20} = req.query;

        const result = await service.getHistory(businessId, {
            salesPointId: sales_point_id || null,
            page: Number(page),
            limit: Number(limit),
        });

        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// OBTENER POR ID
// GET /closing/:id
// ============================
router.get('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'CLOSING');
        const {id} = req.params;
        const {business_id} = req.query;

        const record = await service.getById(business_id, id);

        if (!record.data) {
            return res.status(404).json({message: 'Cierre no encontrado'});
        }

        res.json(record);
    } catch (error) {
        next(error);
    }
});

// ============================
// CREAR CIERRE (por punto de venta o general)
// POST /closing/create
// body: { business_id, sales_point_id, counted_cash, denominations, notes,
//         employee_id, closed_by }
// ============================
router.post('/create', async (req, res, next) => {
    try {
        const service = getService(req, 'CLOSING');
        const {business_id, counted_cash} = req.body;

        if (!business_id) {
            return res.status(400).json({
                status: 'error',
                message: 'business_id es requerido'
            });
        }

        if (counted_cash === undefined || counted_cash === null) {
            return res.status(400).json({
                status: 'error',
                message: 'counted_cash es requerido'
            });
        }

        const result = await service.closeDay(req.body);

        res.status(result.code || 201).json(result);
    } catch (error) {
        console.error('❌ Error creando cierre:', error);
        next(error);
    }
});

module.exports = router;