const express = require('express');
const { scrapeAwardTravel } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// POST /scan - Ejecutar escaneo de millas para una ruta y fecha dada
app.post('/scan', async (req, res) => {
  const { origin, destination, departure_date, cabin } = req.body;

  if (!origin || !destination || !departure_date) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos: origin, destination, departure_date' });
  }

  try {
    const flights = await scrapeAwardTravel(
      origin.toUpperCase(),
      destination.toUpperCase(),
      departure_date,
      cabin ? cabin.toLowerCase() : 'economy'
    );

    return res.json({
      success: true,
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departure_date,
      results_count: flights.length,
      results: flights
    });

  } catch (error) {
    console.error("[Worker Error]:", error);
    return res.status(500).json({ error: 'Error interno al procesar el raspado de vuelos.' });
  }
});

// GET / - Healthcheck del servicio
app.get('/', (req, res) => {
  res.json({
    service: 'Flytzi Playwright Scraper Worker',
    status: 'healthy',
    version: '2.0.0'
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Playwright Scraper Worker en ejecución en puerto ${PORT}`);
  console.log(`=======================================================`);
});
