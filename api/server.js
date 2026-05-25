const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// En desarrollo, servir estáticos del frontend para facilitar pruebas locales E2E
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '..', 'frontend')));
  console.log('[Dev Server] Sirviendo archivos estáticos del frontend en http://localhost:4000');
}

// Importar rutas de la API
const airportsRoute = require('./routes/airports');
const inventoryRoute = require('./routes/inventory');
const bookingsRoute = require('./routes/bookings');
const adminRoute = require('./routes/admin');
const webhooksRoute = require('./routes/webhooks');

// Mapeo de Endpoints
app.use('/api/airports', airportsRoute);
app.use('/api/inventory', inventoryRoute);
app.use('/api/bookings', bookingsRoute);
app.use('/api/admin', adminRoute);
app.use('/api/webhooks', webhooksRoute);

// Ruta base informativa
app.get('/api', (req, res) => {
  res.json({
    name: 'Flytzi 2.0 API',
    description: 'Motor de Búsqueda y Reservas basado en Inventario Real de Millas',
    version: '2.0.0',
    status: 'healthy'
  });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado en Flytzi API.' });
});

// Iniciar servidor Backend
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Flytzi API v2.0 en ejecución en el puerto: ${PORT}`);
  console.log(` Conectado a PostgreSQL (Inventario Validado de Millas)`);
  console.log(`=======================================================`);
});
