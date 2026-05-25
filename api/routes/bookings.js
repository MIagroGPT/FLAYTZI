const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// POST /api/bookings - Crear una solicitud de reserva
router.post('/', async (req, res) => {
  const {
    inventory_id,
    passenger_name,
    passenger_email,
    passenger_phone,
    passport_number,
    passport_country,
    passport_expiry,
    date_of_birth,
    origin,
    destination,
    departure_date,
    return_date,
    cabin,
    passengers,
    price_quoted
  } = req.body;

  if (!passenger_name || !passenger_email) {
    return res.status(400).json({ error: 'El nombre y el correo electrónico del pasajero son obligatorios.' });
  }

  try {
    let finalOrigin = origin;
    let finalDestination = destination;
    let finalDepartureDate = departure_date;
    let finalReturnDate = return_date;
    let finalCabin = cabin || 'economy';
    let finalPassengers = parseInt(passengers) || 1;
    let finalPriceQuoted = Number(price_quoted) || 0.00;
    let targetInventoryId = inventory_id || null;

    // Si se provee un inventory_id (reserva directa sobre inventario validado)
    if (inventory_id) {
      // Si el id contiene un guión bajo '_', significa que es un paquete de ida y vuelta combinado
      if (inventory_id.includes('_')) {
        const [outboundId, inboundId] = inventory_id.split('_');
        
        // Obtener tramo de ida
        const { rows: outRows } = await db.query('SELECT * FROM award_inventory WHERE id = $1', [outboundId]);
        // Obtener tramo de regreso
        const { rows: inRows } = await db.query('SELECT * FROM award_inventory WHERE id = $1', [inboundId]);

        if (outRows.length > 0 && inRows.length > 0) {
          const outFlight = outRows[0];
          const inFlight = inRows[0];

          finalOrigin = outFlight.origin;
          finalDestination = outFlight.destination;
          finalDepartureDate = outFlight.departure_date;
          finalReturnDate = inFlight.departure_date;
          finalCabin = outFlight.cabin;
          finalPriceQuoted = (Number(outFlight.price_to_customer) + Number(inFlight.price_to_customer)) * finalPassengers;
          targetInventoryId = outFlight.id; // Guardamos el del primer tramo como referencia en la columna
        }
      } else {
        // Un solo tramo (One Way)
        const { rows } = await db.query('SELECT * FROM award_inventory WHERE id = $1', [inventory_id]);
        if (rows.length > 0) {
          const flight = rows[0];
          finalOrigin = flight.origin;
          finalDestination = flight.destination;
          finalDepartureDate = flight.departure_date;
          finalReturnDate = flight.return_date || null;
          finalCabin = flight.cabin;
          finalPriceQuoted = Number(flight.price_to_customer) * finalPassengers;
        }
      }
    }

    // Validar que tengamos los datos mínimos de vuelo
    if (!finalOrigin || !finalDestination || !finalDepartureDate) {
      return res.status(400).json({ error: 'La información del itinerario de vuelo (origen, destino y fecha de salida) es incompleta.' });
    }

    // Insertar la reserva en la base de datos con estado "pending_validation"
    const insertQuery = `
      INSERT INTO reservations (
        inventory_id, passenger_name, passenger_email, passenger_phone,
        passport_number, passport_country, passport_expiry, date_of_birth,
        origin, destination, departure_date, return_date, cabin, passengers,
        price_quoted, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;
    const insertParams = [
      targetInventoryId,
      passenger_name,
      passenger_email,
      passenger_phone || null,
      passport_number || null,
      passport_country || null,
      passport_expiry || null,
      date_of_birth || null,
      finalOrigin.toUpperCase(),
      finalDestination.toUpperCase(),
      finalDepartureDate,
      finalReturnDate || null,
      finalCabin,
      finalPassengers,
      finalPriceQuoted,
      'pending_validation'
    ];

    const { rows: reservationRows } = await db.query(insertQuery, insertParams);
    const newReservation = reservationRows[0];

    // TODO: Enviar alertas por webhook a n8n o sistemas de mensajería (Concierge notification)

    res.status(201).json({
      success: true,
      booking_id: newReservation.id,
      status: newReservation.status,
      price_quoted: newReservation.price_quoted,
      message: 'Tu solicitud de reserva ha sido registrada y está en proceso de validación de millas por nuestro equipo de conserjería.'
    });

  } catch (error) {
    console.error("[Booking Creation Error]:", error);
    res.status(500).json({ error: 'Error interno del servidor al crear la reserva.' });
  }
});

module.exports = router;
