const bcrypt = require("bcrypt");

const pool = require("../config/db");

async function getPerfil(req, res) {
  const { id, usuario, email, tipo, is_admin, is_blocked } = req.usuario;
  res.json({
    id,
    usuario,
    email,
    tipo,
    is_admin: is_admin === true,
    is_blocked: is_blocked === true,
  });
}

async function updatePerfil(req, res) {
  const { usuario, senha } = req.body;
  const id = req.usuario.id;

  if (!usuario && !senha) {
    return res.status(400).json({ mensagem: "Nada para atualizar" });
  }

  try {
    let senhaCriptografada = null;

    if (senha) {
      senhaCriptografada = await bcrypt.hash(senha, 10);
    }

    await pool.query(
      `UPDATE usuarios
       SET usuario = COALESCE($1, usuario),
           senha = COALESCE($2, senha)
       WHERE id = $3`,
      [usuario, senhaCriptografada, id]
    );

    res.json({ mensagem: "Perfil atualizado com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensagem: "Erro ao atualizar perfil" });
  }
}

async function deletePerfil(req, res) {
  const id = req.usuario.id;

  try {
    await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
    res.json({ mensagem: "Usuario deletado com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensagem: "Erro ao deletar usuario" });
  }
}

module.exports = { getPerfil, updatePerfil, deletePerfil };
