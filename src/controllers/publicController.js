const pool = require('../config/db')

async function getTatuadorPublico(req, res) {
  const { id } = req.params

  try {

    // 🔥 BUSCAR TATUADOR FAZENDO JOIN COM USUARIOS
    const tatuadorResult = await pool.query(`
  SELECT 
    t.id,
    u.usuario,
    t.nome_artistico,
    t.bio,
    t.cidade,
    t.estilos,
    t.foto_perfil,
    t.whatsapp
  FROM tatuadores t
  JOIN usuarios u ON u.id = t.usuario_id
  WHERE t.id = $1
`, [id])

    if (tatuadorResult.rows.length === 0) {
      return res.status(404).json({ mensagem: "Tatuador não encontrado ❌" })
    }

    const tatuador = tatuadorResult.rows[0]

    // 🔥 PORTFÓLIO
    const tattoosResult = await pool.query(`
      SELECT id, imagem, descricao, estilo, created_at
      FROM tatuagens
      WHERE usuario_id = $1
      ORDER BY created_at DESC
    `, [tatuador.id])

    // 🔥 AVALIAÇÕES
    const avaliacoesResult = await pool.query(`
      SELECT nota, comentario, created_at
      FROM avaliacoes
      WHERE tatuador_id = $1
      ORDER BY created_at DESC
    `, [tatuador.id])

    res.json({
      tatuador,
      portfolio: tattoosResult.rows,
      avaliacoes: avaliacoesResult.rows
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: "Erro no servidor" })
  }
}


async function listarTatuadores(req, res) {
    const { cidade, estilo } = req.query

    let query = `
        SELECT 
           t.id AS id,
    u.usuario,
    t.nome_artistico,
    t.cidade,
    t.estilos,
    t.foto_perfil,
    COALESCE(AVG(a.nota),0) as media,
    COUNT(a.id) as total_avaliacoes
FROM tatuadores t
JOIN usuarios u ON u.id = t.usuario_id
LEFT JOIN avaliacoes a ON t.id = a.tatuador_id
WHERE t.nome_artistico IS NOT NULL
    `

    const valores = []

    if (cidade) {
        valores.push(`%${cidade}%`)
        query += ` AND u.cidade ILIKE $${valores.length}`
    }

    if (estilo) {
        valores.push(`%${estilo}%`)
        query += ` AND u.estilos ILIKE $${valores.length}`
    }

    query += `
        GROUP BY t.id, u.usuario
ORDER BY media DESC
    `

    try {
        const result = await pool.query(query, valores)
        res.json(result.rows)
    } catch (error) {
        console.error(error)
        res.status(500).json({ mensagem: "Erro ao listar tatuadores ❌" })
    }
}

module.exports = { getTatuadorPublico }
module.exports = { getTatuadorPublico, listarTatuadores }
