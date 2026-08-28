const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');

// ============================
// LISTAR EMPLEADOS DE UN NEGOCIO (usado por SyncService del POS)
// GET /:businessId/employees
// ============================
router.get('/:businessId/employees', async (req, res, next) => {
    try {
        const service = getService(req, 'EMPLOYEE');
        const {businessId} = req.params;
        const {page = 1, limit = 1000, filter = {}, since} = req.query;

        const result = await service.findByBusiness(businessId, page, limit, filter, since);
        result.serverTime = new Date().toISOString();
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// OBTENER POR ID
// GET /employees/:id
// ============================
router.get('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'EMPLOYEE');
        const {id} = req.params;

        const record = await service.findById(id);
        res.status(record.code).json(record);
    } catch (error) {
        next(error);
    }
});

// ============================
// REGISTRAR EMPLEADO
// POST /employees/create
// body: { business_id, name, email?, pin, role? }
// ============================
router.post('/create', async (req, res, next) => {
    try {
        const service = getService(req, 'EMPLOYEE');

        const created = await service.create(req.body);

        res.status(201).json({
            status: 'success',
            code: 201,
            message: 'Empleado registrado correctamente',
            data: created,
        });
    } catch (error) {
        console.error('Error registrando empleado:', error);
        next(error);
    }
});

// ============================
// ACTUALIZAR EMPLEADO
// PUT /employees/:id
// body: { name?, email?, role?, status?, pin? }
// ============================
router.put('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'EMPLOYEE');
        const {id} = req.params;

        const updated = await service.update(id, req.body);

        res.json({
            status: 'success',
            code: 200,
            message: 'Empleado actualizado correctamente',
            data: updated,
        });
    } catch (error) {
        console.error('Error actualizando empleado:', error);
        next(error);
    }
});

// ============================
// CAMBIAR ESTADO
// PATCH /employees/:id/status
// ============================
router.patch('/:id/status', async (req, res, next) => {
    try {
        const service = getService(req, 'EMPLOYEE');
        const {id} = req.params;
        const {status} = req.body;

        if (!status) {
            return res.status(400).json({
                status: 'error',
                code: 400,
                message: 'El campo "status" es requerido',
            });
        }

        const result = await service.updateStatus(id, status);
        res.status(result.code).json(result);
    } catch (error) {
        console.error('Error actualizando estado del empleado:', error);
        next(error);
    }
});

// ============================
// ELIMINAR EMPLEADO (soft delete)
// DELETE /employees/:id
// ============================
router.delete('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'EMPLOYEE');
        const {id} = req.params;

        const result = await service.delete(id);
        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error eliminando empleado:', error);
        return res.status(500).json({
            status: 'error',
            code: 500,
            message: 'Error interno del servidor',
            data: null,
        });
    }
});

// ============================
// VALIDAR PIN (ONLINE — fallback / primer login antes de tener sync local)
// POST /employees/:businessId/validate-pin
// body: { pin }
// ============================
router.post('/:businessId/validate-pin', async (req, res, next) => {
    try {
        const service = getService(req, 'EMPLOYEE');
        const {businessId} = req.params;
        const {pin} = req.body;

        if (!pin) {
            return res.status(400).json({
                status: 'error',
                code: 400,
                message: 'El campo "pin" es requerido',
            });
        }

        const result = await service.validatePin(businessId, pin);
        res.status(result.code).json(result);
    } catch (error) {
        next(error);
    }
});

module.exports = router;