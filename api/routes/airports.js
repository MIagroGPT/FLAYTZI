const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

let airports = [];
try {
  airports = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'airports.json'), 'utf8'));
} catch (error) {
  console.error("Error al cargar la base de datos estática de aeropuertos:", error);
}

// GET /api/airports?q=query
router.get('/', (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  if (query.length < 2) {
    return res.json([]);
  }

  // Filtrar por IATA, Ciudad, Nombre o País
  const matches = airports.filter(airport => {
    return (
      airport.code.toLowerCase().includes(query) ||
      airport.city.toLowerCase().includes(query) ||
      airport.name.toLowerCase().includes(query) ||
      airport.country.toLowerCase().includes(query)
    );
  });

  // Ordenar por relevancia (si el IATA empieza con la búsqueda va primero)
  const sortedMatches = matches.sort((a, b) => {
    const aStartsWith = a.code.toLowerCase().startsWith(query);
    const bStartsWith = b.code.toLowerCase().startsWith(query);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return 0;
  });

  res.json(sortedMatches.slice(0, 8));
});

module.exports = router;
