const {v7: uuidv7} = require('uuid');

class IdGeneratorService {
    /**
     * Genera un UUID v7 único
     * @returns {string} UUID v7 (ej: "018c1234-5678-7abc-9def-0123456789ab")
     */
    generateId() {
        return uuidv7();
    }

    /**
     * Genera múltiples IDs en lote
     * @param {number} count - Cantidad de IDs a generar
     * @returns {string[]} Array de UUIDs v7
     */
    generateIds(count = 1) {
        return Array.from({length: count}, () => this.generateId());
    }

    /**
     * Genera un ID con formato sin guiones (para URLs o sistemas que no los soportan)
     * @returns {string} UUID v7 sin guiones
     */
    generateIdCompact() {
        return this.generateId().replace(/-/g, '');
    }

    /**
     * Extrae el timestamp de un UUID v7
     * @param {string} uuid - UUID v7
     * @returns {Date} Fecha de creación del ID
     */
    extractTimestamp(uuid) {
        // Los primeros 12 caracteres contienen el timestamp en hex
        const hexTimestamp = uuid.substring(0, 12);
        const timestampMs = parseInt(hexTimestamp, 16);
        return new Date(timestampMs);
    }
}

module.exports = new IdGeneratorService();