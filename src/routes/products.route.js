const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');
const {uploadImage, safeDestroy} = require('../middlewares/upload.handler');
const parseFilterQuery = require('../middlewares/parse-filter');

const stripClientMedia = (productData = {}) => {
    const data = {...productData};
    delete data.image;
    delete data.thumbnail_url;
    delete data.image_public_id;
    return data;
};

const parseProductBody = (req) => {
    const raw = req.body.product ? JSON.parse(req.body.product) : req.body;
    return stripClientMedia(raw);
};

const mapProductPayload = (productData) => ({
    name: productData.name,
    description: productData.description || '',
    brand: productData.brand || '',
    barcode: productData.barcode || null,
    price: parseFloat(productData.price) || 0,
    original_price: parseFloat(productData.original_price) || parseFloat(productData.price) || 0,
    discount: parseFloat(productData.discount) || 0,
    profit_percentage: parseFloat(productData.profit_percentage) || 0,
    sales_price: parseFloat(productData.sales_price) || 0,
    subcategory_id: productData.subcategory_id || productData.sub_category || null,
    stock: parseInt(productData.stock) || parseInt(productData.quantity) || 0,
    colors: productData.colors || [],
    featured: productData.featured === true || productData.featured === 'true' || false,
    on_sale: productData.on_sale === true || productData.on_sale === 'true' || false,
    is_new: productData.is_new === true || productData.is_new === 'true' || false,
    stock_status: productData.stock_status || 'in_stock',
    is_active: true,
    business_id: productData.business_id,
});

router.get('/:businessId/products', parseFilterQuery, async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
        const {businessId} = req.params;
        const {page = 1, limit = 10, filter, not_paginated = false, since} = req.query;

        const result = await service.findByBusiness(businessId, page, limit, filter, not_paginated, since);
        result.serverTime = new Date().toISOString();
        res.json(result);
    } catch (error) {
        console.error('MENSAJE:', error.message);
        next(error);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
        const {id} = req.params;
        const record = await service.findById(id);

        if (!record || record.code === 404) {
            return res.status(404).json({message: 'Producto no encontrado'});
        }

        res.json(record);
    } catch (error) {
        next(error);
    }
});

router.post('/create', uploadImage, async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
        const productData = parseProductBody(req);
        const data = mapProductPayload(productData);

        if (!data.subcategory_id) {
            if (req.file?.publicId) await safeDestroy(req.file.publicId);
            return res.status(400).json({
                status: 'error',
                message: 'subcategory_id es requerido',
            });
        }

        const created = await service.create(data, req.file);

        res.status(201).json({
            status: 'success',
            code: 201,
            message: 'Producto creado correctamente',
            data: created,
        });
    } catch (error) {
        console.error('❌ Error creando producto:', error);
        if (req.file?.publicId) await safeDestroy(req.file.publicId);
        next(error);
    }
});

router.put('/:id', uploadImage, async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
        const {id} = req.params;
        const productData = parseProductBody(req);

        const existing = await service.findById(id);
        const record = existing?.data ?? existing;
        if (!record || existing?.code === 404) {
            if (req.file?.publicId) await safeDestroy(req.file.publicId);
            return res.status(404).json({message: 'Producto no encontrado'});
        }

        const data = mapProductPayload(productData);
        delete data.is_active;

        if (!data.subcategory_id) {
            if (req.file?.publicId) await safeDestroy(req.file.publicId);
            return res.status(400).json({
                status: 'error',
                message: 'subcategory_id es requerido',
            });
        }

        const updated = await service.update(id, data, req.file);

        res.json({
            status: 'success',
            code: 200,
            message: 'Producto actualizado correctamente',
            data: updated,
        });
    } catch (error) {
        console.error('Error actualizando producto:', error);
        if (req.file?.publicId) await safeDestroy(req.file.publicId);
        next(error);
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
        const {id} = req.params;
        const result = await service.delete(id);
        res.json({
            status: 'success',
            code: 200,
            message: 'Producto eliminado correctamente',
            data: result,
        });
    } catch (error) {
        console.error('Error eliminando producto:', error);
        next(error);
    }
});


router.get('/stats', async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
        const stats = await service.getStats();
        res.json(stats);
    } catch (error) {
        next(error);
    }
});

module.exports = router;