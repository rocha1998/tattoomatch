const fs = require("fs/promises");
const path = require("path");

const { obterResumoAnalytics } = require("../helpers/analytics");
const pool = require("../config/db");
const { uploadsDir } = require("../config/upload");

const HIGHLIGHT_WEEKLY_PRICE = 25;

function toNumber(value) {
  return Number(value || 0);
}

function toBoolean(value) {
  return value === true;
}

function formatMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function mapUsuario(item) {
  return {
    id: Number(item.id),
    usuario: item.usuario,
    email: item.email,
    is_admin: toBoolean(item.is_admin),
    is_blocked: toBoolean(item.is_blocked),
    tipo: item.tipo,
    created_at: item.created_at,
  };
}

function mapTatuador(item) {
  return {
    id: Number(item.id),
    usuario_id: Number(item.usuario_id),
    slug: item.slug,
    nome_artistico: item.nome_artistico,
    cidade: item.cidade,
    bairro: item.bairro,
    foto_perfil: item.foto_perfil,
    plano: item.plano || "Sem plano",
    premium_ativo: toBoolean(item.premium_ativo),
    patrocinado_ativo: toBoolean(item.patrocinado_ativo),
    disponivel: item.disponivel !== false,
    usuario: item.usuario,
    email: item.email,
    is_blocked: toBoolean(item.is_blocked),
    highlight_until: item.highlight_until,
    status_assinatura: item.status_assinatura || "ativa",
  };
}

function mapAssinatura(item) {
  return {
    subscription_id: Number(item.subscription_id),
    tatuador_id: Number(item.tatuador_id),
    usuario_id: Number(item.usuario_id),
    slug: item.slug,
    nome_artistico: item.nome_artistico,
    usuario: item.usuario,
    email: item.email,
    plano: item.plano || "Sem plano",
    preco: formatMoney(item.preco),
    status_assinatura: item.status_assinatura || "ativa",
    patrocinado: toBoolean(item.patrocinado),
    destaque_ativo: toBoolean(item.destaque_ativo),
    highlight_until: item.highlight_until,
    created_at: item.created_at,
    disponibilidade: item.disponivel !== false,
  };
}

async function ensureSubscriptionByTatuadorId(tatuadorId) {
  const existing = await pool.query(
    `SELECT id
     FROM subscriptions
     WHERE tatuador_id = $1
     LIMIT 1`,
    [tatuadorId]
  );

  if (existing.rows.length > 0) {
    return;
  }

  await pool.query(
    `INSERT INTO subscriptions (tatuador_id, plan_id, status, patrocinado)
     VALUES ($1, 1, 'ativa', false)`,
    [tatuadorId]
  );
}

async function getDashboard(req, res) {
  try {
    const [
      usersResult,
      tattooersResult,
      financialResult,
      blockedResult,
      recentUsersResult,
      recentTattooersResult,
      activeUsersResult,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM usuarios"),
      pool.query("SELECT COUNT(*) AS total FROM tatuadores"),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(s.status, 'ativa') = 'ativa') AS assinaturas_ativas,
          COUNT(*) FILTER (
            WHERE COALESCE(s.status, 'ativa') = 'ativa'
              AND COALESCE(p.priority, 0) >= 3
          ) AS premium_ativos,
          COUNT(*) FILTER (
            WHERE t.highlight_until IS NOT NULL
              AND t.highlight_until > NOW()
          ) AS patrocinados_ativos,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(s.status, 'ativa') = 'ativa' THEN COALESCE(p.price, 0)
              ELSE 0
            END
          ), 0) AS receita_planos
        FROM tatuadores t
        LEFT JOIN subscriptions s ON s.tatuador_id = t.id
        LEFT JOIN plans p ON p.id = s.plan_id
      `),
      pool.query(
        "SELECT COUNT(*) AS total FROM usuarios WHERE COALESCE(is_blocked, false) = true"
      ),
      pool.query(`
        SELECT
          u.id,
          u.usuario,
          u.email,
          u.is_admin,
          u.is_blocked,
          u.created_at,
          CASE WHEN t.id IS NULL THEN 'cliente' ELSE 'tatuador' END AS tipo
        FROM usuarios u
        LEFT JOIN tatuadores t ON t.usuario_id = u.id
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT 8
      `),
      pool.query(`
        SELECT
          t.id,
          t.usuario_id,
          t.slug,
          COALESCE(t.nome_artistico, u.usuario) AS nome_artistico,
          t.cidade,
          COALESCE(t.bairro, t.municipio) AS bairro,
          t.foto_perfil,
          t.disponivel,
          t.highlight_until,
          COALESCE(s.status, 'ativa') AS status_assinatura,
          COALESCE(p.name, 'Free') AS plano,
          CASE
            WHEN COALESCE(s.status, 'ativa') = 'ativa' AND COALESCE(p.priority, 0) >= 3 THEN true
            ELSE false
          END AS premium_ativo,
          CASE
            WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN true
            ELSE false
          END AS patrocinado_ativo,
          u.usuario,
          u.email,
          u.is_blocked
        FROM tatuadores t
        JOIN usuarios u ON u.id = t.usuario_id
        LEFT JOIN subscriptions s ON s.tatuador_id = t.id
        LEFT JOIN plans p ON p.id = s.plan_id
        ORDER BY u.created_at DESC, t.id DESC
        LIMIT 8
      `),
      pool.query(`
        SELECT COUNT(DISTINCT usuario_id) AS total
        FROM analytics_eventos
        WHERE usuario_id IS NOT NULL
          AND data >= NOW() - INTERVAL '30 days'
      `),
    ]);

    const financial = financialResult.rows[0] || {};
    const patrocinadosAtivos = toNumber(financial.patrocinados_ativos);
    const receitaEstimada =
      formatMoney(financial.receita_planos) +
      patrocinadosAtivos * HIGHLIGHT_WEEKLY_PRICE;

    res.json({
      resumo: {
        totalUsuarios: toNumber(usersResult.rows[0]?.total),
        totalTatuadores: toNumber(tattooersResult.rows[0]?.total),
        assinaturasAtivas: toNumber(financial.assinaturas_ativas),
        premiumAtivos: toNumber(financial.premium_ativos),
        patrocinadosAtivos,
        receitaEstimada,
        usuariosBloqueados: toNumber(blockedResult.rows[0]?.total),
        usuariosAtivos: toNumber(activeUsersResult.rows[0]?.total),
      },
      recentes: {
        usuarios: recentUsersResult.rows.map(mapUsuario),
        tatuadores: recentTattooersResult.rows.map(mapTatuador),
      },
      moderacao: {
        usuariosBloqueados: toNumber(blockedResult.rows[0]?.total),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao carregar dashboard administrativo" });
  }
}

async function getAnalytics(req, res) {
  try {
    const [resumoBase, recentStatsResult, revenueResult, recentEventsResult, activeUsersResult] =
      await Promise.all([
        obterResumoAnalytics(),
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS cadastros_recentes,
            COUNT(*) FILTER (
              WHERE id IN (
                SELECT usuario_id
                FROM tatuadores
              )
              AND created_at >= NOW() - INTERVAL '7 days'
            ) AS tatuadores_recentes
          FROM usuarios
        `),
        pool.query(`
          SELECT
            COALESCE(SUM(amount), 0) AS receita_confirmada_total,
            COALESCE(SUM(amount) FILTER (
              WHERE COALESCE(approved_at, created_at) >= DATE_TRUNC('month', NOW())
            ), 0) AS receita_confirmada_mes
          FROM payment_sessions
          WHERE status = 'confirmed'
        `),
        pool.query(`
          SELECT
            u.id,
            u.usuario,
            u.email,
            u.created_at,
            CASE WHEN t.id IS NULL THEN 'cliente' ELSE 'tatuador' END AS tipo
          FROM usuarios u
          LEFT JOIN tatuadores t ON t.usuario_id = u.id
          ORDER BY u.created_at DESC, u.id DESC
          LIMIT 10
        `),
        pool.query(`
          SELECT COUNT(DISTINCT usuario_id) AS total
          FROM analytics_eventos
          WHERE usuario_id IS NOT NULL
            AND data >= NOW() - INTERVAL '30 days'
        `),
      ]);

    const dashboardResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(s.status, 'ativa') = 'ativa') AS assinaturas_ativas,
        COUNT(*) FILTER (
          WHERE COALESCE(s.status, 'ativa') = 'ativa'
            AND COALESCE(p.priority, 0) >= 3
        ) AS premium_ativos,
        COUNT(*) FILTER (
          WHERE t.highlight_until IS NOT NULL
            AND t.highlight_until > NOW()
        ) AS patrocinados_ativos,
        COALESCE(SUM(
          CASE
            WHEN COALESCE(s.status, 'ativa') = 'ativa' THEN COALESCE(p.price, 0)
            ELSE 0
          END
        ), 0) AS receita_planos
      FROM tatuadores t
      LEFT JOIN subscriptions s ON s.tatuador_id = t.id
      LEFT JOIN plans p ON p.id = s.plan_id
    `);

    const stats = recentStatsResult.rows[0] || {};
    const financial = dashboardResult.rows[0] || {};
    const patrocinadosAtivos = toNumber(financial.patrocinados_ativos);

    res.json({
      totalUsuarios: resumoBase.totalUsuarios,
      totalTatuadores: resumoBase.totalTatuadores,
      totalAgendamentos: resumoBase.totalAgendamentos,
      assinaturasAtivas: toNumber(financial.assinaturas_ativas),
      premiumAtivos: toNumber(financial.premium_ativos),
      patrocinadosAtivos,
      receitaEstimada:
        formatMoney(financial.receita_planos) +
        patrocinadosAtivos * HIGHLIGHT_WEEKLY_PRICE,
      receitaConfirmadaMes: formatMoney(revenueResult.rows[0]?.receita_confirmada_mes),
      receitaConfirmadaTotal: formatMoney(revenueResult.rows[0]?.receita_confirmada_total),
      cadastrosRecentes: toNumber(stats.cadastros_recentes),
      tatuadoresRecentes: toNumber(stats.tatuadores_recentes),
      usuariosAtivos: toNumber(activeUsersResult.rows[0]?.total),
      perfisMaisVisitados: resumoBase.perfisMaisVisitados || [],
      usuariosRecentes: recentEventsResult.rows.map((item) => ({
        id: Number(item.id),
        usuario: item.usuario,
        email: item.email,
        created_at: item.created_at,
        tipo: item.tipo,
      })),
    });
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
        u.created_at,
        CASE WHEN t.id IS NULL THEN 'cliente' ELSE 'tatuador' END AS tipo
      FROM usuarios u
      LEFT JOIN tatuadores t ON t.usuario_id = u.id
      ORDER BY u.is_admin DESC, u.created_at DESC, u.usuario ASC
    `);

    res.json(result.rows.map(mapUsuario));
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
        is_admin: toBoolean(result.rows[0].is_admin),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao atualizar permissao administrativa" });
  }
}

async function atualizarBloqueioUsuario(req, res) {
  const usuarioAlvoId = Number(req.params.id);
  const { is_blocked } = req.body;

  if (!Number.isInteger(usuarioAlvoId) || usuarioAlvoId <= 0) {
    return res.status(400).json({ erro: "Usuario invalido" });
  }

  if (typeof is_blocked !== "boolean") {
    return res.status(400).json({ erro: "Campo is_blocked precisa ser booleano" });
  }

  if (req.usuario.id === usuarioAlvoId && is_blocked === true) {
    return res.status(400).json({ erro: "Voce nao pode bloquear sua propria conta" });
  }

  try {
    const result = await pool.query(
      `UPDATE usuarios
       SET is_blocked = $1
       WHERE id = $2
       RETURNING id, usuario, email, is_blocked`,
      [is_blocked, usuarioAlvoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: "Usuario nao encontrado" });
    }

    res.json({
      mensagem: is_blocked
        ? "Usuario bloqueado com sucesso"
        : "Usuario desbloqueado com sucesso",
      usuario: {
        id: Number(result.rows[0].id),
        usuario: result.rows[0].usuario,
        email: result.rows[0].email,
        is_blocked: toBoolean(result.rows[0].is_blocked),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao atualizar bloqueio do usuario" });
  }
}

async function bloquearUsuario(req, res) {
  req.body = { ...req.body, is_blocked: true };
  return atualizarBloqueioUsuario(req, res);
}

async function listarTatuadoresAdmin(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.usuario_id,
        t.slug,
        COALESCE(t.nome_artistico, u.usuario) AS nome_artistico,
        t.cidade,
        COALESCE(t.bairro, t.municipio) AS bairro,
        t.foto_perfil,
        t.disponivel,
        t.highlight_until,
        COALESCE(s.status, 'ativa') AS status_assinatura,
        COALESCE(p.name, 'Free') AS plano,
        CASE
          WHEN COALESCE(s.status, 'ativa') = 'ativa' AND COALESCE(p.priority, 0) >= 3 THEN true
          ELSE false
        END AS premium_ativo,
        CASE
          WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN true
          ELSE false
        END AS patrocinado_ativo,
        u.usuario,
        u.email,
        u.is_blocked
      FROM tatuadores t
      JOIN usuarios u ON u.id = t.usuario_id
      LEFT JOIN subscriptions s ON s.tatuador_id = t.id
      LEFT JOIN plans p ON p.id = s.plan_id
      ORDER BY
        CASE
          WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN 1
          ELSE 0
        END DESC,
        COALESCE(p.priority, 0) DESC,
        nome_artistico ASC
    `);

    res.json(result.rows.map(mapTatuador));
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao listar tatuadores" });
  }
}

async function atualizarDestaqueTatuador(req, res) {
  const tatuadorId = Number(req.params.id);
  const active = req.body.active !== false;

  if (!Number.isInteger(tatuadorId) || tatuadorId <= 0) {
    return res.status(400).json({ erro: "Tatuador invalido" });
  }

  try {
    await ensureSubscriptionByTatuadorId(tatuadorId);

    const tatuadorResult = await pool.query(
      `UPDATE tatuadores
       SET highlight_until = CASE
         WHEN $1::boolean = true THEN NOW() + INTERVAL '7 days'
         ELSE NULL
       END
       WHERE id = $2
       RETURNING id, highlight_until`,
      [active, tatuadorId]
    );

    if (tatuadorResult.rows.length === 0) {
      return res.status(404).json({ erro: "Tatuador nao encontrado" });
    }

    await pool.query(
      `UPDATE subscriptions
       SET patrocinado = $1,
           status = CASE WHEN $1::boolean = true THEN 'ativa' ELSE status END
       WHERE tatuador_id = $2`,
      [active, tatuadorId]
    );

    res.json({
      mensagem: active
        ? "Destaque/patrocinio ativado com sucesso"
        : "Destaque/patrocinio removido com sucesso",
      tatuador: {
        id: Number(tatuadorResult.rows[0].id),
        highlight_until: tatuadorResult.rows[0].highlight_until,
        patrocinado_ativo: active,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao atualizar destaque do tatuador" });
  }
}

async function listarAssinaturasAdmin(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        s.id AS subscription_id,
        t.id AS tatuador_id,
        t.usuario_id,
        t.slug,
        COALESCE(t.nome_artistico, u.usuario) AS nome_artistico,
        u.usuario,
        u.email,
        COALESCE(p.name, 'Free') AS plano,
        COALESCE(p.price, 0) AS preco,
        COALESCE(s.status, 'ativa') AS status_assinatura,
        COALESCE(s.patrocinado, false) AS patrocinado,
        CASE
          WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN true
          ELSE false
        END AS destaque_ativo,
        t.highlight_until,
        s.created_at,
        t.disponivel
      FROM subscriptions s
      JOIN tatuadores t ON t.id = s.tatuador_id
      JOIN usuarios u ON u.id = t.usuario_id
      LEFT JOIN plans p ON p.id = s.plan_id
      ORDER BY
        CASE WHEN COALESCE(s.status, 'ativa') = 'ativa' THEN 1 ELSE 0 END DESC,
        COALESCE(p.priority, 0) DESC,
        s.created_at DESC
    `);

    res.json(result.rows.map(mapAssinatura));
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao listar assinaturas" });
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
  atualizarAdminUsuario,
  atualizarBloqueioUsuario,
  atualizarDestaqueTatuador,
  bloquearUsuario,
  getAnalytics,
  getDashboard,
  listarAssinaturasAdmin,
  listarTatuadoresAdmin,
  listarUsuarios,
  removerAvaliacao,
  removerPortfolio,
};
