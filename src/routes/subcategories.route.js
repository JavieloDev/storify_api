// src/routes/subcategories.route.js
const express = require('express');
const router = express.Router();
const { getService } = require('../middlewares/headers');

// ============================
// LISTAR (paginado + filtros)
// POST /subcategories
// ============================
router.get('/:businessId/subcategories', async (req, res, next) => {
    try {
        const service = getService(req, 'SUBCATEGORY');
        const {businessId} = req.params;
        const {page = 1, limit = 10,filters = {}} = req.query;

        const result = await service.findBySubCategories(businessId, page, limit,filters);
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
// GET /subcategories/:id
// ============================
router.get('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'SUBCATEGORY');
        const { id } = req.params;

        const record = await service.findById(id);

        if (!record) {
            return res.status(404).json({ message: 'Subcategoría no encontrada' });
        }

        res.json(record);
    } catch (error) {
        next(error);
    }
});

// ============================
// CREAR
// POST /subcategories/create
// ============================
router.post('/create', async (req, res, next) => {
    try {
        const service = getService(req, 'SUBCATEGORY');

        const data = {
            name: req.body.name,
            description: req.body.description || '',
            priority: Number(req.body.priority) || 0,
            active: req.body.active !== undefined ? req.body.active : true,
            category_id: req.body.category_id,
        };

        const created = await service.create(data);

        res.status(201).json({
            status: 'success',
            code: 201,
            message: 'Subcategoría creada correctamente',
            data: created
        });
    } catch (error) {
        console.error('Error creando subcategoría:', error);
        next(error);
    }
});

// ============================
// ACTUALIZAR
// PUT /subcategories/:id
// ============================
router.put('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'SUBCATEGORY');
        const { id } = req.params;

        const data = {
            name: req.body.name,
            description: req.body.description || '',
            priority: Number(req.body.priority) || 0,
            active: req.body.active !== undefined ? req.body.active : true,
            category_id: req.body.category_id,
        };

        const updated = await service.update(id, data);

        res.json({
            status: 'success',
            code: 200,
            message: 'Subcategoría actualizada correctamente',
            data: updated
        });
    } catch (error) {
        console.error('Error actualizando subcategoría:', error);
        next(error);
    }
});

// ============================
// ELIMINAR (hard delete con validación)
// DELETE /subcategories/:id
// ============================
router.delete('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'SUBCATEGORY');
        const { id } = req.params;

        const result = await service.delete(id);

        res.json({
            status: 'success',
            code: 200,
            message: result.message || 'Subcategoría eliminada correctamente',
            data: result
        });
    } catch (error) {
        console.error('Error eliminando subcategoría:', error);

        if (error.message.includes('producto(s) asociado(s)')) {
            return res.status(409).json({
                status: 'error',
                code: 409,
                message: error.message
            });
        }

        next(error);
    }
});

// ============================
// OBTENER POR CATEGORÍA
// GET /subcategories/by-category/:categoryId
// ============================
router.get('/by-category/:categoryId', async (req, res, next) => {
    try {
        const service = getService(req, 'SUBCATEGORY');
        const { categoryId } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const result = await service.findByCategory(categoryId, page, limit);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// OBTENER SUBCATEGORÍAS ACTIVAS
// GET /subcategories/active
// ============================
router.get('/active', async (req, res, next) => {
    try {
        const service = getService(req, 'SUBCATEGORY');
        const { page = 1, limit = 10 } = req.query;
        const result = await service.findActive(page, limit);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// BUSCAR POR NOMBRE
// GET /subcategories/search?q=nombre
// ============================
router.get('/search', async (req, res, next) => {
    try {
        const service = getService(req, 'SUBCATEGORY');
        const { q, limit = 10 } = req.query;

        if (!q) {
            return res.status(400).json({ message: 'El parámetro "q" es requerido' });
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

// ============================
// ESTADÍSTICAS
// GET /subcategories/stats
// ============================
router.get('/stats', async (req, res, next) => {
    try {
        const service = getService(req, 'SUBCATEGORY');
        const stats = await service.getStats();
        res.json(stats);
    } catch (error) {
        next(error);
    }
});

module.exports = router;