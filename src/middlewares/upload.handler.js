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

const buildThumbnailUrl = (publicId) =>
    cloudinary.url(publicId, {
        width: 400,
        height: 400,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto',
        fetch_format: 'auto',
        secure: true,
    });

const createUploadMiddleware = (folder, {maxSize = 1600, quality = 'auto', fields} = {}) => {
    const storage = new CloudinaryStorage({
        cloudinary,
        params: (req, file) => {
            const isBanner = file.fieldname === 'banner';
            return {
                folder,
                allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
                transformation: [
                    isBanner
                        ? {width: 1600, height: 500, crop: 'fill', gravity: 'auto', quality, fetch_format: 'auto'}
                        : {width: maxSize, height: maxSize, crop: 'limit', quality, fetch_format: 'auto'},
                ],
            };
        },
    });

    const upload = multer({
        storage,
        limits: {fileSize: 2 * 1024 * 1024, files: fields ? fields.length : 1},
        fileFilter,
    });

    const runUpload = fields
        ? upload.fields(fields.map((name) => ({name, maxCount: 1})))
        : upload.single('image');

    return (req, res, next) => {
        runUpload(req, res, (err) => {
            if (err) return next(err);

            if (fields) {
                req.files = req.files || {};
                for (const name of fields) {
                    const file = req.files[name]?.[0];
                    if (!file) continue;
                    file.publicId = file.filename;
                    file.thumbnailUrl = buildThumbnailUrl(file.publicId);
                }
                return next();
            }

            if (!req.file) return next();
            req.file.publicId = req.file.filename;
            req.file.thumbnailUrl = buildThumbnailUrl(req.file.publicId);
            next();
        });
    };
};

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
    uploadBusinessImage: createUploadMiddleware('storify/businesses', {maxSize: 800, fields: ['logo', 'banner']}),
    safeDestroy,
};