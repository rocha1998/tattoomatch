const pool = require('../config/db')

async function atualizarPerfilProfissional(req, res) {
    const usuario_id = req.usuario.id
    const { nome_artistico, bio, cidade, estilos, whatsapp } = req.body

    let foto_perfil = null
    if (req.file) {
        foto_perfil = req.file.filename
    }

    try {
        await pool.query(
  `UPDATE usuarios
   SET nome_artistico = COALESCE($1, nome_artistico),
       bio = COALESCE($2, bio),
       cidade = COALESCE($3, cidade),
       estilos = COALESCE($4, estilos),
       foto_perfil = COALESCE($5, foto_perfil),
       whatsapp = COALESCE($6, whatsapp)
   WHERE id = $7`,
  [nome_artistico, bio, cidade, estilos, foto_perfil, whatsapp, usuario_id]
)

        res.json({ mensagem: "Perfil profissional atualizado ✅" })

    } catch (error) {
        console.error(error)
        res.status(500).json({ mensagem: "Erro ao atualizar perfil ❌" })
    }
}

module.exports = { atualizarPerfilProfissional }