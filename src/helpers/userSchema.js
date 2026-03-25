const pool = require("../config/db");
const { tableExists } = require("./schemaUtils");

let schemaReadyPromise = null;

async function createUserSchemaExtensions() {
  const usuariosExists = await tableExists("usuarios");

  if (!usuariosExists) {
    console.warn(
      "Tabela public.usuarios ainda nao existe. Extensoes de usuarios e password_reset_tokens foram puladas no startup."
    );
    return;
  }

  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false
  `);

  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false
  `);

  await pool.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx
    ON password_reset_tokens (token_hash)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS password_reset_tokens_usuario_id_idx
    ON password_reset_tokens (usuario_id)
  `);
}

function ensureUserSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = createUserSchemaExtensions().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
}

module.exports = { ensureUserSchema };
