const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');

const FILTERABLE = ['status', 'label', 'device_uuid', 'platform'];

function parseFilters(query) {
    const raw = query.filter;
    let parsed = {};

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        parsed = raw;
    } else if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    }

    const flat = {};                      
    for (const key of FILTERABLE) {
        if (query[key] !== undefined) flat[key] = query[key];
    }

    const merged = { ...parsed, ...flat };
    return Object.fromEntries(
        Object.entries(merged).filter(([k, v]) => FILTERABLE.includes(k) && v !== '' && v != null)
    );
}

router.get('/:businessId/devices', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');
        const { businessId } = req.params;
        const { page = 1, limit = 10, since } = req.query;

        const result = await service.findByBusiness(businessId, page, limit, parseFilters(req.query), since);
        result.serverTime = new Date().toISOString();
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// OBTENER POR ID
// GET /devices/:id
// ============================
router.get('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');
        const { id } = req.params;

        const record = await service.findById(id);
        res.status(record.code).json(record);
    } catch (error) {
        next(error);
    }
});

// ============================
// REGISTRAR DISPOSITIVO
// POST /devices/create
// ============================
router.post('/create', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');

        const data = {
            business_id: req.body.business_id,
            device_uuid: req.body.device_uuid,
            label: req.body.label || null,
            native_device_id: req.body.native_device_id || null,
            platform: req.body.platform || null,
            model: req.body.model || null,
        };

        const created = await service.create(data);

        res.status(201).json({
            status: 'success',
            code: 201,
            message: 'Dispositivo registrado correctamente',
            data: created
        });
    } catch (error) {
        console.error('Error registrando dispositivo:', error);
        next(error);
    }
});

// ============================
// ACTUALIZAR DISPOSITIVO
// PUT /devices/:id
// ============================
router.put('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');
        const { id } = req.params;

        const data = {};
        if (req.body.label !== undefined) data.label = req.body.label;
        if (req.body.device_uuid !== undefined) data.device_uuid = req.body.device_uuid;
        if (req.body.native_device_id !== undefined) data.native_device_id = req.body.native_device_id;
        if (req.body.status !== undefined) data.status = req.body.status;

        const updated = await service.update(id, data);

        res.json({
            status: 'success',
            code: 200,
            message: 'Dispositivo actualizado correctamente',
            data: updated
        });
    } catch (error) {
        console.error('Error actualizando dispositivo:', error);
        next(error);
    }
});

// ============================
// CAMBIAR ESTADO
// PATCH /devices/:id/status
// ============================
router.patch('/:id/status', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                status: 'error',
                code: 400,
                message: 'El campo "status" es requerido'
            });
        }

        const result = await service.updateStatus(id, status);
        res.status(result.code).json(result);
    } catch (error) {
        console.error('Error actualizando estado del dispositivo:', error);
        next(error);
    }
});

// ============================
// ACTUALIZAR LAST_SEEN
// PATCH /devices/:id/touch
// ============================
router.patch('/:id/touch', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');
        const { id } = req.params;

        const result = await service.touchLastSeen(id);
        res.status(result.code).json(result);
    } catch (error) {
        console.error('Error actualizando last_seen:', error);
        next(error);
    }
});

// ============================
// ELIMINAR DISPOSITIVO
// DELETE /devices/:id
// ============================
router.delete('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');
        const { id } = req.params;

        const result = await service.delete(id);
        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error eliminando dispositivo:', error);
        return res.status(500).json({
            status: 'error',
            code: 500,
            message: 'Error interno del servidor',
            data: null
        });
    }
});

module.exports = router;