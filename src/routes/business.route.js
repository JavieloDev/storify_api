// src/routes/business.routes.js
const express = require('express');
const router = express.Router();

const {sequelize} = require('../db/models');
const BusinessService = require('../services/business.service');
const {uploadImage} = require('../middlewares/upload.handler');
const {getService} = require("../middlewares/headers");

// TODO(auth): descomentar cuando se reactive la autenticación
// const authMiddleware = require('../middlewares/auth.handler');

// ============================
// LISTAR (paginado + filtros)
// POST /businesses
// ============================
router.post('/', /* authMiddleware, */ async (req, res, next) => {
    try {
        const {page = 1, limit = 10, filters = {}} = req.body;
        const service = getService(req, 'BUSINESS');
        const result = await service.findAll({page, limit, filters});
        res.status(result.code).json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// LISTAR NEGOCIOS ACTIVOS
// GET /businesses/active
// ============================
router.get('/active', async (req, res, next) => {
    try {
        const {page = 1, limit = 10} = req.query;
        const service = getService(req, 'BUSINESS');
        const result = await service.findActive(page, limit);
        res.status(result.code).json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// ESTADÍSTICAS
// GET /businesses/stats
// ============================
router.get('/stats', async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const stats = await service.getStats();
        res.json({
            status: 'success', code: 200, message: 'Estadísticas obtenidas correctamente', data: stats
        });
    } catch (error) {
        next(error);
    }
});

// ============================
// BUSCAR POR NOMBRE
// GET /businesses/search?q=nombre&limit=10
// ============================
router.get('/search', async (req, res, next) => {
    try {
        const {q, limit = 10} = req.query;

        if (!q) {
            return res.status(400).json({
                status: 'error', code: 400, message: 'El parámetro "q" es obligatorio.'
            });
        }

        const service = getService(req, 'BUSINESS');
        const rows = await service.searchByName(q, Number(limit));

        res.json({
            status: 'success', code: 200, message: 'Resultados obtenidos correctamente', data: rows
        });
    } catch (error) {
        next(error);
    }
});

// ============================
// OBTENER NEGOCIO PÚBLICO POR SLUG
// GET /businesses/public/:slug
// ============================
router.get('/public/:slug', async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const business = await service.findBySlug(req.params.slug);

        if (!business || business.status !== 'active') {
            return res.status(404).json({
                status: 'error', code: 404, message: 'Negocio no disponible.'
            });
        }

        res.json({
            status: 'success', code: 200, message: 'Negocio obtenido correctamente', data: business
        });
    } catch (error) {
        next(error);
    }
});

// ============================
// OBTENER POR ID
// GET /businesses/:id
// ============================
router.get('/:id', /* authMiddleware, */ async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const {id} = req.params;

        const business = await service.findById(id);

        if (!business) {
            return res.status(404).json({
                status: 'error', code: 404, message: 'Negocio no encontrado.'
            });
        }

        // TODO(auth): validar que business.owner_id === req.user.id

        res.json({
            status: 'success', code: 200, message: 'Negocio obtenido correctamente', data: business
        });
    } catch (error) {
        next(error);
    }
});

// ============================
// CREAR
// POST /business/create
// ============================
router.post('/create', /* authMiddleware, */ uploadImage, async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        let businessData;
        if (req.body.business) {
            businessData = JSON.parse(req.body.business);
        } else {
            businessData = req.body;
        }

        const payload = {
            name: businessData.name,
            description: businessData.description || null,
            slug: businessData.slug || null,
            category: businessData.category || null,
            tags: businessData.tags || [],
            owner_id: businessData.owner_id || '',
            email: businessData.email || null,
            phone: businessData.phone || null,
            address: businessData.address || {},
            currency: businessData.currency || 'USD',
            timezone: businessData.timezone || 'UTC',
            social_links: businessData.social_links || {},
            settings: businessData.settings || {},
            plan: businessData.plan || 'free',
            plan_expires_at: businessData.plan_expires_at || null, // status: 'pending', // Se establece por defecto en el modelo
        };

        if (req.file) {
            payload.logo = `/uploads/${req.file.filename}`;
        }
        console.log(payload);
        const business = await service.create(payload /*, req.user.id */);

        res.status(201).json({
            status: 'success', code: 201, message: 'Negocio creado correctamente', data: business
        });
    } catch (error) {
        console.error('Error creando negocio:', error);
        console.error('MENSAJE:', error.message);
        console.error('ORIGINAL:', error.original?.message); // el mensaje real de Postgres
        console.error('SQL:', error.sql);
        next(error);
    }
});

// ============================
// ACTUALIZAR
// PUT /businesses/:id
// ============================
router.put('/:id', /* authMiddleware, */ uploadImage, async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const {id} = req.params;

        // Verificar que existe
        const existing = await service.findById(id);
        if (!existing) {
            return res.status(404).json({
                status: 'error', code: 404, message: 'Negocio no encontrado'
            });
        }

        const payload = {
            name: req.body.name,
            description: req.body.description,
            category: req.body.category,
            tags: req.body.tags,
            email: req.body.email,
            phone: req.body.phone,
            address: req.body.address,
            currency: req.body.currency,
            timezone: req.body.timezone,
            social_links: req.body.social_links,
            settings: req.body.settings,
            plan: req.body.plan,
            plan_expires_at: req.body.plan_expires_at,
        };

        if (req.file) {
            payload.logo = `/uploads/${req.file.filename}`;
        }

        const updated = await service.update(id, payload /*, req.user.id */);

        res.json({
            status: 'success', code: 200, message: 'Negocio actualizado correctamente', data: updated
        });
    } catch (error) {
        console.error('Error actualizando negocio:', error);
        next(error);
    }
});

// ============================
// SUSPENDER
// PATCH /businesses/:id/suspend
// ============================
router.patch('/:id/suspend', /* authMiddleware, */ async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const {id} = req.params;
        const {reason} = req.body;

        const business = await service.suspend(id, reason /*, req.user.id */);

        res.json({
            status: 'success', code: 200, message: 'Negocio suspendido correctamente', data: business
        });
    } catch (error) {
        console.error('Error suspendiendo negocio:', error);
        next(error);
    }
});

// ============================
// REACTIVAR
// PATCH /businesses/:id/reactivate
// ============================
router.patch('/:id/reactivate', /* authMiddleware, */ async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const {id} = req.params;

        const business = await service.reactivate(id /*, req.user.id */);

        res.json({
            status: 'success', code: 200, message: 'Negocio reactivado correctamente', data: business
        });
    } catch (error) {
        console.error('Error reactivando negocio:', error);
        next(error);
    }
});

// ============================
// ELIMINAR (soft delete)
// DELETE /businesses/:id
// ============================
router.delete('/:id', /* authMiddleware, */ async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const {id} = req.params;

        const result = await service.delete(id /*, req.user.id */);

        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error eliminando negocio:', error);
        return res.status(500).json({
            status: 'error', code: 500, message: 'Error interno del servidor', data: null
        });
    }
});

module.exports = router;