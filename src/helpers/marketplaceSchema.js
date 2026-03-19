const pool = require("../config/db");
const { generateSlug } = require("./strings");

async function buildUniqueSlug({ nomeArtistico, cidade, tatuadorId }) {
  const baseSlug = generateSlug(nomeArtistico, cidade);
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await pool.query(
      `SELECT id
       FROM tatuadores
       WHERE slug = $1
         AND id <> $2
       LIMIT 1`,
      [slug, tatuadorId]
    );

    if (existing.rows.length === 0) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function ensureMarketplaceSchema() {
  await pool.query(`
    ALTER TABLE tatuadores
      ADD COLUMN IF NOT EXISTS disponivel BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS highlight_until TIMESTAMP,
      ADD COLUMN IF NOT EXISTS bairro VARCHAR(255),
      ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255),
      ADD COLUMN IF NOT EXISTS numero VARCHAR(50),
      ADD COLUMN IF NOT EXISTS complemento VARCHAR(255),
      ADD COLUMN IF NOT EXISTS cep VARCHAR(20),
      ADD COLUMN IF NOT EXISTS slug VARCHAR(255)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tatuadores_slug
    ON tatuadores (slug)
    WHERE slug IS NOT NULL AND slug <> ''
  `);

  await pool.query(`
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
    )
  `);

  await pool.query(`
    ALTER TABLE payment_sessions
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_sessions_usuario
    ON payment_sessions (usuario_id, created_at DESC)
  `);

  await pool.query(`
    UPDATE payment_sessions
    SET user_id = usuario_id
    WHERE user_id IS NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_sessions_tatuador
    ON payment_sessions (tatuador_id, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_sessions_status
    ON payment_sessions (status, provider)
  `);

  await pool.query(`
    ALTER TABLE agendamentos
      ADD COLUMN IF NOT EXISTS imagem_referencia VARCHAR(255)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agendamento_mensagens (
      id SERIAL PRIMARY KEY,
      agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
      remetente_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      remetente_tipo VARCHAR(20) NOT NULL,
      mensagem TEXT NOT NULL,
      lida_em TIMESTAMP,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_agendamento_mensagens_agendamento
    ON agendamento_mensagens (agendamento_id, criado_em)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_agendamento_mensagens_lida
    ON agendamento_mensagens (agendamento_id, remetente_tipo, lida_em)
  `);

  await pool.query(`
    ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ativa',
      ADD COLUMN IF NOT EXISTS patrocinado BOOLEAN NOT NULL DEFAULT false
  `);

  await pool.query(`
    ALTER TABLE plans
      ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS photo_limit INTEGER,
      ADD COLUMN IF NOT EXISTS video_limit INTEGER
  `);

  await pool.query(`
    ALTER TABLE tatuagens
      ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'foto'
  `);

  await pool.query(`
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
      photo_limit = CASE id
        WHEN 1 THEN 7
        WHEN 2 THEN 20
        WHEN 3 THEN NULL
        ELSE photo_limit
      END,
      video_limit = CASE id
        WHEN 1 THEN 1
        WHEN 2 THEN 7
        WHEN 3 THEN NULL
        ELSE video_limit
      END,
      price = CASE id
        WHEN 1 THEN 0
        WHEN 2 THEN 39.90
        WHEN 3 THEN 79.90
        ELSE price
      END
    WHERE id IN (1, 2, 3)
  `);

  await pool.query(`
    UPDATE tatuagens
    SET tipo = 'foto'
    WHERE tipo IS NULL OR tipo = ''
  `);

  const tatuadoresSemSlug = await pool.query(`
    SELECT id, nome_artistico, cidade
    FROM tatuadores
    WHERE slug IS NULL OR slug = ''
    ORDER BY id ASC
  `);

  for (const tatuador of tatuadoresSemSlug.rows) {
    const slug = await buildUniqueSlug({
      nomeArtistico: tatuador.nome_artistico || `tatuador-${tatuador.id}`,
      cidade: tatuador.cidade,
      tatuadorId: tatuador.id,
    });

    await pool.query(
      `UPDATE tatuadores
       SET slug = $1
       WHERE id = $2`,
      [slug, tatuador.id]
    );
  }
}

module.exports = { ensureMarketplaceSchema };
