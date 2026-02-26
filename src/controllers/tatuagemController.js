const pool = require('../config/db')

async function criarTatuagem(req, res) {
    const { descricao, estilo } = req.body
    const usuario_id = req.usuario.id

    if (!req.file) {
        return res.status(400).json({ mensagem: "Imagem obrigatória ❌" })
    }

    try {
        const result = await pool.query(
            `INSERT INTO tatuagens (usuario_id, imagem, descricao, estilo)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [usuario_id, req.file.filename, descricao, estilo]
        )

        res.status(201).json({
            mensagem: "Tatuagem adicionada ao portfólio ✅",
            tatuagem: result.rows[0]
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ mensagem: "Erro ao criar tatuagem ❌" })
    }
}


async function deletarTatuagem(req, res) {
    const { id } = req.params
    const usuario_id = req.usuario.id

    try {
        // Verifica se a tatuagem pertence ao usuário
        const result = await pool.query(
            'SELECT * FROM tatuagens WHERE id = $1 AND usuario_id = $2',
            [id, usuario_id]
        )

        if (result.rows.length === 0) {
            return res.status(403).json({ mensagem: "Você não pode excluir essa tatuagem ❌" })
        }

        await pool.query(
            'DELETE FROM tatuagens WHERE id = $1',
            [id]
        )

        res.json({ mensagem: "Tatuagem excluída com sucesso 🗑️" })

    } catch (error) {
        console.error(error)
        res.status(500).json({ mensagem: "Erro ao excluir tatuagem ❌" })
    }
}

module.exports = { criarTatuagem, deletarTatuagem }
