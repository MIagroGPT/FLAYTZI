-- ═══════════════════════════════════════════════
-- FLYTZI 2.0 — Esquema Inicial de Base de Datos
-- ═══════════════════════════════════════════════

-- 1. Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA: routes (Rutas que escanea Playwright)
CREATE TABLE routes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  origin        VARCHAR(3) NOT NULL,        -- IATA: MIA
  destination   VARCHAR(3) NOT NULL,        -- IATA: MAD
  active        BOOLEAN DEFAULT true,
  priority      INTEGER DEFAULT 5,          -- 1=máxima, 10=mínima
  scan_interval INTEGER DEFAULT 6,          -- horas entre escaneos
  last_scanned  TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(origin, destination)
);

-- 3. TABLA: award_inventory (Inventario validado de millas)
CREATE TABLE award_inventory (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  origin            VARCHAR(3) NOT NULL,
  destination       VARCHAR(3) NOT NULL,
  departure_date    DATE NOT NULL,
  return_date       DATE,
  cabin             VARCHAR(20) NOT NULL,   -- economy, business, first
  airline           VARCHAR(100) NOT NULL,  -- Iberia, British Airways, etc.
  airline_code      VARCHAR(5) NOT NULL,    -- IB, BA, AA, AS
  flight_number     VARCHAR(20),            -- IB6251
  stops             INTEGER DEFAULT 0,
  duration_minutes  INTEGER,
  miles_required    INTEGER NOT NULL,       -- 25000
  taxes_usd         NUMERIC(10,2),          -- 87.50
  price_to_customer NUMERIC(10,2) NOT NULL, -- Precio Flytzi en USD
  price_market      NUMERIC(10,2),          -- Precio de mercado de referencia
  seats_available   INTEGER DEFAULT 1,
  source_url        TEXT,
  status            VARCHAR(20) DEFAULT 'available', -- available, reserved, expired, stale
  last_checked      TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,                     -- Cambiado a columna normal para evitar error de inmutabilidad
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(origin, destination, departure_date, cabin, flight_number)
);

-- 4. TABLA: reservations (Solicitudes de reserva)
CREATE TABLE reservations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id        UUID REFERENCES award_inventory(id),
  passenger_name      VARCHAR(200) NOT NULL,
  passenger_email     VARCHAR(200) NOT NULL,
  passenger_phone     VARCHAR(50),
  passport_number     VARCHAR(50),
  passport_country    VARCHAR(100),

  passport_expiry     DATE,
  date_of_birth       DATE,
  origin              VARCHAR(3) NOT NULL,
  destination         VARCHAR(3) NOT NULL,
  departure_date      DATE NOT NULL,
  return_date         DATE,
  cabin               VARCHAR(20),
  passengers          INTEGER DEFAULT 1,
  price_quoted        NUMERIC(10,2) NOT NULL,
  currency            VARCHAR(3) DEFAULT 'USD',
  status              VARCHAR(30) DEFAULT 'pending_validation',
  stripe_payment_intent_id  VARCHAR(200),
  stripe_session_id         VARCHAR(200),
  stripe_payment_url        TEXT,
  payment_confirmed_at      TIMESTAMPTZ,
  pnr_code            VARCHAR(20),
  issued_at           TIMESTAMPTZ,
  issued_by           VARCHAR(100),
  whatsapp_sent       BOOLEAN DEFAULT false,
  email_sent          BOOLEAN DEFAULT false,
  admin_notes         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA: scan_logs (Registro de escaneos)
CREATE TABLE scan_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id        UUID REFERENCES routes(id),
  origin          VARCHAR(3),
  destination     VARCHAR(3),
  scan_date       DATE,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  results_found   INTEGER DEFAULT 0,
  results_updated INTEGER DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'running',
  error_message   TEXT,
  playwright_ms   INTEGER
);

-- 6. TABLA: search_logs (Búsquedas de usuarios)
CREATE TABLE search_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  origin        VARCHAR(3),
  destination   VARCHAR(3),
  departure_date DATE,
  return_date   DATE,
  cabin         VARCHAR(20),
  passengers    INTEGER,
  results_count INTEGER DEFAULT 0,
  user_ip       VARCHAR(50),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ÍNDICES DE RENDIMIENTO
CREATE INDEX idx_inventory_route_date ON award_inventory(origin, destination, departure_date);
CREATE INDEX idx_inventory_status ON award_inventory(status);
CREATE INDEX idx_inventory_expires ON award_inventory(expires_at);
CREATE INDEX idx_reservations_email ON reservations(passenger_email);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_scan_logs_route ON scan_logs(route_id, scan_date);

-- 8. FUNCIÓN Y TRIGGERS PARA AUTO-ACTUALIZAR updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_routes_updated
  BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_inventory_updated
  BEFORE UPDATE ON award_inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_reservations_updated
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 9. TRIGGER PARA CALCULAR AUTOMÁTICAMENTE expires_at (6 horas después de last_checked)
CREATE OR REPLACE FUNCTION calculate_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.expires_at = COALESCE(NEW.last_checked, NOW()) + INTERVAL '6 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_expires
  BEFORE INSERT OR UPDATE ON award_inventory
  FOR EACH ROW EXECUTE FUNCTION calculate_expires_at();

-- 10. CARGAR RUTAS INICIALES PRIORITARIAS
INSERT INTO routes (origin, destination, priority, active) VALUES
  ('MIA', 'MAD', 1, true),
  ('JFK', 'MAD', 1, true),
  ('LAX', 'LHR', 1, true),
  ('MIA', 'LHR', 2, true),
  ('JFK', 'CDG', 2, true),
  ('LAX', 'CDG', 2, true),
  ('MIA', 'FCO', 2, true),
  ('JFK', 'FCO', 2, true),
  ('MAD', 'MIA', 1, true),
  ('MAD', 'JFK', 1, true),
  ('LHR', 'LAX', 1, true),
  ('CDG', 'JFK', 2, true),
  ('LAX', 'JFK', 3, true),
  ('SEA', 'LAX', 3, true),
  ('SEA', 'JFK', 3, true),
  ('MAD', 'FCO', 3, true),
  ('LHR', 'CDG', 3, true),
  ('MAD', 'LHR', 3, true)
ON CONFLICT (origin, destination) DO NOTHING;
