const pool = require("../config/db");

async function avaliarTatuador(req, res) {
  const { usuario } = req.params;
  const { nota, comentario } = req.body;

  if (!nota) {
    return res.status(400).json({ mensagem: "Nota obrigatória" });
  }

  try {
    const userResult = await pool.query(
      `SELECT u.id AS usuario_id, t.id AS tatuador_id
       FROM usuarios u
       JOIN tatuadores t ON t.usuario_id = u.id
       WHERE u.usuario = $1`,
      [usuario]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ mensagem: "Tatuador não encontrado" });
    }

    const { usuario_id, tatuador_id } = userResult.rows[0];

    await pool.query(
      `INSERT INTO avaliacoes (usuario_id, tatuador_id, nota, comentario)
       VALUES ($1, $2, $3, $4)`,
      [usuario_id, tatuador_id, nota, comentario]
    );

    res.status(201).json({ mensagem: "Avaliação enviada com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensagem: "Erro ao avaliar" });
  }
}

module.exports = { avaliarTatuador };
