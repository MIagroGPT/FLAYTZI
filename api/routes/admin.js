const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db/pool');
const auth = require('../middleware/auth');
require('dotenv').config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPasswordSegura456!';
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_muy_largo_y_aleatorio_aqui';

// POST /api/admin/login - Iniciar sesión de administración
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ user: username || 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ success: true, token });
  }

  return res.status(401).json({ error: 'Credenciales inválidas.' });
});

// ────────────────────────────────────────────────────────────────
// ENDPOINTS PROTEGIDOS POR JWT
// ────────────────────────────────────────────────────────────────

// --- GESTIÓN DE RUTAS (Playwright targets) ---

// GET /api/admin/routes - Listar todas las rutas
router.get('/routes', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM routes ORDER BY priority ASC, created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error("[Admin Routes Error]:", error);
    res.status(500).json({ error: 'Error al obtener rutas.' });
  }
});

// POST /api/admin/routes - Crear una nueva ruta
router.post('/routes', auth, async (req, res) => {
  const { origin, destination, priority, scan_interval, notes } = req.body;
  if (!origin || !destination) {
    return res.status(400).json({ error: 'Origen y destino son requeridos.' });
  }

  try {
    const query = `
      INSERT INTO routes (origin, destination, priority, scan_interval, notes)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (origin, destination) 
      DO UPDATE SET priority = EXCLUDED.priority, active = true
      RETURNING *
    `;
    const { rows } = await db.query(query, [
      origin.toUpperCase(),
      destination.toUpperCase(),
      priority || 5,
      scan_interval || 6,
      notes || null
    ]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("[Admin Create Route Error]:", error);
    res.status(500).json({ error: 'Error al crear la ruta.' });
  }
});

// PUT /api/admin/routes/:id - Actualizar estado de una ruta
router.put('/routes/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { active, priority, scan_interval, notes } = req.body;

  try {
    const fields = [];
    const params = [id];
    let idx = 2;

    if (active !== undefined) { fields.push(`active = $${idx++}`); params.push(active); }
    if (priority !== undefined) { fields.push(`priority = $${idx++}`); params.push(priority); }
    if (scan_interval !== undefined) { fields.push(`scan_interval = $${idx++}`); params.push(scan_interval); }
    if (notes !== undefined) { fields.push(`notes = $${idx++}`); params.push(notes); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
    }

    const query = `UPDATE routes SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    const { rows } = await db.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ruta no encontrada.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("[Admin Update Route Error]:", error);
    res.status(500).json({ error: 'Error al actualizar la ruta.' });
  }
});

// --- GESTIÓN DE RESERVAS ---

// GET /api/admin/bookings - Ver todas las reservas
router.get('/bookings', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM reservations ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error("[Admin Bookings Error]:", error);
    res.status(500).json({ error: 'Error al obtener las reservas.' });
  }
});

// POST /api/admin/bookings/:id/generate-payment - Generar link de Stripe
router.post('/bookings/:id/generate-payment', auth, async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await db.query('SELECT * FROM reservations WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const booking = rows[0];

    // Generar un link simulado premium de pago Stripe
    const stripePaymentUrl = `/stripe-checkout.html?booking_id=${booking.id}&price=${booking.price_quoted}&route=${booking.origin}-${booking.destination}&name=${encodeURIComponent(booking.passenger_name)}`;

    // Actualizar el estado de la reserva
    const updateQuery = `
      UPDATE reservations 
      SET stripe_payment_url = $1, 
          status = 'payment_link_sent'
      WHERE id = $2 
      RETURNING *
    `;
    const { rows: updatedRows } = await db.query(updateQuery, [stripePaymentUrl, id]);

    // TODO: Disparar evento a n8n para enviar WhatsApp/Email automático con el link de pago al cliente

    res.json({
      success: true,
      stripe_payment_url: stripePaymentUrl,
      reservation: updatedRows[0]
    });

  } catch (error) {
    console.error("[Admin Payment Link Error]:", error);
    res.status(500).json({ error: 'Error al generar el link de pago.' });
  }
});

// POST /api/admin/bookings/:id/issue - Registrar localizador y marcar como emitida
router.post('/bookings/:id/issue', auth, async (req, res) => {
  const { id } = req.params;
  const { pnr_code, issued_by } = req.body;

  if (!pnr_code) {
    return res.status(400).json({ error: 'El código localizador PNR es obligatorio.' });
  }

  try {
    const query = `
      UPDATE reservations
      SET pnr_code = $1,
          issued_by = $2,
          issued_at = NOW(),
          status = 'issued'
      WHERE id = $3
      RETURNING *
    `;
    const { rows } = await db.query(query, [pnr_code.toUpperCase(), issued_by || 'Concierge System', id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    // TODO: Notificar al usuario por WhatsApp/Email sobre boleto emitido con su PNR

    res.json({
      success: true,
      message: 'Reserva emitida exitosamente con el código localizador provisto.',
      reservation: rows[0]
    });
  } catch (error) {
    console.error("[Admin Issue Error]:", error);
    res.status(500).json({ error: 'Error al emitir la reserva.' });
  }
});

// PUT /api/admin/bookings/:id - Actualizar estado o datos de una reserva
router.put('/bookings/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { status, pnr_code, admin_notes } = req.body;

  try {
    const fields = [];
    const params = [id];
    let idx = 2;

    if (status !== undefined) { fields.push(`status = $${idx++}`); params.push(status); }
    if (pnr_code !== undefined) { fields.push(`pnr_code = $${idx++}`); params.push(pnr_code ? pnr_code.toUpperCase() : null); }
    if (admin_notes !== undefined) { fields.push(`admin_notes = $${idx++}`); params.push(admin_notes); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
    }

    const query = `UPDATE reservations SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const { rows } = await db.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    res.json({ success: true, reservation: rows[0] });
  } catch (error) {
    console.error("[Admin Update Booking Error]:", error);
    res.status(500).json({ error: 'Error al actualizar la reserva.' });
  }
});

module.exports = router;
