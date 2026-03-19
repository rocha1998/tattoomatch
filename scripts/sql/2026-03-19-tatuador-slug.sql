ALTER TABLE tatuadores
  ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tatuadores_slug
ON tatuadores (slug)
WHERE slug IS NOT NULL AND slug <> '';

-- Observacao:
-- o app faz o backfill e a normalizacao dos slugs existentes no startup,
-- usando a mesma regra de negocio do backend para evitar colisoes.
