const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// POST /api/webhooks/stripe - Confirmación de pago Stripe
router.post('/stripe', async (req, res) => {
  const event = req.body;

  // Lógica simplificada de procesamiento del Webhook de Stripe (para pruebas locales y n8n)
  // En producción real, aquí se verificaría la firma con: stripe.webhooks.constructEvent(...)
  
  try {
    let bookingId = null;
    let paymentIntentId = null;

    // Procesar evento "checkout.session.completed" o "payment_intent.succeeded"
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      bookingId = session.metadata ? session.metadata.booking_id : null;
      paymentIntentId = session.payment_intent;
    } else if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      bookingId = pi.metadata ? pi.metadata.booking_id : null;
      paymentIntentId = pi.id;
    } else if (event.booking_id) {
      // Fallback para pruebas y triggers manuales de n8n
      bookingId = event.booking_id;
      paymentIntentId = event.payment_intent_id || 'pi_test_manual';
    }

    if (!bookingId) {
      return res.status(400).json({ received: true, message: 'Evento ignorado. Falta el ID de reserva en metadata.' });
    }

    // 1. Obtener la reserva actual
    const { rows: reservationRows } = await db.query('SELECT * FROM reservations WHERE id = $1', [bookingId]);
    if (reservationRows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }
    const reservation = reservationRows[0];

    // 2. Si ya está pagada o emitida, retornar éxito para no repetir procesos
    if (reservation.status === 'paid' || reservation.status === 'issued') {
      return res.json({ success: true, message: 'La reserva ya fue procesada anteriormente.' });
    }

    // 3. Iniciar transacción para actualizar reserva e inventario simultáneamente
    await db.query('BEGIN');

    // Actualizar la reserva a pagada
    const updateResQuery = `
      UPDATE reservations
      SET status = 'paid',
          stripe_payment_intent_id = $1,
          payment_confirmed_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    await db.query(updateResQuery, [paymentIntentId, bookingId]);

    // Si tiene un inventario asociado, marcar el inventario como "reserved" para que no se venda de nuevo
    if (reservation.inventory_id) {
      await db.query(`
        UPDATE award_inventory
        SET status = 'reserved'
        WHERE id = $1
      `, [reservation.inventory_id]);
    }

    await db.query('COMMIT');

    // TODO: Notificar por webhook a n8n para enviar WhatsApp al Concierge para emisión manual inmediata

    console.log(`[Stripe Webhook] Reserva ${bookingId} pagada exitosamente.`);
    res.json({ success: true, message: 'Reserva marcada como pagada y bloqueada en inventario.' });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error("[Stripe Webhook Error]:", error);
    res.status(500).json({ error: 'Error al procesar webhook de pago.' });
  }
});

module.exports = router;
