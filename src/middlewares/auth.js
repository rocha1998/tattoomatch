const jwt = require('jsonwebtoken')

const SECRET_KEY = "minha_chave_super_secreta_123"

function autenticarToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
        return res.status(401).json({ mensagem: "Token ausente ❌" })
    }

    jwt.verify(token, SECRET_KEY, (err, usuario) => {
        if (err) {
            return res.status(403).json({ mensagem: "Token inválido ❌" })
        }

        req.usuario = usuario
        next()
    })
}

module.exports = autenticarToken
