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

// Helper para encontrar la ciudad de un aeropuerto por IATA
function getAirportCity(code) {
  const airport = airports.find(a => a.code === code.toUpperCase());
  return airport ? airport.city : code;
}

// Helper para encontrar el país de un aeropuerto por IATA
function getAirportCountry(code) {
  const airport = airports.find(a => a.code === code.toUpperCase());
  return airport ? airport.country : '';
}

// 2. Parser para las respuestas crudas de FlightAPI.io
function parseFlightApiResponse(apiData, cabinClass, passengerCount, isRoundtrip) {
  const itineraries = apiData.itineraries || [];
  const legsList = apiData.legs || [];
  const segmentsList = apiData.segments || [];
  const carriersList = apiData.carriers || [];

  const legsMap = {};
  legsList.forEach(leg => {
    legsMap[leg.id] = leg;
  });

  const segmentsMap = {};
  segmentsList.forEach(seg => {
    segmentsMap[seg.id] = seg;
  });

  const carriersMap = {};
  if (Array.isArray(carriersList)) {
    carriersList.forEach(carrier => {
      carriersMap[carrier.id] = carrier;
    });
  } else if (typeof carriersList === 'object') {
    Object.keys(carriersList).forEach(id => {
      carriersMap[id] = carriersList[id];
    });
  }

  const results = [];

  itineraries.forEach(itinerary => {
    const legIds = itinerary.leg_ids || [];
    if (legIds.length === 0) return;

    const outboundLegId = legIds[0];
    const outboundLeg = legsMap[outboundLegId];
    if (!outboundLeg) return;

    const outSegmentIds = outboundLeg.segment_ids || [];
    if (outSegmentIds.length === 0) return;

    // Obtener los códigos de las aerolíneas de los segmentos
    const segmentCarriers = outSegmentIds.map(segId => {
      const seg = segmentsMap[segId];
      if (!seg) return null;
      return seg.carrier_id || seg.marketing_carrier_id || seg.operating_carrier_id || '';
    }).filter(Boolean);

    // Filtrar: Solo Alaska Airlines (AS, QX, OO) o OneWorld partners (AA, IB, BA, AY)
    const isAlaskaOrOneWorld = segmentCarriers.some(carrierCode => {
      const code = String(carrierCode).toUpperCase();
      return ['AS', 'QX', 'OO', 'AA', 'IB', 'BA', 'AY'].some(val => code.includes(val));
    });

    if (!isAlaskaOrOneWorld) return;

    const carrierId = segmentCarriers[0] || 'AS';
    const carrierObj = carriersMap[carrierId] || { name: 'Alaska Airlines', code: 'AS' };
    const airlineName = carrierObj.name || 'Alaska Airlines';
    const carrierCode = carrierObj.code || carrierId;

    const firstSegment = segmentsMap[outSegmentIds[0]];
    const lastSegment = segmentsMap[outSegmentIds[outSegmentIds.length - 1]];
    if (!firstSegment || !lastSegment) return;

    const depTime = firstSegment.departure ? firstSegment.departure.split('T')[1].substring(0, 5) : '08:00';
    const arrTime = lastSegment.arrival ? lastSegment.arrival.split('T')[1].substring(0, 5) : '10:45';
    
    const durationMin = outboundLeg.duration || 120;
    const durationFormatted = `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;

    const stops = outboundLeg.stop_count || 0;
    let stopDetails = 'Directo';
    if (stops > 0) {
      const scaleAirports = outSegmentIds.slice(0, -1).map(segId => {
        const seg = segmentsMap[segId];
        if (!seg) return '';
        const code = seg.destination_place_id || seg.arrival_airport || '';
        if (!code) return '';
        
        const city = getAirportCity(String(code));
        const country = getAirportCountry(String(code));
        
        // Determinar si hay codeshare
        const segmentCarrierId = seg.carrier_id || seg.marketing_carrier_id || '';
        const segmentCarrierObj = carriersMap[segmentCarrierId] || {};
        const segmentCarrierName = segmentCarrierObj.name || '';
        const segmentCarrierCode = segmentCarrierObj.code || segmentCarrierId;
        
        let codeshareStr = '';
        if (segmentCarrierCode && segmentCarrierCode.toUpperCase() !== 'AS') {
          const cleanName = segmentCarrierName.replace(/\s*Airlines\s*/i, '').replace(/\s*Airways\s*/i, '');
          codeshareStr = ` (Codeshare ${cleanName})`;
        }
        
        return `${city}, ${country} (${String(code).toUpperCase()})${codeshareStr}`;
      }).filter(Boolean);
      stopDetails = `${stops} escala${stops > 1 ? 's' : ''} en ${scaleAirports.join(', ')}`;
    }

    let officialPriceUSD = 450;
    if (itinerary.price) {
      if (typeof itinerary.price === 'number') {
        officialPriceUSD = itinerary.price;
      } else if (itinerary.price.amount) {
        officialPriceUSD = itinerary.price.amount;
      }
    }
    officialPriceUSD = Math.round(officialPriceUSD);

    const destCode = outboundLeg.destination_place_id || lastSegment.destination_place_id || '';
    const originCode = outboundLeg.origin_place_id || firstSegment.origin_place_id || '';
    
    const region = getAirportRegion(String(destCode));
    let discountRate = 0.35;
    if (region === 'EU') {
      discountRate = 0.40;
    } else if (region === 'US') {
      discountRate = 0.30;
    }

    const priceOfficial = officialPriceUSD;
    const priceFlytzi = Math.round(priceOfficial * (1 - discountRate));
    const savingUSD = priceOfficial - priceFlytzi;
    const discountPercent = Math.round(discountRate * 100);

    const bagMultiplier = legIds.length * passengerCount;
    let carryOnBase = 30;
    let checkedBase = 40;
    const isIntercontinental = (region === 'EU');
    const isMexicoRoute = (region === 'LATAM');

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

    const flightNumber = firstSegment.marketing_flight_number || firstSegment.designator || `AS-${Math.floor(100 + Math.random() * 900)}`;
    const flightId = `FL-${flightNumber}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const parsedItinerary = {
      flightId,
      airline: airlineName,
      logo: carrierCode === 'QX' || carrierCode === 'OO' ? 'AS' : (['AS', 'AA', 'IB', 'BA', 'AY'].includes(carrierCode.toUpperCase()) ? carrierCode.toUpperCase() : 'AS'),
      flightNumber: flightNumber,
      origin: String(originCode).toUpperCase(),
      originCity: getAirportCity(String(originCode)),
      originAirport: getAirportName(String(originCode)),
      destination: String(destCode).toUpperCase(),
      destinationCity: getAirportCity(String(destCode)),
      destinationAirport: getAirportName(String(destCode)),
      depTime,
      arrTime,
      depDate: getFormattedDate(firstSegment.departure || outboundLeg.departure || ''),
      depDateRaw: (firstSegment.departure || outboundLeg.departure || '').split('T')[0],
      duration: durationFormatted,
      stops: stops,
      stopDetails: stopDetails,
      cabinClass: cabinClass === 'Business' ? 'Business / Primera' : 'Económica',
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

    if (isRoundtrip && legIds.length > 1) {
      const inboundLegId = legIds[1];
      const inboundLeg = legsMap[inboundLegId];
      if (inboundLeg) {
        const inSegmentIds = inboundLeg.segment_ids || [];
        if (inSegmentIds.length > 0) {
          const inFirstSeg = segmentsMap[inSegmentIds[0]];
          const inLastSeg = segmentsMap[inSegmentIds[inSegmentIds.length - 1]];
          if (inFirstSeg && inLastSeg) {
            const inDepTime = inFirstSeg.departure ? inFirstSeg.departure.split('T')[1].substring(0, 5) : '18:15';
            const inArrTime = inLastSeg.arrival ? inLastSeg.arrival.split('T')[1].substring(0, 5) : '23:30';
            const inStops = inboundLeg.stop_count || 0;
            let inStopDetails = 'Directo';
            if (inStops > 0) {
              const inScaleAirports = inSegmentIds.slice(0, -1).map(segId => {
                const seg = segmentsMap[segId];
                if (!seg) return '';
                const code = seg.destination_place_id || seg.arrival_airport || '';
                if (!code) return '';
                
                const city = getAirportCity(String(code));
                const country = getAirportCountry(String(code));
                
                // Determinar si hay codeshare
                const segmentCarrierId = seg.carrier_id || seg.marketing_carrier_id || '';
                const segmentCarrierObj = carriersMap[segmentCarrierId] || {};
                const segmentCarrierName = segmentCarrierObj.name || '';
                const segmentCarrierCode = segmentCarrierObj.code || segmentCarrierId;
                
                let codeshareStr = '';
                if (segmentCarrierCode && segmentCarrierCode.toUpperCase() !== 'AS') {
                  const cleanName = segmentCarrierName.replace(/\s*Airlines\s*/i, '').replace(/\s*Airways\s*/i, '');
                  codeshareStr = ` (Codeshare ${cleanName})`;
                }
                
                return `${city}, ${country} (${String(code).toUpperCase()})${codeshareStr}`;
              }).filter(Boolean);
              inStopDetails = `${inStops} escala${inStops > 1 ? 's' : ''} en ${inScaleAirports.join(', ')}`;
            }
            const inDurationMin = inboundLeg.duration || 120;
            const inDurationFormatted = `${Math.floor(inDurationMin / 60)}h ${inDurationMin % 60}m`;

            parsedItinerary.returnFlight = {
              flightNumber: inFirstSeg.marketing_flight_number || inFirstSeg.designator || `AS-${Math.floor(100 + Math.random() * 900)}`,
              origin: String(destCode).toUpperCase(),
              originCity: getAirportCity(String(destCode)),
              originAirport: getAirportName(String(destCode)),
              destination: String(originCode).toUpperCase(),
              destinationCity: getAirportCity(String(originCode)),
              destinationAirport: getAirportName(String(originCode)),
              depTime: inDepTime,
              arrTime: inArrTime,
              depDate: getFormattedDate(inFirstSeg.departure || inboundLeg.departure || ''),
              depDateRaw: (inFirstSeg.departure || inboundLeg.departure || '').split('T')[0],
              duration: inDurationFormatted,
              stops: inStops,
              stopDetails: inStopDetails
            };
          }
        }
      }
    }

    results.push(parsedItinerary);
  });

  return results;
}

// 3. Endpoint: Motor de Búsqueda Híbrido Real API & Fallback de Contingencia
app.get('/api/flights', async (req, res) => {
  const { origin, destination, departureDate, returnDate, passengers, cabinClass, flexDates } = req.query;

  if (!origin || !destination || !departureDate) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios: origin, destination, departureDate' });
  }

  const passengerCount = parseInt(passengers) || 1;
  const cabin = (cabinClass || 'economy').toLowerCase();

  // Validar existencia de aeropuertos en la base de datos estática
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

  let finalFlights = [];
  const apiKey = process.env.FLIGHT_API_KEY || '6a11ff72bffbe305a6da9473';
  const adults = passengerCount;
  const cabinClassMap = cabin === 'business' ? 'Business' : 'Economy';
  const isRound = (req.query.returnDate && returnDate);

  // --- CONSULTA A FLIGHTAPI.IO REAL ---
  try {
    const flightUrl = isRound 
      ? `https://api.flightapi.io/roundtrip/${apiKey}/${origin.toUpperCase()}/${destination.toUpperCase()}/${departureDate}/${returnDate}/${adults}/0/0/${cabinClassMap}/USD`
      : `https://api.flightapi.io/onewaytrip/${apiKey}/${origin.toUpperCase()}/${destination.toUpperCase()}/${departureDate}/${adults}/0/0/${cabinClassMap}/USD`;

    console.log(`[FlightAPI] Consultando vuelos reales en la API: ${flightUrl}`);

    const apiResponse = await fetch(flightUrl);
    if (apiResponse.ok) {
      const apiData = await apiResponse.json();
      finalFlights = parseFlightApiResponse(apiData, cabinClassMap, adults, isRound);
      console.log(`[FlightAPI] Encontrados ${finalFlights.length} vuelos reales elegibles de Alaska Airlines & OneWorld.`);
    } else {
      console.warn(`[FlightAPI] Error en respuesta de la API (Status: ${apiResponse.status}). Activando Fallback.`);
    }
  } catch (apiError) {
    console.error(`[FlightAPI] Error de comunicación con API. Activando Fallback de contingencia:`, apiError.message);
  }

  // --- LÓGICA DE CONTINGENCIA: FALLBACK GENERATOR (Si la API falla o devuelve 0 resultados) ---
  if (!finalFlights || finalFlights.length === 0) {
    console.log("[Flytzi Backend] Activando generador local de itinerarios de contingencia para Alaska Airlines.");
    
    // Mapeamos las plantillas de Alaska Airlines y adaptamos cada una a la ruta consultada
    const alaskaTemplates = flightTemplates.find(a => a.logo === 'AS') || { airline: 'Alaska Airlines', logo: 'AS', flights: [] };

    alaskaTemplates.flights.forEach((fTemplate, index) => {
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

      if (isIntercontinental) {
        airlineName = "Alaska Airlines";
        const partners = ["Iberia", "British Airways", "Finnair"];
        const partner = partners[index % partners.length];
        stops = 1;
        if (destAirport.region === 'EU') {
          const hubCode = partner === 'Iberia' ? 'MAD' : (partner === 'British Airways' ? 'LHR' : 'HEL');
          const hubCity = getAirportCity(hubCode);
          const hubCountry = getAirportCountry(hubCode);
          stopDetails = `1 escala en ${hubCity}, ${hubCountry} (${hubCode}) (Codeshare ${partner})`;
        } else {
          stopDetails = `1 escala en Seattle, Estados Unidos (SEA) (Codeshare ${partner})`;
        }
        duration = `${10 + (index * 2)}h ${15 + (index * 10)}m`;
        basePriceUSD = 950 + (index * 150);
      } else if (isMexicoRoute) {
        stops = index % 2 === 0 ? 0 : 1;
        stopDetails = stops === 0 ? 'Directo' : '1 escala en Los Ángeles, Estados Unidos (LAX)';
        duration = stops === 0 ? '4h 50m' : '7h 15m';
        basePriceUSD = 320 + (index * 45);
      } else {
        stops = index === 2 ? 1 : 0;
        stopDetails = stops === 0 ? 'Directo' : '1 escala en San Francisco, Estados Unidos (SFO)';
        duration = stops === 0 ? '2h 45m' : '5h 10m';
        basePriceUSD = 180 + (index * 60);
      }

      let classMultiplier = 1.0;
      if (cabin === 'business') {
        classMultiplier = 3.2;
      }

      const dateHash = departureDate.split('-').reduce((acc, val) => acc + parseInt(val), 0);
      const randomFactor = 0.95 + ((dateHash % 10) / 100);

      let finalBasePrice = Math.round(basePriceUSD * classMultiplier * randomFactor * passengerCount);

      const priceOfficial = finalBasePrice;
      const priceFlytzi = Math.round(priceOfficial * (1 - discountRate));
      const savingUSD = priceOfficial - priceFlytzi;
      const discountPercent = Math.round(discountRate * 100);

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

      const flightId = `FL-${flightNumber}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

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

        outbound.pricing.officialPrice += returnPriceOfficial;
        outbound.pricing.flytziPrice += returnPriceFlytzi;
        outbound.pricing.saving += returnSavingUSD;
      }

      finalFlights.push(outbound);
    });
  }

  // --- LÓGICA DE EXPANSIÓN HÍBRIDA DE FECHAS FLEXIBLES (+/- 3 días) (Credit-Saving) ---
  if (flexDates === 'true' && finalFlights.length > 0) {
    console.log(`[Flytzi Backend] Generando expansión híbrida para Fechas Flexibles a partir de ${finalFlights.length} vuelos base.`);
    const expandedResults = [];
    const dateOffsets = [
      { days: -2, diffStr: '-2 días', priceFactor: 0.94 },
      { days: -1, diffStr: '-1 día', priceFactor: 0.97 },
      { days: 1, diffStr: '+1 día', priceFactor: 1.05 },
      { days: 2, diffStr: '+2 días', priceFactor: 0.93 }
    ];

    finalFlights.forEach(flight => {
      // Agregar el vuelo del día original
      expandedResults.push(flight);

      // Expandir para fechas adyacentes
      dateOffsets.forEach(offset => {
        const cloned = JSON.parse(JSON.stringify(flight));
        
        // Desviar fecha de ida
        const outDate = new Date(cloned.depDateRaw);
        outDate.setDate(outDate.getDate() + offset.days);
        cloned.depDateRaw = outDate.toISOString().split('T')[0];
        cloned.depDate = getFormattedDate(cloned.depDateRaw);

        // Desviar fecha de regreso (si aplica)
        if (cloned.returnFlight) {
          const inDate = new Date(cloned.returnFlight.depDateRaw);
          inDate.setDate(inDate.getDate() + offset.days);
          cloned.returnFlight.depDateRaw = inDate.toISOString().split('T')[0];
          cloned.returnFlight.depDate = getFormattedDate(cloned.returnFlight.depDateRaw);
        }

        // Variación matemática del precio por offset
        cloned.pricing.officialPrice = Math.round(cloned.pricing.officialPrice * offset.priceFactor);
        cloned.pricing.flytziPrice = Math.round(cloned.pricing.flytziPrice * offset.priceFactor);
        cloned.pricing.saving = cloned.pricing.officialPrice - cloned.pricing.flytziPrice;
        
        cloned.isFlexibleDate = true;
        cloned.flexibleDateDiff = offset.diffStr;
        
        // Generar un ID único por clon
        cloned.flightId = cloned.flightId.replace(/-[A-Z0-9]+$/, `-${Math.random().toString(36).substring(2, 7).toUpperCase()}`);
        
        expandedResults.push(cloned);
      });
    });

    const sortedResults = expandedResults.sort((a, b) => a.pricing.flytziPrice - b.pricing.flytziPrice);
    return res.json(sortedResults);
  }

  // Ordenar resultados por precio optimizado
  const sortedResults = finalFlights.sort((a, b) => a.pricing.flytziPrice - b.pricing.flytziPrice);
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
