// const {Op} = require('sequelize');
//
// class DeviceRoute {
//     constructor(sequelizeInstance) {
//         this.sequelize = sequelizeInstance;
//         this.model = sequelizeInstance.models.Device;
//
//         if (!this.model) {
//             const availableModels = Object.keys(sequelizeInstance.models).join(', ');
//             throw new Error(`Modelo Device no encontrado. Modelos disponibles: ${availableModels}`);
//         }
//     }
//
//     async create(data) {
//         if (!data.business_id) {
//             throw new Error('business_id es requerido');
//         }
//
//         const business = await this.sequelize.models.Business.findByPk(data.business_id, {
//             attributes: ['id', 'status']
//         });
//         if (!business) {
//             throw new Error('El negocio especificado no existe');
//         }
//         if (business.status !== 'active') {
//             throw new Error('El negocio especificado no está activo');
//         }
//
//         if (!data.device_uuid) {
//             throw new Error('device_uuid es requerido');
//         }
//
//         // Si el dispositivo ya está registrado para este negocio, no crear
//         // un duplicado: devolver el existente (idempotente, útil para que
//         // el cliente pueda llamar a create() en cada login sin problema).
//         const existing = await this.model.findOne({
//             where: {business_id: data.business_id, device_uuid: data.device_uuid}
//         });
//         if (existing) {
//             return existing;
//         }
//
//         return this.model.create(data);
//     }
//
//     async update(id, data) {
//         const record = await this.findById(id);
//         if (record.status === 'error') {
//             throw new Error('Dispositivo no encontrado');
//         }
//
//         // 🔧 record.data es la instancia real de Sequelize — findById()
//         // siempre devuelve el envelope {status, code, data}, nunca la
//         // instancia ni null directamente.
//         return await record.data.update(data);
//     }
//
//     /**
//      * Aprobar / bloquear / volver a pending un dispositivo.
//      */
//     async updateStatus(id, status) {
//         const validStatuses = ['active', 'inactive'];
//         if (!validStatuses.includes(status)) {
//             return {
//                 status: 'error',
//                 code: 400,
//                 message: `El estado debe ser uno de: ${validStatuses.join(', ')}`,
//                 data: null
//             };
//         }
//
//         const record = await this.findById(id);
//         if (record.status === 'error') {
//             return record;
//         }
//
//         await record.data.update({status});
//
//         return {
//             status: 'success',
//             code: 200,
//             message: 'Estado del dispositivo actualizado correctamente',
//             data: record.data
//         };
//     }
//
//     /**
//      * Actualiza last_seen_at — pensado para llamarse en cada login exitoso
//      * desde el POS (se termina de conectar cuando integremos esto al login).
//      */
//     async touchLastSeen(id) {
//         const record = await this.findById(id);
//         if (record.status === 'error') {
//             return record;
//         }
//
//         await record.data.update({last_seen_at: new Date()});
//
//         return {
//             status: 'success',
//             code: 200,
//             message: 'Dispositivo actualizado',
//             data: record.data
//         };
//     }
//
//     async delete(id) {
//         const result = await this.findById(id);
//
//         if (result.status === 'error') {
//             return {
//                 status: 'error',
//                 code: 404,
//                 message: 'Dispositivo no encontrado'
//             };
//         }
//
//         await result.data.destroy();
//         return {
//             status: 'success',
//             code: 200,
//             message: 'Dispositivo eliminado correctamente',
//             data: []
//         };
//     }
//
//     async findById(id) {
//         const record = await this.model.findByPk(id);
//
//         if (!record) {
//             return {
//                 status: 'error',
//                 code: 404,
//                 message: 'Dispositivo no encontrado',
//                 data: null
//             };
//         }
//
//         return {
//             status: 'success',
//             code: 200,
//             message: 'Dispositivo obtenido correctamente',
//             data: record
//         };
//     }
//
//     async findAll({
//                       page = 1,
//                       limit = 10,
//                       filters = {},
//                       orderBy = 'created_at',
//                       orderDirection = 'DESC'
//                   } = {}) {
//
//         const safeLimit = Math.min(Number(limit) || 10, 100);
//         const currentPage = Number(page) || 1;
//         const offset = (currentPage - 1) * safeLimit;
//
//         const where = this._buildFilters(filters);
//
//         const [total, rows] = await Promise.all([
//             this.model.count({where}),
//             this.model.findAll({
//                 where,
//                 limit: safeLimit,
//                 offset,
//                 order: [[orderBy, orderDirection]],
//                 raw: true
//             })
//         ]);
//
//         const totalPages = Math.ceil(total / safeLimit);
//
//         return {
//             status: 'success',
//             code: 200,
//             message: 'Dispositivos obtenidos correctamente',
//             data: rows,
//             pagination: {
//                 page: currentPage,
//                 limit: safeLimit,
//                 total,
//                 total_pages: totalPages
//             }
//         };
//     }
//
//     async findByBusiness(businessId, page, limit, filter = {}, since) {
//         const where = { business_id: businessId, ...filter };
//         if (since) where.updated_at = { [Op.gt]: new Date(since) };
//
//         const { rows, count } = await Device.findAndCountAll({
//             where,
//             limit: Number(limit),
//             offset: (Number(page) - 1) * Number(limit),
//             order: [['updated_at', 'ASC']],
//         });
//
//         return { status: 'success', code: 200, message: 'Dispositivos obtenidos', data: rows, total: count };
//     }
//
//     _buildFilters(filters) {
//         const where = {};
//
//         if (filters.label) {
//             where.label = {[Op.like]: `%${filters.label}%`};
//         }
//
//         if (filters.business_id) {
//             where.business_id = filters.business_id;
//         }
//
//         if (filters.device_uuid) {
//             where.device_uuid = filters.device_uuid;
//         }
//
//         if (filters.status) {
//             where.status = filters.status;
//         }
//
//         if (filters.platform) {
//             where.platform = filters.platform;
//         }
//
//         if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
//             where.id = {[Op.in]: filters.ids};
//         }
//
//         return where;
//     }
// }
//
// module.exports = DeviceRoute;

// src/services/device.service.js
const { Op } = require('sequelize');

class DeviceService {
    constructor(sequelizeInstance) {
        this.sequelize = sequelizeInstance;
        this.model = sequelizeInstance.models.Device;

        if (!this.model) {
            const availableModels = Object.keys(sequelizeInstance.models).join(', ');
            throw new Error(`Modelo Device no encontrado. Modelos disponibles: ${availableModels}`);
        }
    }

    async create(data) {
        if (!data.business_id) {
            throw new Error('business_id es requerido');
        }

        const business = await this.sequelize.models.Business.findByPk(data.business_id, {
            attributes: ['id', 'status']
        });
        if (!business) {
            throw new Error('El negocio especificado no existe');
        }
        if (business.status !== 'active') {
            throw new Error('El negocio especificado no está activo');
        }

        if (!data.device_uuid) {
            throw new Error('device_uuid es requerido');
        }

        // ✅ Si el dispositivo ya existe, devolverlo (idempotente)
        const existing = await this.model.findOne({
            where: { business_id: data.business_id, device_uuid: data.device_uuid }
        });
        if (existing) {
            return existing;
        }

        return this.model.create(data);
    }

    async update(id, data) {
        const record = await this.model.findByPk(id);
        if (!record) {
            throw new Error('Dispositivo no encontrado');
        }

        // ✅ Solo permitir actualizar campos específicos
        const allowedFields = ['label', 'device_uuid', 'native_device_id', 'status'];
        const updateData = {};
        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        return await record.update(updateData);
    }

    async updateStatus(id, status) {
        const validStatuses = ['active', 'inactive'];
        if (!validStatuses.includes(status)) {
            return {
                status: 'error',
                code: 400,
                message: `El estado debe ser uno de: ${validStatuses.join(', ')}`,
                data: null
            };
        }

        const record = await this.model.findByPk(id);
        if (!record) {
            return {
                status: 'error',
                code: 404,
                message: 'Dispositivo no encontrado',
                data: null
            };
        }

        await record.update({ status });

        return {
            status: 'success',
            code: 200,
            message: 'Estado del dispositivo actualizado correctamente',
            data: record
        };
    }

    async touchLastSeen(id) {
        const record = await this.model.findByPk(id);
        if (!record) {
            return {
                status: 'error',
                code: 404,
                message: 'Dispositivo no encontrado',
                data: null
            };
        }

        await record.update({ last_seen_at: new Date() });

        return {
            status: 'success',
            code: 200,
            message: 'Dispositivo actualizado',
            data: record
        };
    }

    async delete(id) {
        const record = await this.model.findByPk(id);
        if (!record) {
            return {
                status: 'error',
                code: 404,
                message: 'Dispositivo no encontrado'
            };
        }

        await record.destroy();
        return {
            status: 'success',
            code: 200,
            message: 'Dispositivo eliminado correctamente',
            data: []
        };
    }

    async findById(id) {
        const record = await this.model.findByPk(id);

        if (!record) {
            return {
                status: 'error',
                code: 404,
                message: 'Dispositivo no encontrado',
                data: null
            };
        }

        return {
            status: 'success',
            code: 200,
            message: 'Dispositivo obtenido correctamente',
            data: record
        };
    }

    async findAll({
                      page = 1,
                      limit = 10,
                      filters = {},
                      orderBy = 'created_at',
                      orderDirection = 'DESC'
                  } = {}) {
        const safeLimit = Math.min(Number(limit) || 10, 100);
        const currentPage = Number(page) || 1;
        const offset = (currentPage - 1) * safeLimit;

        const where = this._buildFilters(filters);

        const [total, rows] = await Promise.all([
            this.model.count({ where }),
            this.model.findAll({
                where,
                limit: safeLimit,
                offset,
                order: [[orderBy, orderDirection]],
                raw: true
            })
        ]);

        const totalPages = Math.ceil(total / safeLimit);

        return {
            status: 'success',
            code: 200,
            message: 'Dispositivos obtenidos correctamente',
            data: rows,
            pagination: {
                page: currentPage,
                limit: safeLimit,
                total,
                total_pages: totalPages
            }
        };
    }

    // ✅ Método con since para sincronización
    async findByBusiness(businessId, page = 1, limit = 10, filter = {}, since) {
        const where = { business_id: businessId, ...filter };
        if (since) {
            where.updated_at = { [Op.gt]: new Date(since) };
        }

        const safeLimit = Math.min(Number(limit) || 10, 100);
        const currentPage = Number(page) || 1;
        const offset = (currentPage - 1) * safeLimit;

        const { rows, count } = await this.model.findAndCountAll({
            where,
            limit: safeLimit,
            offset,
            order: [['updated_at', 'ASC']],
        });

        return {
            status: 'success',
            code: 200,
            message: 'Dispositivos obtenidos correctamente',
            data: rows,
            pagination: {
                page: currentPage,
                limit: safeLimit,
                total: count
            }
        };
    }

    _buildFilters(filters) {
        const where = {};

        if (filters.label) {
            where.label = { [Op.like]: `%${filters.label}%` };
        }

        if (filters.business_id) {
            where.business_id = filters.business_id;
        }

        if (filters.device_uuid) {
            where.device_uuid = filters.device_uuid;
        }

        if (filters.status) {
            where.status = filters.status;
        }

        if (filters.platform) {
            where.platform = filters.platform;
        }

        if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
            where.id = { [Op.in]: filters.ids };
        }

        return where;
    }
}

module.exports = DeviceService;