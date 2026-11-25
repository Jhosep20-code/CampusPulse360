-- Escenarios de demostracion configurables (datos SIMULADOS):
--  * mode = 'values' mantiene un perfil de lecturas; 'offline' deja de producir lecturas (sin conexion).
--  * reglas de consumo electrico (antes no habia ninguna regla de potencia).
ALTER TABLE scenario_overrides ADD COLUMN mode TEXT NOT NULL DEFAULT 'values';

INSERT OR IGNORE INTO alert_rules (id, name, metric, op, threshold, sustain_s, severity, enabled) VALUES
  ('RULE_POWER_HIGH', 'Consumo electrico elevado', 'power_w', '>=', 4500, 120, 'warning',  1),
  ('RULE_POWER_CRIT', 'Consumo electrico critico', 'power_w', '>=', 6000,  60, 'critical', 1);
