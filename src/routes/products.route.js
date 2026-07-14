const express = require('express');
const router = express.Router();
const {getService} = require('../middlewares/headers');
const {uploadImage} = require('../middlewares/upload.handler');
const path = require('path');
const fs = require('fs');

router.get('/:businessId/products', async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
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
// GET /product/:id
// ============================
router.get('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
        const {id} = req.params;

        const record = await service.findById(id);

        if (!record) {
            return res.status(404).json({message: 'Producto no encontrado'});
        }

        res.json(record);
    } catch (error) {
        next(error);
    }
});

// ============================
// CREAR (con imagen optimizada automáticamente)
// POST /product/create
// ============================
router.post('/create', uploadImage, async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');

        let productData;
        if (req.body.product) {
            productData = JSON.parse(req.body.product);
        } else {
            productData = req.body;
        }

        const data = {
            name: productData.name,
            description: productData.description || '',
            brand: productData.brand || '',
            price: parseFloat(productData.price) || 0,
            original_price: parseFloat(productData.originalPrice) || parseFloat(productData.price) || 0,
            discount: parseFloat(productData.discount) || 0,
            subcategory_id: productData.subcategory_id || productData.sub_category || null,
            quantity: parseInt(productData.stock) || parseInt(productData.quantity) || 0,
            colors: productData.colors || [],
            featured: productData.featured === true || productData.featured === 'true' || false,
            on_sale: productData.onSale === true || productData.onSale === 'true' || false,
            is_new: productData.isNew === true || productData.isNew === 'true' || false,
            stock_status: productData.stockStatus || 'in_stock',
            is_active: true,
            business_id: productData.business_id,
        };

        // Validar que subcategory_id no sea null
        if (!data.subcategory_id) {
            return res.status(400).json({
                status: 'error',
                message: 'subcategory_id es requerido'
            });
        }

        const created = await service.create(data, req.file);

        res.status(201).json({
            status: 'success',
            code: 201,
            message: 'Producto creado correctamente',
            data: created
        });
    } catch (error) {
        console.error('❌ Error creando producto:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        next(error);
    }
});

// ============================
// ACTUALIZAR (con imagen optimizada automáticamente)
// PUT /product/:id
// ============================
router.put('/:id', uploadImage, async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
        const {id} = req.params;

        let productData;
        if (req.body.product) {
            productData = JSON.parse(req.body.product);
        } else {
            productData = req.body;
        }

        const existing = await service.findById(id);
        if (!existing) {
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(404).json({message: 'Producto no encontrado'});
        }

        const data = {
            name: productData.name,
            description: productData.description || '',
            brand: productData.brand || '',
            price: parseFloat(productData.price) || 0,
            original_price: parseFloat(productData.originalPrice) || parseFloat(productData.price) || 0,
            discount: parseFloat(productData.discount) || 0,
            subcategory_id: productData.subcategory_id || productData.sub_category || null,
            quantity: parseInt(productData.quantity) || 0,
            colors: productData.colors || [],
            featured: productData.featured === true || productData.featured === 'true' || false,
            on_sale: productData.onSale === true || productData.onSale === 'true' || false,
            is_new: productData.isNew === true || productData.isNew === 'true' || false,
            stock_status: productData.stockStatus || 'in_stock',
            business_id: productData.business_id,
        };

        // Validar que subcategory_id no sea null
        if (!data.subcategory_id) {
            return res.status(400).json({
                status: 'error',
                message: 'subcategory_id es requerido'
            });
        }

        const updated = await service.update(id, data, req.file);

        res.json({
            status: 'success',
            code: 200,
            message: 'Producto actualizado correctamente',
            data: updated
        });
    } catch (error) {
        console.error('Error actualizando producto:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        next(error);
    }
});

// ============================
// ELIMINAR
// DELETE /product/:id
// ============================
router.delete('/:id', async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
        const {id} = req.params;

        const result = await service.delete(id);
        res.json({
            status: 'success',
            code: 200,
            message: 'Producto eliminado correctamente',
            data: result
        });
    } catch (error) {
        console.error('Error eliminando producto:', error);
        next(error);
    }
});

// ============================
// OBTENER EN OFERTA
// GET /product/on-sale
// ============================
router.get('/on-sale', async (req, res, next) => {
    try {
        const service = getService(req, 'PRODUCT');
        const {page = 1, limit = 10} = req.query;

        const result = await service.findOnSale(page, limit);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================
// ESTADÍSTICAS
// GET /product/stats
// ============================
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