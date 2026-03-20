BEGIN;

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  usuario VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email_lower
ON usuarios (LOWER(email));

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  portfolio_limit INTEGER NOT NULL,
  photo_limit INTEGER,
  video_limit INTEGER,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 1
);

INSERT INTO plans (id, name, portfolio_limit, photo_limit, video_limit, price, priority)
VALUES
  (1, 'Free', 12, 7, 1, 0, 1),
  (2, 'Pro', 60, 20, 7, 39.90, 2),
  (3, 'Premium', 200, NULL, NULL, 79.90, 3)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  portfolio_limit = EXCLUDED.portfolio_limit,
  photo_limit = EXCLUDED.photo_limit,
  video_limit = EXCLUDED.video_limit,
  price = EXCLUDED.price,
  priority = EXCLUDED.priority;

CREATE TABLE IF NOT EXISTS tatuadores (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  nome_artistico VARCHAR(255),
  bio TEXT,
  estado VARCHAR(120),
  cidade VARCHAR(120),
  municipio VARCHAR(120),
  bairro VARCHAR(255),
  logradouro VARCHAR(255),
  numero VARCHAR(50),
  complemento VARCHAR(255),
  cep VARCHAR(20),
  estilos TEXT,
  foto_perfil VARCHAR(255),
  whatsapp VARCHAR(30),
  disponivel BOOLEAN NOT NULL DEFAULT true,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  highlight_until TIMESTAMP,
  slug VARCHAR(255)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tatuadores_slug
ON tatuadores (slug)
WHERE slug IS NOT NULL AND slug <> '';

CREATE INDEX IF NOT EXISTS idx_tatuadores_cidade
ON tatuadores (cidade);

CREATE INDEX IF NOT EXISTS idx_tatuadores_disponivel
ON tatuadores (disponivel);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  tatuador_id INTEGER NOT NULL UNIQUE REFERENCES tatuadores(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'ativa',
  patrocinado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan
ON subscriptions (plan_id);

CREATE TABLE IF NOT EXISTS tatuagens (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  imagem VARCHAR(255) NOT NULL,
  descricao TEXT NOT NULL,
  estilo VARCHAR(255) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'foto',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tatuagens_usuario_created
ON tatuagens (usuario_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agendamentos (
  id SERIAL PRIMARY KEY,
  cliente_nome VARCHAR(255) NOT NULL,
  cliente_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_whatsapp VARCHAR(20) NOT NULL,
  descricao TEXT NOT NULL,
  parte_corpo VARCHAR(255) NOT NULL,
  tamanho VARCHAR(255) NOT NULL,
  data_solicitada DATE NOT NULL,
  data_sugerida DATE,
  tatuador_id INTEGER NOT NULL REFERENCES tatuadores(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  visualizado BOOLEAN NOT NULL DEFAULT false,
  imagem_referencia VARCHAR(255),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_tatuador_criado
ON agendamentos (tatuador_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_criado
ON agendamentos (cliente_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS avaliacoes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tatuador_id INTEGER NOT NULL REFERENCES tatuadores(id) ON DELETE CASCADE,
  nota INTEGER NOT NULL,
  comentario TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_tatuador_created
ON avaliacoes (tatuador_id, created_at DESC);

CREATE TABLE IF NOT EXISTS perfil_views (
  id SERIAL PRIMARY KEY,
  tatuador_id INTEGER NOT NULL REFERENCES tatuadores(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_perfil_views_tatuador
ON perfil_views (tatuador_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx
ON password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS password_reset_tokens_usuario_id_idx
ON password_reset_tokens (usuario_id);

CREATE TABLE IF NOT EXISTS analytics_eventos (
  id SERIAL PRIMARY KEY,
  tipo_evento VARCHAR(100) NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  pagina VARCHAR(255),
  data TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS analytics_eventos_tipo_evento_idx
ON analytics_eventos (tipo_evento);

CREATE INDEX IF NOT EXISTS analytics_eventos_usuario_id_idx
ON analytics_eventos (usuario_id);

CREATE INDEX IF NOT EXISTS analytics_eventos_data_idx
ON analytics_eventos (data DESC);

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

CREATE INDEX IF NOT EXISTS idx_payment_sessions_usuario
ON payment_sessions (usuario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_tatuador
ON payment_sessions (tatuador_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_status
ON payment_sessions (status, provider);

CREATE TABLE IF NOT EXISTS agendamento_mensagens (
  id SERIAL PRIMARY KEY,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  remetente_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  remetente_tipo VARCHAR(20) NOT NULL,
  mensagem TEXT NOT NULL,
  lida_em TIMESTAMP,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agendamento_mensagens_agendamento
ON agendamento_mensagens (agendamento_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_agendamento_mensagens_lida
ON agendamento_mensagens (agendamento_id, remetente_tipo, lida_em);

COMMIT;
