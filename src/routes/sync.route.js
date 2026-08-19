const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');

/**
 * POST /api/v1/sync/:businessId/heartbeat
 * body: { device_id }
 *
 * Se llama al arrancar el POS, ANTES de bajar catálogo. Valida en un solo
 * round-trip que:
 *  (a) el negocio siga activo (no suspendido/cancelado/pending)
 *  (b) si viene device_id, que el dispositivo exista, pertenezca a ESE
 *      negocio y siga activo
 * Evita gastar 3-4 requests de catálogo para terminar descubriendo que
 * el negocio está suspendido o el device fue dado de baja.
 */
router.post('/:businessId/heartbeat', async (req, res, next) => {
    try {
        const {businessId} = req.params;
        const {device_id} = req.body;

        const businessService = getService(req, 'BUSINESS');
        const business = await businessService.findById(businessId);

        if (!business) {
            return res.status(404).json({
                status: 'error', code: 404,
                message: 'Negocio no encontrado',
            });
        }

        if (business.status !== 'active') {
            return res.status(403).json({
                status: 'error', code: 403,
                message: 'El negocio no está activo — no se puede sincronizar',
            });
        }

        if (device_id) {
            const deviceService = getService(req, 'DEVICE');
            const device = await deviceService.findById(device_id);

            // 🔧 esto lo agregué respecto al borrador anterior: antes solo
            // se actualizaba last_seen_at sin chequear que el device sea de
            // ESTE negocio ni que siga activo — un device deshabilitado o
            // de otro tenant pasaba igual.
            if (!device || device.business_id !== businessId) {
                return res.status(403).json({
                    status: 'error', code: 403,
                    message: 'Dispositivo no autorizado para este negocio',
                });
            }

            if (device.status !== 'active') {
                return res.status(403).json({
                    status: 'error', code: 403,
                    message: 'Dispositivo deshabilitado — contactá al administrador',
                });
            }

            await deviceService.update(device_id, {last_seen_at: new Date()});
        }

        res.json({
            status: 'success', code: 200,
            message: 'ok',
            serverTime: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;