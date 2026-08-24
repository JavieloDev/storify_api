const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');

// Crear directorio de uploads si no existe (sin cambios)
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {recursive: true});
    console.log('✅ Directorio uploads creado en:', uploadDir);
}

// ✅ Generador de nombres cortos y únicos (sin cambios)
const generateFileName = (originalName) => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(originalName).toLowerCase();
    return `p-${timestamp}-${random}${ext}`;
};

// ✅ Configuración de almacenamiento (sin cambios)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, generateFileName(file.originalname))
});

// ✅ Filtro de archivos (sin cambios)
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato de imagen no soportado. Usa JPEG, PNG, WEBP o GIF.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {fileSize: 10 * 1024 * 1024, files: 1},
    fileFilter: fileFilter
});

// optimizeImage / optimizeImageBalanced / safeUnlink: SIN CAMBIOS, van igual que en tu archivo actual

// 🆕 Genera el thumbnail WebP 400x400 a partir del archivo YA optimizado en
// disco, y lo guarda como archivo hermano: mismo directorio, prefijo `thumb-`,
// siempre extensión .webp (independiente del formato original).
const generateThumbnail = async (optimizedFilePath) => {
    const dir = path.dirname(optimizedFilePath);
    const base = path.basename(optimizedFilePath, path.extname(optimizedFilePath));
    const thumbFileName = `thumb-${base}.webp`;
    const thumbPath = path.join(dir, thumbFileName);

    try {
        await sharp(optimizedFilePath)
            .resize(400, 400, {fit: 'cover', position: 'center'})
            .webp({quality: 70})
            .toFile(thumbPath);

        return thumbFileName;
    } catch (error) {
        // 🔧 mismo criterio que optimizeImage: si falla el thumbnail, no se
        // rompe el upload completo — el producto se guarda solo con `image`,
        // y thumbnail_url queda null (el device sigue mostrando la imagen
        // completa como fallback, no hay pantalla rota).
        console.error('❌ Error generando thumbnail:', error);
        return null;
    }
};

// ✅ MIDDLEWARE ÚNICO - Sube, optimiza y genera thumbnail
const uploadAndOptimizeImage = (req, res, next) => {
    upload.single('image')(req, res, async (err) => {
        if (err) {
            if (req.file) await safeUnlink(req.file.path);
            return next(err);
        }

        if (!req.file) return next();

        try {
            await optimizeImageBalanced(req.file.path);

            const stats = await fsp.stat(req.file.path);
            req.file.size = stats.size;

            // 🆕 se genera DESPUÉS de optimizar — parte de la versión liviana,
            // no del archivo original pesado que subió el cliente.
            req.file.thumbnailFilename = await generateThumbnail(req.file.path);

            next();
        } catch (error) {
            await safeUnlink(req.file.path);
            // 🆕 si el thumbnail llegó a crearse antes del fallo posterior, lo limpiamos también
            if (req.file.thumbnailFilename) {
                await safeUnlink(path.join(uploadDir, req.file.thumbnailFilename));
            }
            next(error);
        }
    });
};

module.exports = {
    uploadImage: uploadAndOptimizeImage,
    uploadDir
};