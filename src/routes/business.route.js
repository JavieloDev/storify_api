const express = require('express');
const router = express.Router();

const {uploadBusinessImage, safeDestroy} = require('../middlewares/upload.handler');
const {getService} = require('../middlewares/headers');

// TODO(auth): descomentar cuando se reactive la autenticación
// const authMiddleware = require('../middlewares/auth.handler');

const stripClientMedia = (businessData = {}) => {
    const data = {...businessData};
    delete data.logo;
    delete data.banner;
    delete data.logo_public_id;
    delete data.banner_public_id;
    delete data.local_logo_path;
    delete data.local_banner_path;
    return data;
};

const parseBusinessBody = (req) => {
    const raw = req.body.business ? JSON.parse(req.body.business) : req.body;
    return stripClientMedia(raw);
};

const destroyUploadedBusinessFiles = async (req) => {
    const logoFile = req.files?.logo?.[0];
    const bannerFile = req.files?.banner?.[0];
    if (logoFile?.publicId) await safeDestroy(logoFile.publicId);
    if (bannerFile?.publicId) await safeDestroy(bannerFile.publicId);
};

const applyUploadedImages = (payload, req) => {
    const logoFile = req.files?.logo?.[0];
    const bannerFile = req.files?.banner?.[0];

    if (logoFile) {
        payload.logo = logoFile.path;
        payload.logo_public_id = logoFile.publicId;
    }
    if (bannerFile) {
        payload.banner = bannerFile.path;
        payload.banner_public_id = bannerFile.publicId;
    }

    return {logoFile, bannerFile};
};

router.post('/', /* authMiddleware, */ async (req, res, next) => {
    try {
        const {page = 1, limit = 10, where = {}} = req.body;
        const service = getService(req, 'BUSINESS');
        const result = await service.findAll({page, limit, where});
        res.status(result.code).json(result);
    } catch (error) {
        next(error);
    }
});

router.get('/lookup/:identifier', async (req, res, next) => {
    try {
        const {identifier} = req.params;
        const businessService = getService(req, 'BUSINESS');
        const business = await businessService.findBySlug(identifier);

        if (!business) {
            return res.status(404).json({status: 'error', code: 404, message: 'Negocio no encontrado'});
        }
        if (business.status !== 'active') {
            return res.status(403).json({status: 'error', code: 403, message: 'Negocio no activo'});
        }

        return res.status(200).json({status: 'success', code: 200, data: business});
    } catch (error) {
        next(error);
    }
});

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

router.get('/stats', async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const stats = await service.getStats();
        res.json({
            status: 'success',
            code: 200,
            message: 'Estadísticas obtenidas correctamente',
            data: stats,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/search', async (req, res, next) => {
    try {
        const {q, limit = 10} = req.query;

        if (!q) {
            return res.status(400).json({
                status: 'error',
                code: 400,
                message: 'El parámetro "q" es obligatorio.',
            });
        }

        const service = getService(req, 'BUSINESS');
        const rows = await service.searchByName(q, Number(limit));

        res.json({
            status: 'success',
            code: 200,
            message: 'Resultados obtenidos correctamente',
            data: rows,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/public/:slug', async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const business = await service.findBySlug(req.params.slug);

        if (!business || business.status !== 'active') {
            return res.status(404).json({
                status: 'error',
                code: 404,
                message: 'Negocio no disponible.',
            });
        }

        res.json({
            status: 'success',
            code: 200,
            message: 'Negocio obtenido correctamente',
            data: business,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/:id', /* authMiddleware, */ async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const {id} = req.params;

        const business = await service.findById(id);

        if (!business) {
            return res.status(404).json({
                status: 'error',
                code: 404,
                message: 'Negocio no encontrado.',
            });
        }

        res.json({
            status: 'success',
            code: 200,
            message: 'Negocio obtenido correctamente',
            data: business,
        });
    } catch (error) {
        next(error);
    }
});

router.post('/create', /* authMiddleware, */ uploadBusinessImage, async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const businessData = parseBusinessBody(req);

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
            plan_expires_at: businessData.plan_expires_at || null,
        };

        applyUploadedImages(payload, req);

        const business = await service.create(payload);

        res.status(201).json({
            status: 'success',
            code: 201,
            message: 'Negocio creado correctamente',
            data: business,
        });
    } catch (error) {
        console.error('Error creando negocio:', error);
        await destroyUploadedBusinessFiles(req);
        next(error);
    }
});

router.put('/:id', /* authMiddleware, */ uploadBusinessImage, async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const {id} = req.params;

        const existing = await service.findById(id);
        if (!existing) {
            await destroyUploadedBusinessFiles(req);
            return res.status(404).json({
                status: 'error',
                code: 404,
                message: 'Negocio no encontrado',
            });
        }

        const businessData = parseBusinessBody(req);

        const payload = {
            name: businessData.name,
            description: businessData.description,
            category: businessData.category,
            tags: businessData.tags,
            email: businessData.email,
            phone: businessData.phone,
            address: businessData.address,
            currency: businessData.currency,
            timezone: businessData.timezone,
            social_links: businessData.social_links,
            settings: businessData.settings,
            plan: businessData.plan,
            plan_expires_at: businessData.plan_expires_at,
        };

        const {logoFile, bannerFile} = applyUploadedImages(payload, req);

        const updated = await service.update(id, payload);

        if (logoFile && existing.logo_public_id) {
            await safeDestroy(existing.logo_public_id);
        }
        if (bannerFile && existing.banner_public_id) {
            await safeDestroy(existing.banner_public_id);
        }

        res.json({
            status: 'success',
            code: 200,
            message: 'Negocio actualizado correctamente',
            data: updated,
        });
    } catch (error) {
        console.error('Error actualizando negocio:', error);
        await destroyUploadedBusinessFiles(req);
        next(error);
    }
});

router.patch('/:id/suspend', /* authMiddleware, */ async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const {id} = req.params;
        const {reason} = req.body;

        const business = await service.suspend(id, reason);

        res.json({
            status: 'success',
            code: 200,
            message: 'Negocio suspendido correctamente',
            data: business,
        });
    } catch (error) {
        console.error('Error suspendiendo negocio:', error);
        next(error);
    }
});

router.patch('/:id/reactivate', /* authMiddleware, */ async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const {id} = req.params;

        const business = await service.reactivate(id);

        res.json({
            status: 'success',
            code: 200,
            message: 'Negocio reactivado correctamente',
            data: business,
        });
    } catch (error) {
        console.error('Error reactivando negocio:', error);
        next(error);
    }
});

router.delete('/:id', /* authMiddleware, */ async (req, res, next) => {
    try {
        const service = getService(req, 'BUSINESS');
        const {id} = req.params;
        const result = await service.delete(id);
        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error eliminando negocio:', error);
        return res.status(500).json({
            status: 'error',
            code: 500,
            message: 'Error interno del servidor',
            data: null,
        });
    }
});

module.exports = router;