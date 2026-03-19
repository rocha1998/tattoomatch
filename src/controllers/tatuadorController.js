const pool = require("../config/db");

async function rankingTatuadores(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.slug,
        t.nome_artistico,
        t.estado,
        t.cidade,
        t.municipio,
        p.name AS plano,
        p.priority,
        AVG(a.nota) AS media,
        COUNT(a.id) AS total_avaliacoes
      FROM tatuadores t
      LEFT JOIN subscriptions s ON s.tatuador_id = t.id
      LEFT JOIN plans p ON p.id = s.plan_id
      LEFT JOIN avaliacoes a ON a.tatuador_id = t.id
      WHERE COALESCE(t.disponivel, true) = true
      GROUP BY t.id, p.name, p.priority
      HAVING COUNT(a.id) >= 2
      ORDER BY
        CASE
          WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN 1
          ELSE 0
        END DESC,
        p.priority DESC,
        media DESC NULLS LAST
      LIMIT 10
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar ranking" });
  }
}

async function tatuadoresDestaque(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.nome_artistico,
        t.estado,
        t.cidade,
        t.municipio,
        t.foto_perfil,
        p.name AS plano,
        CASE
          WHEN COALESCE(s.status, 'ativa') = 'ativa' AND COALESCE(p.priority, 0) >= 3 THEN true
          ELSE false
        END AS premium_ativo,
        CASE
          WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN true
          ELSE false
        END AS patrocinado,
        CASE
          WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN true
          ELSE false
        END AS highlight_ativo
      FROM tatuadores t
      JOIN subscriptions s ON s.tatuador_id = t.id
      JOIN plans p ON p.id = s.plan_id
      WHERE COALESCE(t.disponivel, true) = true
        AND COALESCE(s.status, 'ativa') = 'ativa'
        AND COALESCE(p.priority, 0) >= 3
      ORDER BY
        CASE
          WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN 1
          ELSE 0
        END DESC,
        p.priority DESC
      LIMIT 6
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar destaques" });
  }
}

async function rankingPorCidade(req, res) {
  const { cidade } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
        t.id,
        t.nome_artistico,
        t.estado,
        t.cidade,
        t.municipio,
        p.name AS plano,
        p.priority,
        AVG(a.nota) AS media,
        COUNT(a.id) AS total_avaliacoes
      FROM tatuadores t
      LEFT JOIN subscriptions s ON s.tatuador_id = t.id
      LEFT JOIN plans p ON p.id = s.plan_id
      LEFT JOIN avaliacoes a ON a.tatuador_id = t.id
      WHERE COALESCE(t.disponivel, true) = true
      AND t.cidade ILIKE $1
      GROUP BY t.id, p.name, p.priority
      HAVING COUNT(a.id) >= 2
      ORDER BY
        CASE
          WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN 1
          ELSE 0
        END DESC,
        p.priority DESC,
        media DESC NULLS LAST
      LIMIT 10
    `,
      [`%${cidade}%`]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar ranking da cidade" });
  }
}

async function rankingCidadeEstilo(req, res) {
  const { cidade, estilo } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
        t.id,
        t.nome_artistico,
        t.estado,
        t.cidade,
        t.municipio,
        t.estilos,
        p.name AS plano,
        p.priority,
        AVG(a.nota) AS media,
        COUNT(a.id) AS total_avaliacoes
      FROM tatuadores t
      LEFT JOIN subscriptions s ON s.tatuador_id = t.id
      LEFT JOIN plans p ON p.id = s.plan_id
      LEFT JOIN avaliacoes a ON a.tatuador_id = t.id
      WHERE COALESCE(t.disponivel, true) = true
      AND t.cidade ILIKE $1
      AND t.estilos ILIKE $2
      GROUP BY t.id, p.name, p.priority
      HAVING COUNT(a.id) >= 1
      ORDER BY
        CASE
          WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN 1
          ELSE 0
        END DESC,
        p.priority DESC,
        media DESC NULLS LAST
      LIMIT 10
    `,
      [`%${cidade}%`, `%${estilo}%`]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar ranking por cidade e estilo" });
  }
}

module.exports = {
  rankingCidadeEstilo,
  rankingPorCidade,
  rankingTatuadores,
  tatuadoresDestaque,
};
