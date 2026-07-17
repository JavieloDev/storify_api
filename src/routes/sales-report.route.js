const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');

// Todos los endpoints aceptan estos query params opcionales:
//   date_from, date_to      -> filtran por order.created_at (formato ISO: 2026-07-01)
//   include_cancelled       -> 'true' para incluir órdenes canceladas (por defecto se excluyen)

// ============================
// RESUMEN GENERAL DE VENTAS
// GET /sales-report/:businessId/summary
// ============================
router.get('/:businessId/summary', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_REPORT');
        const {businessId} = req.params;
        const {date_from, date_to, include_cancelled} = req.query;

        const summary = await service.getSalesSummary(businessId, {
            date_from,
            date_to,
            include_cancelled: include_cancelled === 'true',
        });

        res.json({
            status: 'success',
            code: 200,
            message: 'Resumen de ventas obtenido correctamente',
            data: summary,
        });
    } catch (error) {
        next(error);
    }
});

// ============================
// VENTAS POR ESTADO
// GET /sales-report/:businessId/by-status
// ============================
router.get('/:businessId/by-status', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_REPORT');
        const {businessId} = req.params;
        const {date_from, date_to} = req.query;

        const data = await service.getSalesByStatus(businessId, {date_from, date_to});

        res.json({
            status: 'success',
            code: 200,
            message: 'Ventas por estado obtenidas correctamente',
            data,
        });
    } catch (error) {
        next(error);
    }
});

// ============================
// PRODUCTOS MÁS VENDIDOS
// GET /sales-report/:businessId/top-products
// query adicional: limit (default 10, máx 100)
// ============================
router.get('/:businessId/top-products', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_REPORT');
        const {businessId} = req.params;
        const {date_from, date_to, include_cancelled, limit} = req.query;

        const data = await service.getTopProducts(businessId, {
            date_from,
            date_to,
            include_cancelled: include_cancelled === 'true',
            limit,
        });

        res.json({
            status: 'success',
            code: 200,
            message: 'Productos más vendidos obtenidos correctamente',
            data,
        });
    } catch (error) {
        next(error);
    }
});

// ============================
// VENTAS POR PERIODO (para gráficas de tendencia)
// GET /sales-report/:businessId/by-period
// query adicional: group_by = 'day' | 'month' | 'year' (default 'day')
// ============================
router.get('/:businessId/by-period', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_REPORT');
        const {businessId} = req.params;
        const {date_from, date_to, include_cancelled, group_by} = req.query;

        const data = await service.getSalesByPeriod(businessId, {
            date_from,
            date_to,
            include_cancelled: include_cancelled === 'true',
            group_by,
        });

        res.json({
            status: 'success',
            code: 200,
            message: 'Ventas por periodo obtenidas correctamente',
            data,
        });
    } catch (error) {
        next(error);
    }
});

// ============================
// REPORTE COMPLETO (para dashboards)
// GET /sales-report/:businessId/full
// ============================
router.get('/:businessId/full', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_REPORT');
        const {businessId} = req.params;
        const {date_from, date_to, include_cancelled, limit, group_by} = req.query;

        const data = await service.getFullReport(businessId, {
            date_from,
            date_to,
            include_cancelled: include_cancelled === 'true',
            limit,
            group_by,
        });

        res.json({
            status: 'success',
            code: 200,
            message: 'Reporte de ventas obtenido correctamente',
            data,
        });
    } catch (error) {
        next(error);
    }
});

// ============================
// PRODUCTOS: CANTIDAD, VENDIDO, DISPONIBLE, SUBTOTAL, GANANCIA
// GET /sales-report/:businessId/products
// ============================
router.get('/:businessId/products', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_REPORT');
        const {businessId} = req.params;
        const {date_from, date_to, include_cancelled} = req.query;

        const data = await service.getProductsSalesReport(businessId, {
            date_from,
            date_to,
            include_cancelled: include_cancelled === 'true',
        });

        res.json({
            status: 'success',
            code: 200,
            message: 'Reporte de productos obtenido correctamente',
            data,
        });
    } catch (error) {
        console.error('MENSAJE:', error.message);
        console.error('ORIGINAL:', error.original?.message);
        console.error('SQL:', error.sql);
        next(error);
    }
});

module.exports = router;