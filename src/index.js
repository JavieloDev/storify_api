const express = require('express');
const cors = require('cors');
require('dotenv').config();
const routerApi = require('./routes/index.js');
const {join} = require("node:path");

const app = express();
const port = process.env.PORT || 3008;
app.use(cors());

// Configuración de middlewares
app.use(express.json({limit: '500mb'}));
app.use(express.urlencoded({extended: true}));
app.use('/uploads', express.static(join(__dirname, '../uploads')));

console.log(port)
// Rutas
routerApi(app);


app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});
