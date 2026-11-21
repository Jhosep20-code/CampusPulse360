-- Desafios WebAuthn de corta duracion (registro e inicio de sesion con passkey).
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('register','login')),
  user_id TEXT,
  role TEXT,
  user_name TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_challenges_exp ON auth_challenges(expires_at);
