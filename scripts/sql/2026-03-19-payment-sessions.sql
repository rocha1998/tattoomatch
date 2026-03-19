CREATE TABLE IF NOT EXISTS payment_sessions (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  tatuador_id INTEGER NOT NULL REFERENCES tatuadores(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL,
  payment_kind VARCHAR(30) NOT NULL,
  plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  mode VARCHAR(20) NOT NULL DEFAULT 'test',
  external_reference VARCHAR(255),
  external_id VARCHAR(255),
  checkout_url TEXT,
  metadata_json TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payment_sessions
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_payment_sessions_usuario
ON payment_sessions (usuario_id, created_at DESC);

UPDATE payment_sessions
SET user_id = usuario_id
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_sessions_tatuador
ON payment_sessions (tatuador_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_status
ON payment_sessions (status, provider);
