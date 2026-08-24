const cloudinary = require('cloudinary').v2;

// El SDK lee CLOUDINARY_URL automáticamente del entorno al importarse.
// Este warning es solo para detectar rápido si falta la env var.
if (!process.env.CLOUDINARY_URL) {
    console.warn('⚠️ CLOUDINARY_URL no está definida en las variables de entorno');
}

module.exports = cloudinary;