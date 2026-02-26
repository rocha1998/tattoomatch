const pool = require('../config/db')

async function avaliarTatuador(req, res) {
    const { usuario } = req.params
    const { nota, comentario } = req.body

    if (!nota) {
        return res.status(400).json({ mensagem: "Nota obrigatória ❌" })
    }

    try {
        // Buscar ID do tatuador
        const userResult = await pool.query(
            'SELECT id FROM usuarios WHERE usuario = $1',
            [usuario]
        )

        if (userResult.rows.length === 0) {
            return res.status(404).json({ mensagem: "Tatuador não encontrado ❌" })
        }

        const usuario_id = userResult.rows[0].id

        await pool.query(
            `INSERT INTO avaliacoes (usuario_id, nota, comentario)
             VALUES ($1, $2, $3)`,
            [usuario_id, nota, comentario]
        )

        res.status(201).json({ mensagem: "Avaliação enviada ⭐" })

    } catch (error) {
        console.error(error)
        res.status(500).json({ mensagem: "Erro ao avaliar ❌" })
    }
}

module.exports = { avaliarTatuador }