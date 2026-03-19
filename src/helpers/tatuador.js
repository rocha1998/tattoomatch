const pool = require("../config/db");

async function getTatuadorIdByUsuarioId(usuarioId) {
  const result = await pool.query(
    "SELECT id FROM tatuadores WHERE usuario_id = $1",
    [usuarioId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].id;
}

module.exports = { getTatuadorIdByUsuarioId };
