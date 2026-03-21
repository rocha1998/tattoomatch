const fs = require("fs/promises");
const path = require("path");

const pool = require("../config/db");
const { getTatuadorIdByUsuarioId } = require("../helpers/tatuador");
const { imageMimeTypes, uploadsDir, videoMimeTypes } = require("../config/upload");

async function getPlanoPortfolio(usuarioId, tatuadorId) {
  const planoResult = await pool.query(
    `SELECT p.photo_limit, p.video_limit, p.name
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.tatuador_id = $1
     LIMIT 1`,
    [tatuadorId]
  );

  if (planoResult.rows.length === 0) {
    return null;
  }

  const countResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(tipo, 'foto') = 'foto') AS fotos,
       COUNT(*) FILTER (WHERE COALESCE(tipo, 'foto') = 'video') AS videos
     FROM tatuagens
     WHERE usuario_id = $1`,
    [usuarioId]
  );

  return {
    plano: planoResult.rows[0].name,
    limiteFotos: planoResult.rows[0].photo_limit === null ? null : Number(planoResult.rows[0].photo_limit),
    limiteVideos: planoResult.rows[0].video_limit === null ? null : Number(planoResult.rows[0].video_limit),
    totalFotos: Number(countResult.rows[0].fotos || 0),
    totalVideos: Number(countResult.rows[0].videos || 0),
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function getUploadedPortfolioFile(req) {
  if (req.file) {
    return req.file;
  }

  if (req.files?.arquivo?.[0]) {
    return req.files.arquivo[0];
  }

  if (req.files?.imagem?.[0]) {
    return req.files.imagem[0];
  }

  return null;
}

function getPortfolioTipo(file) {
  if (!file) {
    return null;
  }

  if (imageMimeTypes.has(file.mimetype)) {
    return "foto";
  }

  if (videoMimeTypes.has(file.mimetype)) {
    return "video";
  }

  return null;
}

async function removerUploadSeExistir(filename) {
  if (!filename) {
    return;
  }

  const filePath = path.join(uploadsDir, filename);
  await fs.unlink(filePath).catch(() => {});
}

async function criarTatuagem(req, res) {
  const descricao = normalizeText(req.body.descricao);
  const estilo = normalizeText(req.body.estilo);
  const usuarioId = req.usuario.id;
  const arquivo = getUploadedPortfolioFile(req);
  const tipo = getPortfolioTipo(arquivo);

  if (!arquivo || !tipo) {
    return res.status(400).json({ mensagem: "Arquivo de portfolio obrigatorio" });
  }

  if (descricao.length < 3) {
    await removerUploadSeExistir(arquivo.filename);
    return res.status(400).json({ mensagem: "Descricao precisa ter pelo menos 3 caracteres" });
  }

  if (estilo.length < 2) {
    await removerUploadSeExistir(arquivo.filename);
    return res.status(400).json({ mensagem: "Estilo precisa ter pelo menos 2 caracteres" });
  }

  try {
    const tatuadorId = await getTatuadorIdByUsuarioId(usuarioId);

    if (!tatuadorId) {
      await removerUploadSeExistir(arquivo.filename);
      return res.status(403).json({ mensagem: "Voce nao e tatuador" });
    }

    const portfolio = await getPlanoPortfolio(usuarioId, tatuadorId);

    if (!portfolio) {
      await removerUploadSeExistir(arquivo.filename);
      return res.status(404).json({ mensagem: "Plano nao encontrado" });
    }

    if (tipo === "foto" && portfolio.limiteFotos !== null && portfolio.totalFotos >= portfolio.limiteFotos) {
      await removerUploadSeExistir(arquivo.filename);
      return res.status(403).json({
        mensagem: `Seu plano ${portfolio.plano} permite ${portfolio.limiteFotos} foto(s). Remova uma foto ou faca upgrade para continuar.`,
      });
    }

    if (tipo === "video" && portfolio.limiteVideos !== null && portfolio.totalVideos >= portfolio.limiteVideos) {
      await removerUploadSeExistir(arquivo.filename);
      return res.status(403).json({
        mensagem: `Seu plano ${portfolio.plano} permite ${portfolio.limiteVideos} video(s). Remova um video ou faca upgrade para continuar.`,
      });
    }

    const result = await pool.query(
      `INSERT INTO tatuagens (usuario_id, imagem, descricao, estilo, tipo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [usuarioId, arquivo.filename, descricao, estilo, tipo]
    );

    res.status(201).json({
      mensagem: tipo === "video" ? "Video adicionado ao portfolio" : "Foto adicionada ao portfolio",
      tatuagem: result.rows[0],
    });
  } catch (error) {
    await removerUploadSeExistir(arquivo.filename);
    console.error(error);
    res.status(500).json({ mensagem: "Erro ao criar item do portfolio" });
  }
}

async function deletarTatuagem(req, res) {
  const { id } = req.params;
  const usuarioId = req.usuario.id;

  try {
    const result = await pool.query(
      "SELECT * FROM tatuagens WHERE id = $1 AND usuario_id = $2",
      [id, usuarioId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ mensagem: "Voce nao pode excluir esse item do portfolio" });
    }

    await pool.query("DELETE FROM tatuagens WHERE id = $1", [id]);
    await removerUploadSeExistir(result.rows[0].imagem);

    res.json({ mensagem: "Item do portfolio excluido com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensagem: "Erro ao excluir item do portfolio" });
  }
}

module.exports = { criarTatuagem, deletarTatuagem };
