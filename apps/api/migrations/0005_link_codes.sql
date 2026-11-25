-- Codigos de un solo uso para vincular una passkey de OTRO dispositivo a una cuenta existente
-- (p. ej. la passkey de Windows Hello no se sincroniza con Android). Se guarda solo el hash.
CREATE TABLE link_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_link_codes_user ON link_codes(user_id);
