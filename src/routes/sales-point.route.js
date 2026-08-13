// src/routes/salesPoints.route.js
const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');

// ============================
// LISTAR por negocio (paginado + filtros)
// GET /sales-points/:businessId
// ============================
router.get('/:businessId', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {businessId} = req.params;
        const {page = 1, limit = 10, name, status} = req.query;

        const result = await service.findByBusiness(businessId, page, limit, {name, status});
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// OBTENER POR ID (con productos y usuarios)
// GET /sales-points/detail/:id
// ============================
router.get('/detail/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id} = req.params;

        const result = await service.findById(id, {withRelations: true});

        if (!result.data) {
            return res.status(404).json({message: 'Punto de venta no encontrado'});
        }

        res.json(result.data);
    } catch (error) {
        next(error);
    }
});

// ============================
// CREAR
// POST /sales-points/create
// ============================
router.post('/create', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');

        const data = {
            name: req.body.name,
            description: req.body.description || '',
            address: req.body.address || {},
            phone: req.body.phone || null,
            status: req.body.status || 'active',
            business_id: req.body.business_id,
        };

        const {products = [], users = []} = req.body;

        const created = await service.create(data, {products, users});

        res.status(201).json({
            status: 'success',
            code: 201,
            message: 'Punto de venta creado correctamente',
            data: created
        });
    } catch (error) {
        console.error('Error creando punto de venta:', error);
        res.status(422).json({status: 'error', code: 422, message: error.message});
    }
});

// ============================
// ACTUALIZAR
// PUT /sales-points/:id
// ============================
router.put('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id} = req.params;

        const data = {
            name: req.body.name,
            description: req.body.description || '',
            address: req.body.address || {},
            phone: req.body.phone || null,
            status: req.body.status || 'active',
            business_id: req.body.business_id,
        };

        const updated = await service.update(id, data);

        res.json({
            status: 'success',
            code: 200,
            message: 'Punto de venta actualizado correctamente',
            data: updated
        });
    } catch (error) {
        console.error('Error actualizando punto de venta:', error);
        next(error);
    }
});

// ============================
// ELIMINAR
// DELETE /sales-points/:id
// ============================
router.delete('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id} = req.params;

        const result = await service.delete(id);
        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error eliminando punto de venta:', error);
        return res.status(500).json({
            status: 'error',
            code: 500,
            message: 'Error interno del servidor',
            data: null
        });
    }
});

// ============================
// ASIGNAR PRODUCTOS (reemplaza el set completo)
// PUT /sales-points/:id/products
// body: { products: [{ product_id, active?, custom_price? }] | ["productId1", ...] }
// ============================
router.put('/:id/products', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id} = req.params;
        const {products = []} = req.body;

        const result = await service.setProducts(id, products);

        res.json({
            status: 'success',
            code: 200,
            message: 'Productos del punto de venta actualizados',
            data: result
        });
    } catch (error) {
        console.error('Error asignando productos:', error);
        next(error);
    }
});

// ============================
// QUITAR UN PRODUCTO PUNTUAL
// DELETE /sales-points/:id/products/:productId
// ============================
router.delete('/:id/products/:productId', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id, productId} = req.params;

        const removed = await service.removeProduct(id, productId);

        if (!removed) {
            return res.status(404).json({message: 'Asignación no encontrada'});
        }

        res.json({status: 'success', code: 200, message: 'Producto removido del punto de venta'});
    } catch (error) {
        next(error);
    }
});

// ============================
// ASIGNAR USUARIOS (mockeado, reemplaza el set completo)
// PUT /sales-points/:id/users
// body: { users: [{ user_id, user_name?, role? }] }
// ============================
router.put('/:id/users', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id} = req.params;
        const {users = []} = req.body;

        const result = await service.setUsers(id, users);

        res.json({
            status: 'success',
            code: 200,
            message: 'Usuarios del punto de venta actualizados',
            data: result
        });
    } catch (error) {
        console.error('Error asignando usuarios:', error);
        next(error);
    }
});

// ============================
// QUITAR UN USUARIO PUNTUAL
// DELETE /sales-points/:id/users/:userId
// ============================
router.delete('/:id/users/:userId', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id, userId} = req.params;

        const removed = await service.removeUser(id, userId);

        if (!removed) {
            return res.status(404).json({message: 'Asignación no encontrada'});
        }

        res.json({status: 'success', code: 200, message: 'Usuario removido del punto de venta'});
    } catch (error) {
        next(error);
    }
});

// agregar en src/routes/salesPoints.route.js

// ============================
// CANTIDAD DISPONIBLE DE UN PRODUCTO (para que el front sepa el máximo)
// GET /sales-points/:id/products/:productId/available
// ============================
router.get('/:id/products/:productId/available', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id, productId} = req.params;

        const result = await service.getAvailableQuantity(productId, id);
        res.json({status: 'success', code: 200, data: result});
    } catch (error) {
        next(error);
    }
});

// ============================
// ASIGNAR/ACTUALIZAR UN SOLO PRODUCTO (incremental)
// POST /sales-points/:id/products
// body: { product_id, assigned_quantity, active?, custom_price? }
// ============================
router.post('/:id/products', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id} = req.params;

        const result = await service.assignProduct(id, req.body);

        res.json({
            status: 'success',
            code: 200,
            message: 'Producto asignado correctamente',
            data: result
        });
    } catch (error) {
        // Los errores de validación de stock vienen como Error normal (mensaje descriptivo)
        res.status(422).json({status: 'error', code: 422, message: error.message});
    }
});

// ============================
// ASIGNAR DISPOSITIVOS (reemplaza el set completo)
// PUT /sales-points/:id/devices
// body: { devices: [{ device_id, active? }] | ["deviceId1", ...] }
// ============================
router.put('/:id/devices', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id} = req.params;
        const {devices = []} = req.body;

        const result = await service.setDevices(id, devices);

        res.json({
            status: 'success',
            code: 200,
            message: 'Dispositivos del punto de venta actualizados',
            data: result
        });
    } catch (error) {
        console.error('Error asignando dispositivos:', error);
        next(error);
    }
});

// ============================
// QUITAR UN DISPOSITIVO PUNTUAL
// DELETE /sales-points/:id/devices/:deviceId
// ============================
router.delete('/:id/devices/:deviceId', async (req, res, next) => {
    try {
        const service = getService(req, 'SALES_POINT');
        const {id, deviceId} = req.params;

        const removed = await service.removeDevice(id, deviceId);

        if (!removed) {
            return res.status(404).json({message: 'Asignación no encontrada'});
        }

        res.json({status: 'success', code: 200, message: 'Dispositivo removido del punto de venta'});
    } catch (error) {
        next(error);
    }
});

module.exports = router;