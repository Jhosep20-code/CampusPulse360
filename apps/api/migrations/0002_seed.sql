-- Catalogo PROVISIONAL del campus. Pisos, espacios y aforos son supuestos del
-- prototipo, NO datos oficiales de la UTP Huancayo. Se sustituiran cuando haya
-- referencias verificables (docs/referencias/especificacion-3d.md).

INSERT INTO buildings (id, name, geometry_provisional) VALUES
  ('BLD_UTP_HYO', 'UTP Huancayo - Edificio principal (modelo representativo)', 1);

INSERT INTO floors (id, building_id, level, name) VALUES
  ('FLR_1', 'BLD_UTP_HYO', 1, 'Piso 1'),
  ('FLR_2', 'BLD_UTP_HYO', 2, 'Piso 2'),
  ('FLR_3', 'BLD_UTP_HYO', 3, 'Piso 3'),
  ('FLR_4', 'BLD_UTP_HYO', 4, 'Piso 4'),
  ('FLR_5', 'BLD_UTP_HYO', 5, 'Piso 5');

INSERT INTO spaces (id, floor_id, code, name, type, capacity, mesh_id) VALUES
  ('SPC_1_LOBBY', 'FLR_1', 'LOBBY', 'Hall de ingreso',        'lobby',      120, 'SPC_1_LOBBY'),
  ('SPC_1_BIB',   'FLR_1', 'BIB',   'Biblioteca',             'library',     80, 'SPC_1_BIB'),
  ('SPC_2_A201',  'FLR_2', 'A201',  'Aula A201',              'classroom',   40, 'SPC_2_A201'),
  ('SPC_2_A202',  'FLR_2', 'A202',  'Aula A202',              'classroom',   40, 'SPC_2_A202'),
  ('SPC_3_A301',  'FLR_3', 'A301',  'Aula A301',              'classroom',   45, 'SPC_3_A301'),
  ('SPC_3_LAB1',  'FLR_3', 'LAB1',  'Laboratorio de computo', 'lab',         30, 'SPC_3_LAB1'),
  ('SPC_4_A401',  'FLR_4', 'A401',  'Aula A401',              'classroom',   45, 'SPC_4_A401'),
  ('SPC_4_LAB2',  'FLR_4', 'LAB2',  'Laboratorio de IoT',     'lab',         25, 'SPC_4_LAB2'),
  ('SPC_5_AUD',   'FLR_5', 'AUD',   'Auditorio',              'auditorium', 150, 'SPC_5_AUD'),
  ('SPC_5_OFI',   'FLR_5', 'OFI',   'Oficinas administrativas','office',     20, 'SPC_5_OFI');

INSERT INTO devices (id, space_id, gateway_id) VALUES
  ('DEV_1_LOBBY', 'SPC_1_LOBBY', 'gw-sim-01'),
  ('DEV_1_BIB',   'SPC_1_BIB',   'gw-sim-01'),
  ('DEV_2_A201',  'SPC_2_A201',  'gw-sim-01'),
  ('DEV_2_A202',  'SPC_2_A202',  'gw-sim-01'),
  ('DEV_3_A301',  'SPC_3_A301',  'gw-sim-01'),
  ('DEV_3_LAB1',  'SPC_3_LAB1',  'gw-sim-01'),
  ('DEV_4_A401',  'SPC_4_A401',  'gw-sim-01'),
  ('DEV_4_LAB2',  'SPC_4_LAB2',  'gw-sim-01'),
  ('DEV_5_AUD',   'SPC_5_AUD',   'gw-sim-01'),
  ('DEV_5_OFI',   'SPC_5_OFI',   'gw-sim-01');

-- Reglas de incidencias (parametros del prototipo).
INSERT INTO alert_rules (id, name, metric, op, threshold, sustain_s, severity, enabled) VALUES
  ('RULE_CO2_HIGH',  'CO2 elevado sostenido',     'co2_ppm',         '>=', 1200, 120, 'warning',  1),
  ('RULE_CO2_CRIT',  'CO2 critico',               'co2_ppm',         '>=', 1500,  60, 'critical', 1),
  ('RULE_TEMP_HIGH', 'Temperatura alta sostenida','temp_c',          '>=',   28, 180, 'warning',  1),
  ('RULE_OVERCAP',   'Sobreaforo',                'occupancy_ratio', '>=',  1.0,  60, 'critical', 1);
