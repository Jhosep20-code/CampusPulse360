-- Coherencia de severidad (datos SIMULADOS): el gemelo marca "critico" desde 30 C (STATUS_THRESHOLDS.temp_c.critical),
-- pero solo existia RULE_TEMP_HIGH (>= 28 C, advertencia). Una temperatura critica abria una incidencia de advertencia.
-- Igual que CO2 y consumo, se anade la regla critica con el mismo umbral que el estado visual. Una regla critica activa
-- suprime la de advertencia de la misma metrica y espacio (incident-bot), asi que se abre UNA incidencia, la critica.
-- Aditiva: no modifica ni borra reglas, incidencias ni lecturas. Reversible con UPDATE alert_rules SET enabled = 0.
INSERT OR IGNORE INTO alert_rules (id, name, metric, op, threshold, sustain_s, severity, enabled) VALUES
  ('RULE_TEMP_CRIT', 'Temperatura critica', 'temp_c', '>=', 30, 60, 'critical', 1);
