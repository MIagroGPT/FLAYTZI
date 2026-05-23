const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cargar bases de datos estáticas
let airports = [];
let flightTemplates = [];

try {
  airports = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'airports.json'), 'utf8'));
  flightTemplates = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'mock_flights.json'), 'utf8'));
} catch (error) {
  console.error("Error al cargar las bases de datos estáticas:", error);
}

// Helper para encontrar la región de un aeropuerto por IATA
function getAirportRegion(code) {
  const airport = airports.find(a => a.code === code.toUpperCase());
  return airport ? airport.region : 'OTHER';
}

// Helper para formatear fechas de manera elegante
function getFormattedDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const options = { weekday: 'short', day: '2-digit', month: 'short' };
  return date.toLocaleDateString('es-ES', options);
}

// 1. Endpoint: Autocompletado de Aeropuertos
app.get('/api/airports', (req, res) => {
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

  // Retornar máximo 8 resultados ordenados por relevancia (si el IATA empieza con la query va primero)
  const sortedMatches = matches.sort((a, b) => {
    const aStartsWith = a.code.toLowerCase().startsWith(query);
    const bStartsWith = b.code.toLowerCase().startsWith(query);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return 0;
  });

  res.json(sortedMatches.slice(0, 8));
});

// 2. Endpoint: Motor de Búsqueda Híbrido & Calculador Dinámico
app.get('/api/flights', (req, res) => {
  const { origin, destination, departureDate, returnDate, passengers, cabinClass } = req.query;

  if (!origin || !destination || !departureDate) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios: origin, destination, departureDate' });
  }

  const passengerCount = parseInt(passengers) || 1;
  const cabin = (cabinClass || 'economy').toLowerCase();

  // Validar existencia de aeropuertos en BD
  const originAirport = airports.find(a => a.code === origin.toUpperCase());
  const destAirport = airports.find(a => a.code === destination.toUpperCase());

  if (!originAirport || !destAirport) {
    return res.status(400).json({ error: 'Origen o destino no válidos en nuestro sistema' });
  }

  // Determinar lógica de descuento según el destino
  const destRegion = destAirport.region;
  let discountRate = 0.35; // Descuento por defecto

  if (destRegion === 'EU') {
    discountRate = 0.40; // 40% para Europa
  } else if (destRegion === 'US') {
    discountRate = 0.30; // 30% para Estados Unidos
  }

  // Generar itinerarios de vuelos de forma híbrida y realista
  const results = [];

  // Mapeamos plantillas y generamos vuelos realistas
  flightTemplates.forEach(airlineObj => {
    // Tomamos vuelos de esta aerolínea
    // Si es una ruta larga transatlántica (ej. LATAM -> Europa), priorizamos aerolíneas de largo alcance
    // De lo contrario generamos opciones mezcladas para dar variedad premium
    airlineObj.flights.forEach(fTemplate => {
      // Ajustar duración y escalas en base a si es una ruta continental o intercontinental
      const isIntercontinental = 
        (originAirport.region === 'LATAM' && destAirport.region === 'EU') ||
        (originAirport.region === 'EU' && destAirport.region === 'LATAM') ||
        (originAirport.region === 'US' && destAirport.region === 'EU');

      // Filtro realista: no mostrar vuelos muy cortos (ej. de 3h) si es intercontinental, etc.
      const durationHours = parseInt(fTemplate.duration);
      if (isIntercontinental && durationHours < 6) return;
      if (!isIntercontinental && durationHours > 8) return;

      // Calcular precio base ajustado por clase
      let classMultiplier = 1.0;
      if (cabin === 'business') {
        classMultiplier = 3.8; // Tarifa Business es típicamente 3.8 veces la económica
      }

      // Añadir una pequeña aleatoriedad diaria realista basada en la fecha para simular "mercado dinámico"
      const dateHash = departureDate.split('-').reduce((acc, val) => acc + parseInt(val), 0);
      const randomFactor = 0.9 + ((dateHash % 10) / 50); // Factor entre 0.9 y 1.1

      let basePriceUSD = fTemplate.basePriceUSD * classMultiplier * randomFactor * passengerCount;
      basePriceUSD = Math.round(basePriceUSD);

      // --- CALCULADOR DINÁMICO FLYTZI ---
      const priceOfficial = basePriceUSD;
      const priceFlytzi = Math.round(priceOfficial * (1 - discountRate));
      const savingUSD = priceOfficial - priceFlytzi;
      const discountPercent = Math.round(discountRate * 100);

      // Generar ID único del itinerario
      const flightId = `FL-${fTemplate.flightNumber}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      // Crear itinerario de Ida
      const outbound = {
        flightId,
        airline: airlineObj.airline,
        logo: airlineObj.logo,
        flightNumber: fTemplate.flightNumber,
        origin: originAirport.code,
        originCity: originAirport.city,
        originAirport: originAirport.name,
        destination: destAirport.code,
        destinationCity: destAirport.city,
        destinationAirport: destAirport.name,
        depTime: fTemplate.depTime,
        arrTime: fTemplate.arrTime,
        depDate: getFormattedDate(departureDate),
        depDateRaw: departureDate,
        duration: fTemplate.duration,
        stops: fTemplate.stops,
        stopDetails: fTemplate.stopDetails,
        cabinClass: cabin === 'business' ? 'Business' : 'Económica',
        passengers: passengerCount,
        pricing: {
          officialPrice: priceOfficial,
          flytziPrice: priceFlytzi,
          saving: savingUSD,
          discountPercent,
          currency: 'USD'
        }
      };

      // Si es viaje redondo, crear itinerario de regreso realista
      if (returnDate) {
        // Encontrar plantilla de regreso (puede ser el mismo número de vuelo u otro)
        const returnFlightNumber = fTemplate.flightNumber.replace(/\d+/, (n) => parseInt(n) + 1);
        
        // Simular regreso con leve variación en horarios y precios oficiales
        const returnPriceOfficial = Math.round(priceOfficial * 0.95);
        const returnPriceFlytzi = Math.round(returnPriceOfficial * (1 - discountRate));
        const returnSavingUSD = returnPriceOfficial - returnPriceFlytzi;

        outbound.returnFlight = {
          flightNumber: returnFlightNumber,
          origin: destAirport.code,
          originCity: destAirport.city,
          originAirport: destAirport.name,
          destination: originAirport.code,
          destinationCity: originAirport.city,
          destinationAirport: originAirport.name,
          depTime: fTemplate.arrTime === '06:10' || fTemplate.arrTime === '06:20' ? '18:15' : '10:45',
          arrTime: fTemplate.depTime === '12:15' || fTemplate.depTime === '13:00' ? '23:30' : '07:15',
          depDate: getFormattedDate(returnDate),
          depDateRaw: returnDate,
          duration: fTemplate.duration,
          stops: fTemplate.stops,
          stopDetails: fTemplate.stopDetails === 'Directo' ? 'Directo' : `1 escala en ${originAirport.code === 'MEX' ? 'MIA' : 'JFK'}`,
        };

        // Actualizar precios del paquete redondo
        outbound.pricing.officialPrice += returnPriceOfficial;
        outbound.pricing.flytziPrice += returnPriceFlytzi;
        outbound.pricing.saving += returnSavingUSD;
      }

      results.push(outbound);
    });
  });

  // Ordenar resultados: primero los más económicos o de mayor descuento
  const sortedResults = results.sort((a, b) => a.pricing.flytziPrice - b.pricing.flytziPrice);

  res.json(sortedResults);
});

// Manejo de SPA: redirigir a index.html para cualquier ruta no encontrada
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Servidor Flytzi en ejecución en http://localhost:${PORT}`);
  console.log(` Moneda base: USD | Lógica: 40% EU, 30% US, 35% Resto`);
  console.log(`=======================================================`);
});
