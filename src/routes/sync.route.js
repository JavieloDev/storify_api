const express = require('express');
const router = express.Router();
const { getService } = require('../middlewares/headers');

/**
 * POST /api/v1/sync/:businessId/heartbeat
 *
 * Por ahora solamente valida que el negocio:
 * 1. exista
 * 2. esté activo
 */
router.post('/:businessId/heartbeat', async (req, res, next) => {
    try {
        const { businessId } = req.params;

        console.log('[SYNC HEARTBEAT]', {
            businessId,
        });

        const businessService = getService(req, 'BUSINESS');

        if (!businessService) {
            throw new Error('BUSINESS service no disponible');
        }

        const business = await businessService.findById(businessId);

        console.log('[SYNC HEARTBEAT] business:', business);

        if (!business) {
            return res.status(404).json({
                status: 'error',
                code: 404,
                message: 'Negocio no encontrado',
            });
        }

        if (business.status !== 'active') {
            return res.status(403).json({
                status: 'error',
                code: 403,
                message: 'El negocio no está activo — no se puede sincronizar',
            });
        }

        return res.status(200).json({
            status: 'success',
            code: 200,
            message: 'ok',
            serverTime: new Date().toISOString(),
        });

    } catch (error) {
        console.error('[SYNC HEARTBEAT ERROR]', error);
        next(error);
    }
});

module.exports = router;