const express = require('express');
const router = express.Router();
const db = require('../db/pool');
const fs = require('fs');
const path = require('path');

let airports = [];
try {
  airports = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'airports.json'), 'utf8'));
} catch (error) {
  console.error("Error al cargar la base de datos de aeropuertos:", error);
}

// Helpers para aeropuertos
function getAirportCity(code) {
  const airport = airports.find(a => a.code === code.toUpperCase());
  return airport ? airport.city : code;
}

function getAirportName(code) {
  const airport = airports.find(a => a.code === code.toUpperCase());
  return airport ? airport.name : '';
}

function getFormattedDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const options = { weekday: 'short', day: '2-digit', month: 'short' };
  return date.toLocaleDateString('es-ES', options);
}

function getDurationFormatted(minutes) {
  if (!minutes) return '8h 00m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function calculateArrivalTime(depTimeStr, durationMinutes) {
  if (!depTimeStr) return '12:00';
  const duration = parseInt(durationMinutes) || 480; // 8 horas por defecto si es null
  const [depH, depM] = depTimeStr.split(':').map(Number);
  const totalDepMinutes = depH * 60 + depM;
  const totalArrMinutes = totalDepMinutes + duration;
  const arrH = Math.floor(totalArrMinutes / 60) % 24;
  const arrM = totalArrMinutes % 60;
  return `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`;
}

// GET /api/inventory/search
router.get('/search', async (req, res) => {
  const { origin, destination, departure_date, return_date, cabin, passengers, flexDates } = req.query;

  if (!origin || !destination || !departure_date) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios: origin, destination, departure_date' });
  }

  const reqOrigin = origin.toUpperCase();
  const reqDest = destination.toUpperCase();
  const reqPassengers = parseInt(passengers) || 1;
  const reqCabin = cabin ? cabin.toLowerCase() : 'economy';
  const isFlex = flexDates === 'true';

  try {
    // 1. Obtener vuelos de ida (Outbound)
    let outboundQuery = `
      SELECT * FROM award_inventory 
      WHERE origin = $1 
        AND destination = $2 
        AND status = 'available' 
        AND expires_at > NOW() 
        AND seats_available >= $3
    `;
    const outboundParams = [reqOrigin, reqDest, reqPassengers];

    if (isFlex) {
      outboundQuery += ` AND departure_date BETWEEN ($4::DATE - INTERVAL '3 days')::DATE AND ($4::DATE + INTERVAL '3 days')::DATE`;
      outboundParams.push(departure_date);
    } else {
      outboundQuery += ` AND departure_date = $4::DATE`;
      outboundParams.push(departure_date);
    }

    if (cabin) {
      outboundQuery += ` AND cabin = $5`;
      outboundParams.push(reqCabin);
    }

    const { rows: outboundFlights } = await db.query(outboundQuery, outboundParams);

    let finalResults = [];

    // 2. Si es viaje redondo (Roundtrip), buscar y combinar con vuelos de regreso (Inbound)
    if (return_date) {
      let inboundQuery = `
        SELECT * FROM award_inventory 
        WHERE origin = $1 
          AND destination = $2 
          AND status = 'available' 
          AND expires_at > NOW() 
          AND seats_available >= $3
      `;
      const inboundParams = [reqDest, reqOrigin, reqPassengers];

      if (isFlex) {
        inboundQuery += ` AND departure_date BETWEEN ($4::DATE - INTERVAL '3 days')::DATE AND ($4::DATE + INTERVAL '3 days')::DATE`;
        inboundParams.push(return_date);
      } else {
        inboundQuery += ` AND departure_date = $4::DATE`;
        inboundParams.push(return_date);
      }

      if (cabin) {
        inboundQuery += ` AND cabin = $5`;
        inboundParams.push(reqCabin);
      }

      const { rows: inboundFlights } = await db.query(inboundQuery, inboundParams);

      // Combinar vuelos de ida y vuelta
      outboundFlights.forEach(out => {
        inboundFlights.forEach(inb => {
          // Validar que la vuelta sea en fecha igual o posterior a la ida
          if (new Date(inb.departure_date) >= new Date(out.departure_date)) {
            const outDateRaw = new Date(out.departure_date).toISOString().split('T')[0];
            const inbDateRaw = new Date(inb.departure_date).toISOString().split('T')[0];

            // Variaciones del precio
            const priceOfficial = Math.round(Number(out.price_market) + Number(inb.price_market));
            const priceFlytzi = Math.round(Number(out.price_to_customer) + Number(inb.price_to_customer));
            const savingUSD = priceOfficial - priceFlytzi;
            const discountPercent = priceOfficial > 0 ? Math.round((savingUSD / priceOfficial) * 100) : 35;

            // Formatear el itinerario
            const parsedItinerary = {
              flightId: `${out.id}_${inb.id}`,
              airline: out.airline,
              logo: out.airline_code,
              operatingAirline: out.airline,
              operatingLogo: out.airline_code,
              flightNumber: out.flight_number || `AS-${Math.floor(100 + Math.random() * 900)}`,
              origin: out.origin,
              originCity: getAirportCity(out.origin),
              originAirport: getAirportName(out.origin),
              destination: out.destination,
              destinationCity: getAirportCity(out.destination),
              destinationAirport: getAirportName(out.destination),
              depTime: '08:45', // En este flujo podemos pre-cargar o parsear del scraper
              arrTime: calculateArrivalTime('08:45', out.duration_minutes),
              depDate: getFormattedDate(out.departure_date),
              depDateRaw: outDateRaw,
              duration: getDurationFormatted(out.duration_minutes),
              stops: out.stops,
              stopDetails: out.stops > 0 ? `${out.stops} escala(s)` : 'Directo',
              cabinClass: out.cabin === 'business' ? 'Business / Primera' : 'Económica',
              passengers: reqPassengers,
              seatsAvailable: Math.min(out.seats_available, inb.seats_available),
              pricing: {
                officialPrice: priceOfficial,
                flytziPrice: priceFlytzi,
                saving: savingUSD,
                discountPercent,
                currency: 'USD',
                carryOnPriceOfficial: 0,
                carryOnPriceFlytzi: 0,
                checkedPriceOfficial: 0,
                checkedPriceFlytzi: 0
              },
              returnFlight: {
                flightNumber: inb.flight_number || `AS-${Math.floor(100 + Math.random() * 900)}`,
                airline: inb.airline,
                logo: inb.airline_code,
                operatingAirline: inb.airline,
                operatingLogo: inb.airline_code,
                origin: inb.origin,
                originCity: getAirportCity(inb.origin),
                originAirport: getAirportName(inb.origin),
                destination: inb.destination,
                destinationCity: getAirportCity(inb.destination),
                destinationAirport: getAirportName(inb.destination),
                depTime: '17:15',
                arrTime: calculateArrivalTime('17:15', inb.duration_minutes),
                depDate: getFormattedDate(inb.departure_date),
                depDateRaw: inbDateRaw,
                duration: getDurationFormatted(inb.duration_minutes),
                stops: inb.stops,
                stopDetails: inb.stops > 0 ? `${inb.stops} escala(s)` : 'Directo'
              }
            };
            finalResults.push(parsedItinerary);
          }
        });
      });
    } else {
      // 3. Solo Ida (One Way)
      outboundFlights.forEach(out => {
        const outDateRaw = new Date(out.departure_date).toISOString().split('T')[0];
        const priceOfficial = Math.round(Number(out.price_market));
        const priceFlytzi = Math.round(Number(out.price_to_customer));
        const savingUSD = priceOfficial - priceFlytzi;
        const discountPercent = priceOfficial > 0 ? Math.round((savingUSD / priceOfficial) * 100) : 35;

        const parsedItinerary = {
          flightId: out.id,
          airline: out.airline,
          logo: out.airline_code,
          operatingAirline: out.airline,
          operatingLogo: out.airline_code,
          flightNumber: out.flight_number || `AS-${Math.floor(100 + Math.random() * 900)}`,
          origin: out.origin,
          originCity: getAirportCity(out.origin),
          originAirport: getAirportName(out.origin),
          destination: out.destination,
          destinationCity: getAirportCity(out.destination),
          destinationAirport: getAirportName(out.destination),
          depTime: '08:45',
          arrTime: calculateArrivalTime('08:45', out.duration_minutes),
          depDate: getFormattedDate(out.departure_date),
          depDateRaw: outDateRaw,
          duration: getDurationFormatted(out.duration_minutes),
          stops: out.stops,
          stopDetails: out.stops > 0 ? `${out.stops} escala(s)` : 'Directo',
          cabinClass: out.cabin === 'business' ? 'Business / Primera' : 'Económica',
          passengers: reqPassengers,
          seatsAvailable: out.seats_available,
          pricing: {
            officialPrice: priceOfficial,
            flytziPrice: priceFlytzi,
            saving: savingUSD,
            discountPercent,
            currency: 'USD',
            carryOnPriceOfficial: 0,
            carryOnPriceFlytzi: 0,
            checkedPriceOfficial: 0,
            checkedPriceFlytzi: 0
          }
        };
        finalResults.push(parsedItinerary);
      });
    }

    // Ordenar resultados por menor precio optimizado
    finalResults.sort((a, b) => a.pricing.flytziPrice - b.pricing.flytziPrice);

    // 4. Registrar la búsqueda en search_logs de forma asíncrona
    db.query(`
      INSERT INTO search_logs (origin, destination, departure_date, return_date, cabin, passengers, results_count, user_ip)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [reqOrigin, reqDest, departure_date, return_date || null, reqCabin, reqPassengers, finalResults.length, req.ip])
    .catch(err => console.error("[search_logs] Error al registrar logs de búsqueda:", err));

    res.json(finalResults);

  } catch (error) {
    console.error("[Search Error]:", error);
    res.status(500).json({ error: 'Error interno del servidor al consultar disponibilidad.' });
  }
});

module.exports = router;
