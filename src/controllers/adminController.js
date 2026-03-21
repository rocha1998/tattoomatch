const fs = require("fs/promises");
const path = require("path");

const { obterResumoAnalytics } = require("../helpers/analytics");
const pool = require("../config/db");
const { uploadsDir } = require("../config/upload");

async function getDashboard(req, res) {
  try {
    const [usuarios, tatuadores, agendamentos, avaliacoes] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM usuarios"),
      pool.query("SELECT COUNT(*) AS total FROM tatuadores"),
      pool.query("SELECT COUNT(*) AS total FROM agendamentos"),
      pool.query("SELECT COUNT(*) AS total FROM avaliacoes"),
    ]);

    res.json({
      totalUsuarios: Number(usuarios.rows[0]?.total || 0),
      totalTatuadores: Number(tatuadores.rows[0]?.total || 0),
      totalAgendamentos: Number(agendamentos.rows[0]?.total || 0),
      totalAvaliacoes: Number(avaliacoes.rows[0]?.total || 0),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao carregar dashboard administrativo" });
  }
}

async function getAnalytics(req, res) {
  try {
    const resumo = await obterResumoAnalytics();
    res.json(resumo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao carregar analytics" });
  }
}

async function listarUsuarios(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.usuario,
        u.email,
        u.is_admin,
        u.is_blocked,
        CASE WHEN t.id IS NULL THEN 'cliente' ELSE 'tatuador' END AS tipo
      FROM usuarios u
      LEFT JOIN tatuadores t ON t.usuario_id = u.id
      ORDER BY u.is_admin DESC, u.usuario ASC
    `);

    res.json(
      result.rows.map((item) => ({
        id: Number(item.id),
        usuario: item.usuario,
        email: item.email,
        is_admin: item.is_admin === true,
        is_blocked: item.is_blocked === true,
        tipo: item.tipo,
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao listar usuarios" });
  }
}

async function atualizarAdminUsuario(req, res) {
  const usuarioAlvoId = Number(req.params.id);
  const { is_admin } = req.body;

  if (!Number.isInteger(usuarioAlvoId) || usuarioAlvoId <= 0) {
    return res.status(400).json({ erro: "Usuario invalido" });
  }

  if (typeof is_admin !== "boolean") {
    return res.status(400).json({ erro: "Campo is_admin precisa ser booleano" });
  }

  if (req.usuario.id === usuarioAlvoId && is_admin === false) {
    return res.status(400).json({ erro: "Voce nao pode remover seu proprio acesso de administrador" });
  }

  try {
    const result = await pool.query(
      `UPDATE usuarios
       SET is_admin = $1
       WHERE id = $2
       RETURNING id, usuario, email, is_admin`,
      [is_admin, usuarioAlvoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: "Usuario nao encontrado" });
    }

    res.json({
      mensagem: is_admin
        ? "Usuario promovido a administrador"
        : "Acesso administrativo removido",
      usuario: {
        id: Number(result.rows[0].id),
        usuario: result.rows[0].usuario,
        email: result.rows[0].email,
        is_admin: result.rows[0].is_admin === true,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao atualizar permissao administrativa" });
  }
}

async function bloquearUsuario(req, res) {
  const usuarioAlvoId = Number(req.params.id);

  if (!Number.isInteger(usuarioAlvoId) || usuarioAlvoId <= 0) {
    return res.status(400).json({ erro: "Usuario invalido" });
  }

  if (req.usuario.id === usuarioAlvoId) {
    return res.status(400).json({ erro: "Voce nao pode bloquear sua propria conta" });
  }

  try {
    const result = await pool.query(
      `UPDATE usuarios
       SET is_blocked = true
       WHERE id = $1
       RETURNING id, usuario, email, is_blocked`,
      [usuarioAlvoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: "Usuario nao encontrado" });
    }

    res.json({
      mensagem: "Usuario bloqueado com sucesso",
      usuario: {
        id: Number(result.rows[0].id),
        usuario: result.rows[0].usuario,
        email: result.rows[0].email,
        is_blocked: result.rows[0].is_blocked === true,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao bloquear usuario" });
  }
}

async function removerAvaliacao(req, res) {
  const avaliacaoId = Number(req.params.id);

  if (!Number.isInteger(avaliacaoId) || avaliacaoId <= 0) {
    return res.status(400).json({ erro: "Avaliacao invalida" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM avaliacoes WHERE id = $1 RETURNING id",
      [avaliacaoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: "Avaliacao nao encontrada" });
    }

    res.json({ mensagem: "Avaliacao removida com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao remover avaliacao" });
  }
}

async function removerPortfolio(req, res) {
  const tatuagemId = Number(req.params.id);

  if (!Number.isInteger(tatuagemId) || tatuagemId <= 0) {
    return res.status(400).json({ erro: "Imagem de portfolio invalida" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM tatuagens WHERE id = $1 RETURNING id, imagem",
      [tatuagemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: "Imagem do portfolio nao encontrada" });
    }

    const imagem = result.rows[0].imagem;
    if (imagem) {
      const imagePath = path.join(uploadsDir, imagem);
      await fs.unlink(imagePath).catch(() => {});
    }

    res.json({ mensagem: "Imagem do portfolio removida com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao remover imagem do portfolio" });
  }
}

module.exports = {
  getAnalytics,
  getDashboard,
  listarUsuarios,
  atualizarAdminUsuario,
  bloquearUsuario,
  removerAvaliacao,
  removerPortfolio,
};
