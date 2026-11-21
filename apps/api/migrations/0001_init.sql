-- CampusPulse 360 - esquema inicial D1 (SQLite)
-- Tiempos en epoch ms UTC. Toda telemetria actual es SIMULADA (columna source).

CREATE TABLE buildings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  geometry_provisional INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE floors (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id),
  level INTEGER NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (building_id, level)
);

CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  floor_id TEXT NOT NULL REFERENCES floors(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('classroom','lab','library','auditorium','lobby','office')),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  mesh_id TEXT NOT NULL UNIQUE
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  gateway_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_seen INTEGER
);
CREATE INDEX idx_devices_space ON devices(space_id);

-- Tabla ancha: una fila por dispositivo y lectura (5 variables).
CREATE TABLE readings (
  device_id TEXT NOT NULL REFERENCES devices(id),
  ts INTEGER NOT NULL,
  co2_ppm REAL NOT NULL,
  temp_c REAL NOT NULL,
  rh_pct REAL NOT NULL,
  occupancy INTEGER NOT NULL,
  power_w REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('sim','sim-scenario','device')),
  PRIMARY KEY (device_id, ts)
) WITHOUT ROWID;

CREATE TABLE readings_5m (
  device_id TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  co2_avg REAL, co2_max REAL,
  temp_avg REAL, rh_avg REAL,
  occ_avg REAL, occ_max INTEGER,
  power_avg REAL,
  n INTEGER NOT NULL,
  PRIMARY KEY (device_id, bucket)
) WITHOUT ROWID;

CREATE TABLE alert_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('co2_ppm','temp_c','rh_pct','occupancy','power_w','occupancy_ratio')),
  op TEXT NOT NULL CHECK (op IN ('>','>=','<','<=')),
  threshold REAL NOT NULL,
  sustain_s INTEGER NOT NULL DEFAULT 0,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE incidents (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  rule_id TEXT REFERENCES alert_rules(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_ai','open','acknowledged','resolved')),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  -- Clave de deduplicacion: una incidencia activa por (espacio, regla).
  dedup_key TEXT NOT NULL,
  ai_output_id TEXT
);
CREATE INDEX idx_incidents_status ON incidents(status, opened_at DESC);
CREATE UNIQUE INDEX idx_incidents_active_dedup
  ON incidents(dedup_key) WHERE status IN ('pending_ai','open','acknowledged');

CREATE TABLE incident_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX idx_incident_events_incident ON incident_events(incident_id, ts);

CREATE TABLE ai_outputs (
  id TEXT PRIMARY KEY,
  incident_id TEXT,
  prompt_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('live','fallback')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  valid_json INTEGER NOT NULL,
  output_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE ai_quota (
  day TEXT PRIMARY KEY,           -- YYYY-MM-DD (UTC)
  calls INTEGER NOT NULL DEFAULT 0,
  est_neurons REAL NOT NULL DEFAULT 0
);

CREATE TABLE bot_runs (
  id TEXT PRIMARY KEY,
  bot TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running','success','partial','failed')),
  summary TEXT NOT NULL DEFAULT '',
  log TEXT
);
CREATE INDEX idx_bot_runs_started ON bot_runs(started_at DESC);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  content_json TEXT NOT NULL
);

-- Autenticacion: passkeys (WebAuthn). Sin contrasenas ni registro publico.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','operator')),
  created_at INTEGER NOT NULL
);

CREATE TABLE passkeys (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at INTEGER NOT NULL
);

-- Tokens de arranque de un solo uso (se guarda solo el hash SHA-256).
CREATE TABLE bootstrap_tokens (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','operator')),
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

-- Sesiones: se guarda el hash del identificador de sesion.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
CREATE INDEX idx_audit_ts ON audit_log(ts DESC);

-- Limite de frecuencia de respaldo (si el binding nativo no esta disponible).
CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
) WITHOUT ROWID;
