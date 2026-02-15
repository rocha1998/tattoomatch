const pool = require('../config/db')
const bcrypt = require('bcrypt')

// GET /perfil
async function getPerfil(req, res) {
    const { id, usuario } = req.usuario
    res.json({ id, usuario })
}

// PUT /perfil
async function updatePerfil(req, res) {
    const { usuario, senha } = req.body
    const id = req.usuario.id

    if (!usuario && !senha) {
        return res.status(400).json({ mensagem: "Nada para atualizar ⚠️" })
    }

    try {
        let senhaCriptografada

        if (senha) {
            senhaCriptografada = await bcrypt.hash(senha, 10)
        }

        await pool.query(
            `UPDATE usuarios 
             SET usuario = COALESCE($1, usuario),
                 senha = COALESCE($2, senha)
             WHERE id = $3`,
            [usuario, senhaCriptografada, id]
        )

        res.json({ mensagem: "Perfil atualizado com sucesso ✅" })

    } catch (error) {
        console.error(error)
        res.status(500).json({ mensagem: "Erro ao atualizar perfil ❌" })
    }
}

module.exports = { getPerfil, updatePerfil }

async function deletePerfil(req, res) {
    const id = req.usuario.id

    try {
        await pool.query(
            'DELETE FROM usuarios WHERE id = $1',
            [id]
        )

        res.json({ mensagem: "Usuário deletado com sucesso 🗑️" })

    } catch (error) {
        console.error(error)
        res.status(500).json({ mensagem: "Erro ao deletar usuário ❌" })
    }
}


module.exports = { getPerfil, updatePerfil, deletePerfil }
