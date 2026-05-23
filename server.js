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
  // Generar itinerarios de vuelos de forma híbrida y realista
  const results = [];

  // Mapeamos las plantillas de Alaska Airlines y adaptamos cada una a la ruta consultada
  const alaskaTemplates = flightTemplates.find(a => a.logo === 'AS') || { airline: 'Alaska Airlines', logo: 'AS', flights: [] };

  alaskaTemplates.flights.forEach((fTemplate, index) => {
    // Determinar duración y paradas realistas basadas en la distancia/ruta
    let duration = fTemplate.duration;
    let stops = fTemplate.stops;
    let stopDetails = fTemplate.stopDetails;
    let flightNumber = fTemplate.flightNumber;
    let basePriceUSD = fTemplate.basePriceUSD;
    let airlineName = alaskaTemplates.airline;

    const isIntercontinental = 
      (originAirport.region === 'LATAM' && destAirport.region === 'EU') ||
      (originAirport.region === 'EU' && destAirport.region === 'LATAM') ||
      (originAirport.region === 'US' && destAirport.region === 'EU') ||
      (originAirport.region === 'EU' && destAirport.region === 'US');

    const isMexicoRoute = 
      (originAirport.country === 'México' || destAirport.country === 'México');

    // Adaptar itinerarios al tipo de ruta consultada
    if (isIntercontinental) {
      // Rutas a Europa: Simular códigos compartidos OneWorld (British Airways, Iberia, etc.)
      airlineName = "Alaska Airlines";
      const partners = ["Iberia", "British Airways", "Finnair"];
      const partner = partners[index % partners.length];
      
      stops = 1;
      if (destAirport.region === 'EU') {
        const hub = partner === 'Iberia' ? 'MAD' : (partner === 'British Airways' ? 'LHR' : 'HEL');
        stopDetails = `1 escala en ${hub} (Codeshare ${partner})`;
      } else {
        stopDetails = `1 escala en SEA (Codeshare ${partner})`;
      }
      
      // Ajustar duración intercontinental
      duration = `${10 + (index * 2)}h ${15 + (index * 10)}m`;
      // Precios de larga distancia
      basePriceUSD = 950 + (index * 150);
    } else if (isMexicoRoute) {
      // Vuelos a México
      stops = index % 2 === 0 ? 0 : 1;
      stopDetails = stops === 0 ? 'Directo' : '1 escala en LAX';
      duration = stops === 0 ? '4h 50m' : '7h 15m';
      basePriceUSD = 320 + (index * 45);
    } else {
      // Vuelos domésticos dentro de EE. UU. (ej: Seattle a Los Ángeles, o JFK a SEA)
      stops = index === 2 ? 1 : 0;
      stopDetails = stops === 0 ? 'Directo' : '1 escala en SFO';
      duration = stops === 0 ? '2h 45m' : '5h 10m';
      basePriceUSD = 180 + (index * 60);
    }

    // Ajustar multiplicador de clase
    let classMultiplier = 1.0;
    if (cabin === 'business') {
      classMultiplier = 3.2; // Alaska First/Business es aprox 3.2 veces económica
    }

    // Añadir aleatoriedad diaria basada en la fecha para dinamismo
    const dateHash = departureDate.split('-').reduce((acc, val) => acc + parseInt(val), 0);
    const randomFactor = 0.95 + ((dateHash % 10) / 100); // Factor entre 0.95 y 1.05

    let finalBasePrice = Math.round(basePriceUSD * classMultiplier * randomFactor * passengerCount);

    // --- CALCULADOR DINÁMICO FLYTZI ---
    const priceOfficial = finalBasePrice;
    const priceFlytzi = Math.round(priceOfficial * (1 - discountRate));
    const savingUSD = priceOfficial - priceFlytzi;
    const discountPercent = Math.round(discountRate * 100);

    // --- LÓGICA DE PRECIOS DE EQUIPAJE SEGÚN LA RUTA (POR PERSONA Y TRAYECTO) ---
    const bagMultiplier = (returnDate ? 2 : 1) * passengerCount;
    let carryOnBase = 30;
    let checkedBase = 40;

    if (isIntercontinental) {
      carryOnBase = 55;
      checkedBase = 75;
    } else if (isMexicoRoute) {
      carryOnBase = 40;
      checkedBase = 55;
    }

    const carryOnPriceOfficial = carryOnBase * bagMultiplier;
    const carryOnPriceFlytzi = Math.round(carryOnPriceOfficial * (1 - discountRate));
    const checkedPriceOfficial = checkedBase * bagMultiplier;
    const checkedPriceFlytzi = Math.round(checkedPriceOfficial * (1 - discountRate));

    // Generar ID de vuelo único
    const flightId = `FL-${flightNumber}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Crear itinerario de Ida
    const outbound = {
      flightId,
      airline: airlineName,
      logo: alaskaTemplates.logo,
      flightNumber: flightNumber,
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
      duration: duration,
      stops: stops,
      stopDetails: stopDetails,
      cabinClass: cabin === 'business' ? 'Business / Primera' : 'Económica',
      passengers: passengerCount,
      pricing: {
        officialPrice: priceOfficial,
        flytziPrice: priceFlytzi,
        saving: savingUSD,
        discountPercent,
        currency: 'USD',
        carryOnPriceOfficial,
        carryOnPriceFlytzi,
        checkedPriceOfficial,
        checkedPriceFlytzi
      }
    };

    // Si es viaje redondo, crear itinerario de regreso realista
    if (returnDate) {
      const returnFlightNumber = flightNumber.replace(/\d+/, (n) => parseInt(n) + 1);
      const returnPriceOfficial = Math.round(priceOfficial * 0.95);
      const returnPriceFlytzi = Math.round(returnPriceOfficial * (1 - discountRate));
      const returnSavingUSD = returnPriceOfficial - returnPriceFlytzi;

      let returnStopDetails = stopDetails;
      if (stops === 1) {
        if (destAirport.region === 'EU') {
          returnStopDetails = stopDetails.replace(/en [A-Z]{3}/, `en ${originAirport.code}`);
        } else {
          returnStopDetails = stopDetails.replace('LAX', 'SEA').replace('SFO', 'SEA');
        }
      }

      outbound.returnFlight = {
        flightNumber: returnFlightNumber,
        origin: destAirport.code,
        originCity: destAirport.city,
        originAirport: destAirport.name,
        destination: originAirport.code,
        destinationCity: originAirport.city,
        destinationAirport: originAirport.name,
        depTime: fTemplate.arrTime === '01:05' || fTemplate.arrTime === '20:30' ? '18:15' : '10:45',
        arrTime: fTemplate.depTime === '07:30' || fTemplate.depTime === '09:00' ? '23:30' : '07:15',
        depDate: getFormattedDate(returnDate),
        depDateRaw: returnDate,
        duration: duration,
        stops: stops,
        stopDetails: returnStopDetails,
      };

      // Actualizar precios del paquete redondo
      outbound.pricing.officialPrice += returnPriceOfficial;
      outbound.pricing.flytziPrice += returnPriceFlytzi;
      outbound.pricing.saving += returnSavingUSD;
    }

    results.push(outbound);
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
