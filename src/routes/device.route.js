const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');

// ============================
// LISTAR (paginado + filtros)
// GET /:businessId/devices
// ============================
router.get('/:businessId/devices', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');
        const {businessId} = req.params;
        const {page = 1, limit = 10, filter = {}} = req.query;

        const result = await service.findByBusiness(businessId, page, limit, filter);
        res.json(result);
    } catch (error) {
        console.error('MENSAJE:', error.message);
        console.error('ORIGINAL:', error.original?.message);
        console.error('SQL:', error.sql);
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
        const {id} = req.params;

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
// ACTUALIZAR (ej: renombrar)
// PUT /devices/:id
// ============================
router.put('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');
        const {id} = req.params;

        const data = {};
        if (req.body.label !== undefined) data.label = req.body.label;
        if (req.body.device_uuid !== undefined) data.device_uuid = req.body.device_uuid;
        if (req.body.native_device_id !== undefined) data.native_device_id = req.body.native_device_id;
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
// CAMBIAR ESTADO (aprobar / bloquear / pending)
// PATCH /devices/:id/status
// ============================
router.patch('/:id/status', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');
        const {id} = req.params;
        const {status} = req.body;

        const result = await service.updateStatus(id, status);
        res.status(result.code).json(result);
    } catch (error) {
        console.error('Error actualizando estado del dispositivo:', error);
        next(error);
    }
});

// ============================
// ELIMINAR (soft delete)
// DELETE /devices/:id
// ============================
router.delete('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'DEVICE');
        const {id} = req.params;

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