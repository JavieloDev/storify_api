const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');

// Crear directorio de uploads si no existe (esto corre 1 sola vez al iniciar el server, síncrono está bien aquí)
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
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const fileName = generateFileName(file.originalname);
        cb(null, fileName);
    }
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

// ✅ Configuración de multer
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1
    },
    fileFilter: fileFilter
});

/**
 * Optimiza imagen manteniendo la mejor calidad posible
 *
 * NOTA IMPORTANTE (Windows):
 * No se puede escribir directamente sobre el mismo archivo que sharp
 * acaba de leer (aunque ya se haya generado el buffer completo en memoria).
 * En Windows, sharp/libvips puede mantener un handle abierto sobre el
 * archivo de origen (mmap), y un fsp.writeFile() directo al mismo path
 * revienta con errores tipo "UNKNOWN"/"EBUSY"/"EPERM".
 * La solución segura y multiplataforma es escribir a un archivo temporal
 * y luego hacer un rename atómico sobre el original.
 */
const optimizeImage = async (filePath, options = {}) => {
    let pipeline; // declarado afuera para poder destruirlo en el catch también

    try {
        const {
            maxWidth = 1200,
            maxHeight = 1200,
            quality = 85,
            progressive = true
        } = options;

        const ext = path.extname(filePath).toLowerCase();

        // ✅ GIF se descarta ANTES de pedir metadata (evita I/O + CPU innecesarios de sharp)
        if (ext === '.gif') {
            console.log('⚠️ GIF detectado, se mantiene original');
            return filePath;
        }

        // ✅ metadata (sharp) y size (fs) son independientes -> se piden en paralelo
        const [metadata, originalStat] = await Promise.all([
            sharp(filePath).metadata(),
            fsp.stat(filePath)
        ]);
        const originalSize = originalStat.size;

        console.log(`📊 Imagen original: ${metadata.width}x${metadata.height}, ${(originalSize / 1024).toFixed(1)}KB`);

        pipeline = sharp(filePath);

        if (metadata.width > maxWidth || metadata.height > maxHeight) {
            pipeline = pipeline.resize(maxWidth, maxHeight, {
                fit: 'inside',
                withoutEnlargement: true,
                kernel: sharp.kernel.lanczos3
            });
            console.log(`📐 Redimensionando a máximo ${maxWidth}x${maxHeight}`);
        }

        switch (ext) {
            case '.jpg':
            case '.jpeg':
                pipeline = pipeline.jpeg({
                    quality: quality,
                    progressive: progressive,
                    mozjpeg: true,
                    chromaSubsampling: '4:2:0'
                });
                break;
            case '.png':
                pipeline = pipeline.png({
                    quality: quality,
                    compressionLevel: 8,
                    palette: true,
                    colors: 256
                });
                break;
            case '.webp':
                pipeline = pipeline.webp({
                    quality: quality,
                    lossless: false,
                    alphaQuality: 90,
                    effort: 6
                });
                break;
            default:
                return filePath;
        }

        const optimizedBuffer = await pipeline.toBuffer();

        // ✅ Liberar el handle del archivo de origen lo antes posible
        pipeline.destroy();

        // ✅ Escribir a un temporal y luego reemplazar con rename atómico.
        // Esto evita el error de Windows al escribir sobre un archivo
        // que sharp acaba de leer.
        const tempPath = `${filePath}.tmp`;
        await fsp.writeFile(tempPath, optimizedBuffer);
        await fsp.rename(tempPath, filePath);

        const optimizedSize = optimizedBuffer.length;
        const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
        console.log(`✅ Imagen optimizada: ${(optimizedSize / 1024).toFixed(1)}KB (${reduction}% menos)`);

        return filePath;

    } catch (error) {
        console.error('❌ Error optimizando imagen:', error);

        if (pipeline) {
            try {
                pipeline.destroy();
            } catch (_) {
                // ignorar, ya se está manejando el error principal
            }
        }

        // ✅ Limpiar temporal huérfano si llegó a crearse antes del fallo
        const tempPath = `${filePath}.tmp`;
        try {
            await fsp.unlink(tempPath);
        } catch (_) {
            // no existe o ya fue limpiado, no hay nada que hacer
        }

        return filePath;
    }
};

const optimizeImageBalanced = async (filePath) => {
    return optimizeImage(filePath, {
        maxWidth: 1000,
        maxHeight: 1000,
        quality: 80,
        progressive: true
    });
};

// ✅ Helper async para borrar archivo si existe, sin bloquear el event loop
const safeUnlink = async (filePath) => {
    try {
        await fsp.access(filePath);
        await fsp.unlink(filePath);
    } catch {
        // el archivo no existe o ya fue eliminado, no hay nada que hacer
    }
};

// ✅ MIDDLEWARE ÚNICO - Sube y optimiza la imagen
const uploadAndOptimizeImage = (req, res, next) => {
    upload.single('image')(req, res, async (err) => {
        if (err) {
            // Si hay error de multer, eliminar archivo si existe
            if (req.file) {
                await safeUnlink(req.file.path);
            }
            return next(err);
        }

        // Si no hay archivo, continuar
        if (!req.file) {
            return next();
        }

        try {
            // Optimizar la imagen subida
            await optimizeImageBalanced(req.file.path);

            // Actualizar tamaño
            const stats = await fsp.stat(req.file.path);
            req.file.size = stats.size;

            next();
        } catch (error) {
            // Si falla optimización, eliminar archivo
            await safeUnlink(req.file.path);
            next(error);
        }
    });
};

module.exports = {
    uploadImage: uploadAndOptimizeImage,
    uploadDir
};