-- Escenarios de demostracion activos (datos SIMULADOS). Mientras un escenario
-- esta vigente, el bot de incidencias inserta cada minuto una lectura del perfil
-- del escenario (source 'sim-scenario') y la ingesta ignora las lecturas del
-- simulador para ese dispositivo, para que la condicion sea coherente.
CREATE TABLE scenario_overrides (
  device_id TEXT PRIMARY KEY REFERENCES devices(id),
  scenario TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  until INTEGER NOT NULL,
  co2_ppm REAL NOT NULL,
  temp_c REAL NOT NULL,
  rh_pct REAL NOT NULL,
  occupancy INTEGER NOT NULL,
  power_w REAL NOT NULL
);
