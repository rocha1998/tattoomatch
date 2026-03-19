const jwt = require("jsonwebtoken");

const pool = require("../config/db");
const env = require("../config/env");

let schemaReadyPromise = null;

async function createAnalyticsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_eventos (
      id SERIAL PRIMARY KEY,
      tipo_evento VARCHAR(100) NOT NULL,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      pagina VARCHAR(255),
      data TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS analytics_eventos_tipo_evento_idx
    ON analytics_eventos (tipo_evento)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS analytics_eventos_usuario_id_idx
    ON analytics_eventos (usuario_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS analytics_eventos_data_idx
    ON analytics_eventos (data DESC)
  `);
}

function ensureAnalyticsSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = createAnalyticsSchema().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
}

function normalizarPagina(value) {
  if (!value) {
    return null;
  }

  return String(value).slice(0, 255);
}

function getPaginaFromRequest(req, fallback = null) {
  const referer = req.get("referer");

  if (referer) {
    try {
      const url = new URL(referer);
      return normalizarPagina(`${url.pathname}${url.search}`);
    } catch {}
  }

  return normalizarPagina(fallback || req.originalUrl || null);
}

function getOptionalUsuarioIdFromRequest(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return payload?.id ?? null;
  } catch {
    return null;
  }
}

async function registrarEvento({ tipoEvento, usuarioId = null, pagina = null, data = new Date() }) {
  if (!tipoEvento) {
    return;
  }

  try {
    await ensureAnalyticsSchema();
    await pool.query(
      `INSERT INTO analytics_eventos (tipo_evento, usuario_id, pagina, data)
       VALUES ($1, $2, $3, $4)`,
      [tipoEvento, usuarioId, normalizarPagina(pagina), data]
    );
  } catch (error) {
    console.error("Erro ao registrar evento de analytics:", error);
  }
}

async function obterResumoAnalytics() {
  await ensureAnalyticsSchema();

  const [usuariosResult, tatuadoresResult, agendamentosResult, perfisResult] =
    await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM usuarios"),
      pool.query("SELECT COUNT(*) AS total FROM tatuadores"),
      pool.query("SELECT COUNT(*) AS total FROM agendamentos"),
      pool.query(`
        SELECT
          t.id AS tatuador_id,
          t.slug,
          COALESCE(t.nome_artistico, u.usuario) AS nome_artistico,
          COUNT(*)::int AS visitas
        FROM analytics_eventos ae
        JOIN tatuadores t
          ON (
            t.id = NULLIF(SUBSTRING(ae.pagina FROM 'id=([0-9]+)'), '')::int
            OR t.slug = NULLIF(SUBSTRING(ae.pagina FROM '/perfil/([^?]+)'), '')
          )
        JOIN usuarios u ON u.id = t.usuario_id
        WHERE ae.tipo_evento = 'visita_perfil'
          AND (
            SUBSTRING(ae.pagina FROM 'id=([0-9]+)') IS NOT NULL
            OR SUBSTRING(ae.pagina FROM '/perfil/([^?]+)') IS NOT NULL
          )
        GROUP BY t.id, t.slug, t.nome_artistico, u.usuario
        ORDER BY visitas DESC, nome_artistico ASC
        LIMIT 10
      `),
    ]);

  return {
    totalUsuarios: Number(usuariosResult.rows[0]?.total || 0),
    totalTatuadores: Number(tatuadoresResult.rows[0]?.total || 0),
    totalAgendamentos: Number(agendamentosResult.rows[0]?.total || 0),
    perfisMaisVisitados: perfisResult.rows.map((item) => ({
      tatuador_id: Number(item.tatuador_id),
      slug: item.slug,
      nome_artistico: item.nome_artistico,
      visitas: Number(item.visitas),
    })),
  };
}

module.exports = {
  ensureAnalyticsSchema,
  getOptionalUsuarioIdFromRequest,
  getPaginaFromRequest,
  obterResumoAnalytics,
  registrarEvento,
};
