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
