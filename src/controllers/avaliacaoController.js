const pool = require("../config/db");

async function avaliarTatuador(req, res) {
  const { usuario } = req.params;
  const autorId = req.usuario.id;
  const nota = Number(req.body.nota);
  const comentario = String(req.body.comentario ?? "").trim();

  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return res.status(400).json({ mensagem: "Nota obrigatoria entre 1 e 5" });
  }

  if (comentario.length > 1000) {
    return res.status(400).json({ mensagem: "Comentario pode ter no maximo 1000 caracteres" });
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
      return res.status(404).json({ mensagem: "Tatuador nao encontrado" });
    }

    const { usuario_id, tatuador_id } = userResult.rows[0];

    if (autorId === usuario_id) {
      return res.status(400).json({ mensagem: "Voce nao pode avaliar o proprio perfil" });
    }

    await pool.query(
      `INSERT INTO avaliacoes (usuario_id, tatuador_id, nota, comentario)
       VALUES ($1, $2, $3, $4)`,
      [autorId, tatuador_id, nota, comentario || null]
    );

    res.status(201).json({ mensagem: "Avaliacao enviada com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensagem: "Erro ao avaliar" });
  }
}

module.exports = { avaliarTatuador };
