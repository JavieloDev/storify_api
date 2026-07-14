// src/routes/categories.route.js
const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');

// ============================
// LISTAR (paginado + filtros)
// POST /categories
// ============================
router.get('/:businessId/categories', async (req, res, next) => {
    try {
        const service = getService(req, 'CATEGORY');
        const {businessId} = req.params;
        const {page = 1, limit = 10, filter = {}} = req.query;

        const result = await service.findByCategories(businessId, page, limit, filter);
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
// GET /categories/:id
// ============================
router.get('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'CATEGORY');
        const {id} = req.params;

        const record = await service.findById(id);

        if (!record) {
            return res.status(404).json({message: 'Categoría no encontrada'});
        }

        res.json(record);
    } catch (error) {
        next(error);
    }
});

// ============================
// CREAR
// POST /categories/create
// ============================
router.post('/create', async (req, res, next) => {
    try {
        const service = getService(req, 'CATEGORY');

        const data = {
            name: req.body.name,
            description: req.body.description || '',
            priority: parseInt(req.body.priority) || 0,
            active: req.body.active !== undefined ? req.body.active : true,
            icon: req.body.icon || null,
        };

        const created = await service.create(data);

        res.status(201).json({
            status: 'success',
            code: 201,
            message: 'Categoría creada correctamente',
            data: created
        });
    } catch (error) {
        console.error('Error creando categoría:', error);
        next(error);
    }
});

// ============================
// ACTUALIZAR
// PUT /categories/:id
// ============================
router.put('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'CATEGORY');
        const {id} = req.params;

        // Verificar que existe
        const existing = await service.findById(id);
        if (!existing) {
            return res.status(404).json({message: 'Categoría no encontrada'});
        }

        // ✅ CORREGIDO: active se actualiza correctamente
        const data = {
            name: req.body.name,
            description: req.body.description || '',
            priority: parseInt(req.body.priority) || 0,
            active: req.body.active !== undefined ? req.body.active : true,
            icon: req.body.icon || null,
        };

        const updated = await service.update(id, data);

        res.json({
            status: 'success',
            code: 200,
            message: 'Categoría actualizada correctamente',
            data: updated
        });
    } catch (error) {
        console.error('Error actualizando categoría:', error);
        next(error);
    }
});

// ============================
// ELIMINAR (soft delete)
// DELETE /categories/:id
// ============================
router.delete('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'CATEGORY');
        const {id} = req.params;

        const result = await service.delete(id);

        // ✅ Usar el resultado del servicio directamente
        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error eliminando categoría:', error);
        return res.status(500).json({
            status: 'error',
            code: 500,
            message: 'Error interno del servidor',
            data: null
        });
    }
});

// ============================
// OBTENER CATEGORÍAS ACTIVAS
// GET /categories/active
// ============================
router.get('/active', async (req, res, next) => {
    try {
        const service = getService(req, 'CATEGORY');
        const {page = 1, limit = 10} = req.query;
        const result = await service.findActive(page, limit);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// OBTENER CON PRODUCTOS
// GET /categories/with-products
// ============================
router.get('/with-products', async (req, res, next) => {
    try {
        const service = getService(req, 'CATEGORY');
        const {page = 1, limit = 10} = req.query;
        const result = await service.findWithProducts(page, limit);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// BUSCAR POR NOMBRE
// GET /categories/search?q=nombre
// ============================
router.get('/search', async (req, res, next) => {
    try {
        const service = getService(req, 'CATEGORY');
        const {q, limit = 10} = req.query;

        if (!q) {
            return res.status(400).json({message: 'El parámetro "q" es requerido'});
        }

        const result = await service.searchByName(q, limit);
        res.json({
            status: 'success',
            code: 200,
            data: result
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;