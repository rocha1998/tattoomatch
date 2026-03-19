BEGIN;

ALTER TABLE tatuadores
  ADD COLUMN IF NOT EXISTS bairro VARCHAR(255),
  ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255),
  ADD COLUMN IF NOT EXISTS numero VARCHAR(50),
  ADD COLUMN IF NOT EXISTS complemento VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cep VARCHAR(20);

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS imagem_referencia VARCHAR(255);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx
  ON password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS password_reset_tokens_usuario_id_idx
  ON password_reset_tokens (usuario_id);

COMMIT;
