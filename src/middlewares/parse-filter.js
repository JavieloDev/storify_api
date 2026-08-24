const parseFilterQuery = (req, res, next) => {
    if (req.query.filter && typeof req.query.filter === 'string') {
        try {
            req.query.filter = JSON.parse(req.query.filter);
        } catch {
            return res.status(400).json({
                status: 'error',
                code: 400,
                message: 'El parámetro "filter" debe ser un JSON válido'
            });
        }
    } else if (!req.query.filter) {
        req.query.filter = {};
    }
    next();
};

module.exports = parseFilterQuery;