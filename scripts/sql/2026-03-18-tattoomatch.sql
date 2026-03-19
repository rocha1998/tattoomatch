-- Inconsistencias identificadas antes da alteracao:
-- 1. O projeto nao possui sistema de migracoes versionadas.
-- 2. O codigo atual usa plans/subscriptions, mas nao garante status de assinatura.
-- 3. A busca publica nao tinha suporte nativo a disponibilidade, coordenadas ou destaque por periodo.

BEGIN;

ALTER TABLE tatuadores
  ADD COLUMN IF NOT EXISTS disponivel BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS highlight_until TIMESTAMP;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ativa',
  ADD COLUMN IF NOT EXISTS patrocinado BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) NOT NULL DEFAULT 0;

UPDATE plans
SET
  name = CASE id
    WHEN 1 THEN 'Free'
    WHEN 2 THEN 'Pro'
    WHEN 3 THEN 'Premium'
    ELSE name
  END,
  portfolio_limit = CASE id
    WHEN 1 THEN 12
    WHEN 2 THEN 60
    WHEN 3 THEN 200
    ELSE portfolio_limit
  END,
  price = CASE id
    WHEN 1 THEN 0
    WHEN 2 THEN 39.90
    WHEN 3 THEN 79.90
    ELSE price
  END
WHERE id IN (1, 2, 3);

COMMIT;
