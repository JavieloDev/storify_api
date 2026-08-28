// src/services/pinHash.service.js
const crypto = require('crypto');

/**
 * Hash determinístico del PIN. NO usa salt aleatorio a propósito: el
 * dispositivo POS necesita poder recalcular este mismo valor offline
 * para comparar contra pin_hash sincronizado, sin tener que llamar
 * al backend en cada login.
 */
function hashPin(pin, businessId) {
    return crypto.createHash('sha256').update(`${pin}:${businessId}`).digest('hex');
}

module.exports = {hashPin};