const multer = require('multer');
const {CloudinaryStorage} = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary.config');

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

const fileFilter = (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato de imagen no soportado. Usa JPEG, PNG, WEBP o GIF.'), false);
    }
};

/**
 * Crea un middleware de subida a Cloudinary para una carpeta específica.
 * No toca el disco local en ningún momento — funciona sin problema en
 * Vercel/serverless, donde el filesystem es de solo lectura.
 *
 * `transformation` acá es una transformación de ENTRADA: Cloudinary la
 * aplica ANTES de guardar el asset, así que lo que queda almacenado y lo
 * que sirve `secure_url` ya viene redimensionado y comprimido. Reemplaza
 * lo que antes hacía sharp localmente (optimizeImage/optimizeImageBalanced).
 */
const createUploadMiddleware = (folder, {maxSize = 1600, quality = 'auto'} = {}) => {
    const storage = new CloudinaryStorage({
        cloudinary,
        params: {
            folder,
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
            transformation: [
                {width: maxSize, height: maxSize, crop: 'limit', quality, fetch_format: 'auto'}
            ],
        },
    });

    const upload = multer({
        storage,
        limits: {fileSize: 10 * 1024 * 1024, files: 1},
        fileFilter,
    });

    return (req, res, next) => {
        upload.single('image')(req, res, (err) => {
            if (err) return next(err);
            if (!req.file) return next();

            // req.file.filename = public_id en Cloudinary (lo setea multer-storage-cloudinary)
            // req.file.path     = secure_url ya optimizada
            req.file.publicId = req.file.filename;

            req.file.thumbnailUrl = cloudinary.url(req.file.publicId, {
                width: 400,
                height: 400,
                crop: 'fill',
                gravity: 'auto',
                quality: 'auto',
                fetch_format: 'auto',
                secure: true,
            });

            next();
        });
    };
};

/** Borra un asset de Cloudinary por su public_id. Nunca rompe el flujo si falla. */
const safeDestroy = async (publicId) => {
    if (!publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error('❌ Error borrando asset de Cloudinary:', publicId, error.message);
    }
};

module.exports = {
    uploadImage: createUploadMiddleware('storify/products'),
    uploadBusinessImage: createUploadMiddleware('storify/businesses', {maxSize: 800}),
    safeDestroy,
};