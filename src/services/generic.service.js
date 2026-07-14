const boom = require('@hapi/boom');
const {Op} = require('sequelize');
const crypto = require('crypto');

class GenericService {
    totalCountCache = {};

    constructor(model) {
        this.model = model;
        this.cache = new Map();
        this.CACHE_TTL = 300000;
        this.MAX_LIMIT = 1000;
    }

    // Generar clave única para cache
    generateCacheKey(params) {
        return JSON.stringify({model: this.model.name, ...params});
    }

    // Expiración perezosa: solo limpia si el item está vencido
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        if (Date.now() - cached.timestamp > this.CACHE_TTL) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    }

    setCache(key, data) {
        this.cache.set(key, {data, timestamp: Date.now()});
    }

    // ------------------------------
    // Métodos principales
    // ------------------------------

    CACHE_TTL = 5 * 60 * 1000; // 5 minutos por defecto

    async findAll({
                      page = 1,
                      limit = 10,
                      where = {},
                      orderBy = 'id',
                      orderDirection = 'DESC',
                      summaryFields = []
                  } = {}) {
        const safeLimit = Math.min(parseInt(limit), this.MAX_LIMIT);
        const cacheKey = JSON.stringify({page, limit, where, orderBy, orderDirection});
        const totalCountKey = JSON.stringify(where);

        if (!this.pageCache) this.pageCache = new Map();
        if (!this.totalCountCache) this.totalCountCache = {};
        if (!this.cacheTimestamps) this.cacheTimestamps = {};

        // 🔹 Limpiar cachés expirados
        const now = Date.now();
        for (const [key, ts] of Object.entries(this.cacheTimestamps)) {
            if (now - ts > this.CACHE_TTL) {
                this.pageCache.delete(key);
                delete this.cacheTimestamps[key];
                delete this.totalCountCache[key];
            }
        }

        // 🔹 Cache de página
        if (this.pageCache.has(cacheKey)) {
            return this.pageCache.get(cacheKey);
        }

        try {
            // 🔹 Construcción avanzada de where
            const parsedWhere = {};

            for (const [key, value] of Object.entries(where)) {
                if (value === undefined || value === null || value === '') continue;

                // Normalizamos la key para usar exactamente el nombre de columna
                const colKey = key; // o key.toUpperCase() si tu DB es sensible a mayúsculas

                // 1️⃣ Booleanos → Op.eq
                if (typeof value === 'boolean') {
                    parsedWhere[colKey] = {[Op.eq]: value};
                    continue;
                }

                // 2️⃣ Fechas → Op.between
                if (colKey.toLowerCase().includes('fec')) {
                    let start, end;
                    if (Array.isArray(value)) [start, end] = value;
                    else [start, end] = value.split(',').map(v => v.trim());

                    if (start && end) {
                        const {fn, col} = require('sequelize');
                        const parseDate = (d, isEnd = false) => {
                            const [dd, mm, yyyy] = d.split('/');
                            const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
                            if (isEnd) date.setHours(23, 59, 59, 999);
                            else date.setHours(0, 0, 0, 0);
                            return date;
                        };
                        parsedWhere[colKey] = {
                            [Op.between]: [
                                fn('CONVERT', col('DATETIME'), parseDate(start).toISOString().slice(0, 19).replace('T', ' ')),
                                fn('CONVERT', col('DATETIME'), parseDate(end, true).toISOString().slice(0, 19).replace('T', ' '))
                            ]
                        };
                    }
                    continue;
                }

                if (Array.isArray(value)) {
                    const conditions = [];

                    value.forEach(v => {
                        const str = String(v).trim();

                        // 🔹 Comparaciones numéricas
                        const match = str.match(/^(>=|<=|>|<)(.+)$/);
                        if (match) {
                            const opMap = {'>': Op.gt, '>=': Op.gte, '<': Op.lt, '<=': Op.lte};
                            conditions.push({[opMap[match[1]]]: Number(match[2].trim())});
                            return;
                        }

                        // 🔹 LIKE
                        let pattern = str;
                        if (pattern.startsWith('*') && pattern.endsWith('*')) pattern = `%${pattern.slice(1, -1)}%`;
                        else if (pattern.startsWith('*')) pattern = `%${pattern.slice(1)}`;
                        else if (pattern.endsWith('*')) pattern = `${pattern.slice(0, -1)}%`;
                        else pattern = `%${pattern}%`;
                        conditions.push({[Op.like]: pattern});
                    });

                    // 🔹 Combinar con Op.and
                    parsedWhere[colKey] = {[Op.and]: conditions};
                    continue;
                }


                if (typeof value === 'string' && value.includes(',')) {
                    const valuesArray = value.split(',').map(v => v.trim()).filter(v => v !== '');
                    const conditions = [];

                    valuesArray.forEach(v => {
                        const match = v.match(/^(>=|<=|>|<)(.+)$/);
                        if (match) {
                            const opMap = {'>': Op.gt, '>=': Op.gte, '<': Op.lt, '<=': Op.lte};
                            conditions.push({[opMap[match[1]]]: Number(match[2].trim())});
                        } else {
                            // LIKE
                            let pattern = v;
                            if (pattern.startsWith('*') && pattern.endsWith('*')) pattern = `%${pattern.slice(1, -1)}%`;
                            else if (pattern.startsWith('*')) pattern = `%${pattern.slice(1)}`;
                            else if (pattern.endsWith('*')) pattern = `${pattern.slice(0, -1)}%`;
                            else pattern = `%${pattern}%`;
                            conditions.push({[Op.like]: pattern});
                        }
                    });

                    parsedWhere[colKey] = {[Op.and]: conditions};
                    continue;
                }

                // 5️⃣ Strings individuales → Op.like
                if (typeof value === 'string') {

                    // 🔹 Comparación
                    const opMap = {
                        '>': Op.gt,
                        '>=': Op.gte,
                        '<': Op.lt,
                        '<=': Op.lte
                    };
                    const match = value.match(/^(>=|<=|>|<)(.+)$/);
                    if (match) {
                        const operator = match[1];
                        const val = match[2].trim();
                        parsedWhere[colKey] = {[opMap[operator]]: isNaN(Number(val)) ? val : Number(val)};
                        continue;
                    }

                    let pattern = value;
                    if (pattern.startsWith('*') && pattern.endsWith('*')) pattern = `%${pattern.slice(1, -1)}%`;
                    else if (pattern.startsWith('*')) pattern = `%${pattern.slice(1)}`;
                    else if (pattern.endsWith('*')) pattern = `${pattern.slice(0, -1)}%`;
                    else pattern = `%${pattern}%`;

                    parsedWhere[colKey] = {[Op.like]: pattern};
                    continue;
                }

                // 6️⃣ Fallback → valor directo
                parsedWhere[colKey] = value;
            }


            // 🔹 Count con cache
            let totalCount = this.totalCountCache[totalCountKey];
            let estimated = false;

            if (page === 1 || totalCount === undefined) {
                totalCount = await this.model.count({where: parsedWhere});
                this.totalCountCache[totalCountKey] = totalCount;
                this.cacheTimestamps[totalCountKey] = Date.now();
            } else {
                estimated = true;
                this.model
                    .count({where: parsedWhere})
                    .then(count => {
                        this.totalCountCache[totalCountKey] = count;
                        this.cacheTimestamps[totalCountKey] = Date.now();
                    })
                    .catch(err => console.error('Error count() background:', err));

                totalCount = this.totalCountCache[totalCountKey];
            }

            // 🔹 NUEVO: Calcular summary si se solicita
            // let summary = null;
            // if (summaryFields.length > 0 && page === 1) {
            //     try {
            //         // ✅ CORRECCIÓN: Construir correctamente los atributos
            //         const summaryAttributes = summaryFields.map(field => [
            //             this.model.sequelize.fn('SUM', this.model.sequelize.col(field)),
            //             `${field}_sum`
            //         ]);
            //
            //         const summaryResult = await this.model.findAll({
            //             where: parsedWhere,
            //             attributes: summaryAttributes,
            //             raw: true,
            //             plain: true
            //         });
            //
            //         summary = {};
            //         summaryFields.forEach(field => {
            //             const sumKey = `${field}_sum`;
            //             summary[field] = summaryResult?.[sumKey] || 0;
            //         });
            //     } catch (error) {
            //         console.error('Error calculando summary:', error);
            //         summary = {};
            //         summaryFields.forEach(field => {
            //             summary[field] = 0;
            //         });
            //     }
            // }

            let summary = null;
            if (summaryFields && summaryFields.length > 0 && page === 1) {
                try {
                    // ✅ FUNCIÓN PARA PROCESAR FILTROS CON OPERADORES DE SEQUELIZE
                    const buildSequelizeWhere = (filters) => {
                        const where = {};

                        for (const [key, value] of Object.entries(filters)) {
                            if (key === 'custom') {
                                // Para condiciones personalizadas complejas
                                Object.assign(where, value);
                            } else if (Array.isArray(value)) {
                                where[key] = {[Op.in]: value};
                            } else if (typeof value === 'object' && value !== null) {
                                // Procesar operadores de Sequelize
                                if (value.between) {
                                    where[key] = {[Op.between]: value.between};
                                } else if (value.like) {
                                    where[key] = {[Op.like]: value.like};
                                } else if (value.gt) {
                                    // Mayor q
                                    where[key] = {[Op.gt]: value.gt};
                                } else if (value.lt) {
                                    // Menor q
                                    where[key] = {[Op.lt]: value.lt};
                                } else if (value.gte) {
                                    // Mayor o igual
                                    where[key] = {[Op.gte]: value.gte};
                                } else if (value.lte) {
                                    // Menor o igual
                                    where[key] = {[Op.lte]: value.lte};
                                } else if (value.not) {
                                    where[key] = {[Op.not]: value.not};
                                } else if (value.notIn) {
                                    where[key] = {[Op.notIn]: value.notIn};
                                } else if (value.notBetween) {
                                    where[key] = {[Op.notBetween]: value.notBetween};
                                } else if (value.is) {
                                    where[key] = {[Op.is]: value.is};
                                } else if (value.isNot) {
                                    where[key] = {[Op.isNot]: value.isNot};
                                } else {
                                    // Si es otro objeto de Sequelize, usar directamente
                                    where[key] = value;
                                }
                            } else {
                                // Valor simple
                                where[key] = value;
                            }
                        }

                        return where;
                    };

                    // ✅ PROCESAR SUMMARY FIELDS CON FILTROS
                    const summaryPromises = summaryFields.map(async (summaryConfig) => {
                        const {field, alias, filters = {}} = summaryConfig;

                        // Procesar filtros para convertir a sintaxis Sequelize
                        const processedFilters = buildSequelizeWhere(filters);

                        // Combinar filtros base con filtros específicos del summary
                        const combinedWhere = {
                            ...parsedWhere,
                            ...processedFilters
                        };

                        // Construir atributos para el SUM
                        const summaryAttributes = [
                            [this.model.sequelize.fn('SUM', this.model.sequelize.col(field)), 'total']
                        ];

                        const summaryResult = await this.model.unscoped().findAll({
                            where: combinedWhere,
                            attributes: summaryAttributes,
                            raw: true
                        });

                        return {
                            key: alias || `${field}_sum`,
                            value: summaryResult[0]?.total || 0,
                            field: field,
                            filters: filters
                        };
                    });

                    // Ejecutar todas las consultas en paralelo
                    const summaryResults = await Promise.all(summaryPromises);

                    // Construir objeto summary final
                    summary = {};
                    summaryResults.forEach(result => {
                        summary[result.key] = result.value;
                    });

                } catch (error) {
                    console.error('Error calculando summary con filtros:', error);
                    summary = {};
                    summaryFields.forEach(config => {
                        const key = config.alias || `${config.field}_sum`;
                        summary[key] = 0;
                    });
                }
            }

            // 🔹 Paginación
            const totalPages = Math.max(Math.ceil(totalCount / safeLimit), 1);
            const currentPage = Math.min(page, totalPages);
            const offset = (currentPage - 1) * safeLimit;

            // 🔹 Query
            const rows = await this.model.findAll({
                where: parsedWhere,
                limit: safeLimit,
                offset,
                order: this.buildOrderClause(orderBy, orderDirection),
                raw: true
            });

            const processedData = this.processEmptyColumns(rows).map(r => ({
                ...r,
                id: crypto.randomUUID()
            }));

            const result = {
                data: processedData,
                pagination: {
                    total: totalCount,
                    page: currentPage,
                    total_pages: totalPages,
                    limit: safeLimit,
                    estimated
                }
            };

            if (summary) {
                result.summary = summary;
            }

            this.pageCache.set(cacheKey, result);
            this.cacheTimestamps[cacheKey] = Date.now();

            return result;
        } catch (error) {
            console.error('Error en findAll avanzado:', error);
            return this.buildEmptyResponse(page, limit);
        }
    }

    async findById(id, options = {}) {
        const cacheKey = this.generateCacheKey({method: 'findById', id, options});
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const result = await this.model.findByPk(id, options);
            this.setCache(cacheKey, result);
            return result;
        } catch (error) {
            console.error('Error en findById:', error);
            return null;
        }
    }

    async findOne(where = {}, options = {}) {
        const cacheKey = this.generateCacheKey({method: 'findOne', where, options});
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const result = await this.model.findOne({where, ...options});
            this.setCache(cacheKey, result);
            return result;
        } catch (error) {
            console.error('Error en findOne:', error);
            return null;
        }
    }

    // ------------------------------
    // Helpers
    // ------------------------------

    buildOrderClause(orderBy, orderDirection) {
        const validOrderDirections = ['ASC', 'DESC'];
        const sanitizedOrderDirection = validOrderDirections.includes(orderDirection?.toUpperCase())
            ? orderDirection.toUpperCase()
            : 'DESC';

        return orderBy ? [[orderBy, sanitizedOrderDirection]] : undefined;
    }

    processEmptyColumns(rows) {
        if (rows.length === 0) return [];

        const emptyKeys = new Set(Object.keys(rows[0]));
        for (const row of rows) {
            for (const key of emptyKeys) {
                const value = row[key];
                if (value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '')) {
                    emptyKeys.delete(key);
                }
            }
            if (emptyKeys.size === 0) break;
        }

        return rows.map(row => {
            const newRow = {...row};
            emptyKeys.forEach(k => delete newRow[k]);
            return newRow;
        });
    }

    buildEmptyResponse(page, limit) {
        return {data: [], pagination: {total: 0, page, total_pages: 0, limit}};
    }

    clearCache() {
        this.pageCache?.clear();
        this.totalCountCache = {};
        this.cacheTimestamps = {};
        console.log('Cache limpiado');
    }


    invalidateCachePattern(pattern) {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) this.cache.delete(key);
        }
    }

    getCacheStats() {
        let active = 0, expired = 0;
        for (const {timestamp} of this.cache.values()) {
            if (Date.now() - timestamp < this.CACHE_TTL) active++;
            else expired++;
        }
        return {total: this.cache.size, active, expired};
    }
}

module.exports = GenericService;
