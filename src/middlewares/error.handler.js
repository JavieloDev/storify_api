const boom = require('@hapi/boom');

function uniqueErrorHandler(err, req, res, next) {
    console.log(err.message)
    if (err.message === "Validation error") {
        res.status(422).json(
            {
                Error: "Este nombre ya se usó en otro filtro, por favor use otro"
            }
        );
    }
    next(err);
}

function errorHandler(err, req, res, next) {
    res.status(500).json({
        message: err.message,
        stack: err.stack,
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
