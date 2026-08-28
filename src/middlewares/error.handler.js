const boom = require('@hapi/boom');

function uniqueErrorHandler(err, req, res, next) {
    if (err.message === "Validation error") {
        return res.status(422).json({
            Error: "Este nombre ya se usó en otro filtro, por favor use otro"
        });
    }
    next(err);
}

function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    const isProd = process.env.NODE_ENV === 'production';

    res.status(status).json({
        status: 'error',
        code: status,
        message: err.message || 'Error interno del servidor',
        ...(isProd ? {} : { stack: err.stack }),
    });
}

function boomErrorHandler(err, req, res, next) {
    if (err.isBoom) {
        const { output } = err;
        res.status(output.statusCode).json(output.payload);
    }
    next(err);
}



module.exports = {errorHandler, boomErrorHandler, uniqueErrorHandler};
