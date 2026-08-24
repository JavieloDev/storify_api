const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');

// Crear directorio de uploads si no existe
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {recursive: true});
    console.log('✅ Directorio uploads creado en:', uploadDir);
}

// ✅ Generador de nombres cortos y únicos
const generateFileName = (originalName) => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(originalName).toLowerCase();
    return `p-${timestamp}-${random}${ext}`;
};

// ✅ Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, generateFileName(file.originalname))
});

// ✅ Filtro de archivos
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

// ✅ Elimina un archivo sin romper el flujo si ya no existe o falla el borrado
const safeUnlink = async (filePath) => {
    if (!filePath) return;
    try {
        await fsp.unlink(filePath);
    } catch {
        // el archivo ya no existe o no se pudo borrar, no bloquea el flujo
    }
};

// ✅ Escribe el resultado de sharp a un archivo temporal y lo reemplaza sobre
// el original. sharp no puede leer y escribir sobre el mismo path a la vez,
// así que este es el patrón seguro para "optimizar in-place".
const writeInPlace = async (originalPath, sharpPipeline) => {
    const tempPath = `${originalPath}.tmp-${Date.now()}`;
    await sharpPipeline.toFile(tempPath);
    await fsp.rename(tempPath, originalPath);
};

// ✅ Optimización general (calidad alta) - para banners, logos, imágenes
// donde se prioriza mantener el detalle sobre el peso final.
// Redimensiona solo si excede el máximo, mantiene el formato original.
const optimizeImage = async (filePath, options = {}) => {
    const {maxWidth = 1920, maxHeight = 1920, quality = 85} = options;

    try {
        const ext = path.extname(filePath).toLowerCase();
        let pipeline = sharp(filePath).resize(maxWidth, maxHeight, {
            fit: 'inside',
            withoutEnlargement: true
        });

        if (ext === '.png') {
            pipeline = pipeline.png({quality, compressionLevel: 8});
        } else if (ext === '.webp') {
            pipeline = pipeline.webp({quality});
        } else {
            // jpg/jpeg y cualquier otro caso caen a jpeg
            pipeline = pipeline.jpeg({quality, mozjpeg: true});
        }

        await writeInPlace(filePath, pipeline);
    } catch (error) {
        // si falla la optimización, dejamos el archivo original tal cual
        // subió el usuario en vez de romper todo el flujo de creación/edición
        console.error('❌ Error optimizando imagen (optimizeImage):', error);
    }
};

// ✅ Optimización balanceada (peso/velocidad) - la que usa el flujo de
// productos. Tamaño máximo más chico y calidad algo menor que optimizeImage,
// pensado para catálogos con muchas imágenes donde el peso importa más.
const optimizeImageBalanced = async (filePath, options = {}) => {
    const {maxWidth = 1000, maxHeight = 1000, quality = 72} = options;

    try {
        const ext = path.extname(filePath).toLowerCase();
        let pipeline = sharp(filePath).resize(maxWidth, maxHeight, {
            fit: 'inside',
            withoutEnlargement: true
        });

        if (ext === '.png') {
            pipeline = pipeline.png({quality, compressionLevel: 8});
        } else if (ext === '.webp') {
            pipeline = pipeline.webp({quality});
        } else {
            pipeline = pipeline.jpeg({quality, mozjpeg: true});
        }

        await writeInPlace(filePath, pipeline);
    } catch (error) {
        console.error('❌ Error optimizando imagen (optimizeImageBalanced):', error);
    }
};

// Genera el thumbnail WebP 400x400 a partir del archivo YA optimizado en
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
        // si falla el thumbnail, no se rompe el upload completo — el
        // producto se guarda solo con `image`, y thumbnail_url queda null
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

            // se genera DESPUÉS de optimizar — parte de la versión liviana,
            // no del archivo original pesado que subió el cliente.
            req.file.thumbnailFilename = await generateThumbnail(req.file.path);

            next();
        } catch (error) {
            await safeUnlink(req.file.path);
            if (req.file.thumbnailFilename) {
                await safeUnlink(path.join(uploadDir, req.file.thumbnailFilename));
            }
            next(error);
        }
    });
};

module.exports = {
    uploadImage: uploadAndOptimizeImage,
    optimizeImage,
    optimizeImageBalanced,
    safeUnlink,
    uploadDir
};