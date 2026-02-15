const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const pool = require('../config/db')

const SECRET_KEY = "minha_chave_super_secreta_123"

async function register(req, res) {
    const { usuario, senha } = req.body

    if (!usuario || !senha) {
        return res.status(400).json({ mensagem: "Usuário e senha são obrigatórios ⚠️" })
    }

    try {
        const senhaCriptografada = await bcrypt.hash(senha, 10)

        await pool.query(
            'INSERT INTO usuarios (usuario, senha) VALUES ($1, $2)',
            [usuario, senhaCriptografada]
        )

        res.status(201).json({ mensagem: "Usuário cadastrado com sucesso ✅" })

    } catch (error) {
        console.error(error)
        res.status(400).json({ mensagem: "Usuário já existe ou erro no banco ❌" })
    }
}

async function login(req, res) {
    const { usuario, senha } = req.body

    try {
        const resultado = await pool.query(
            'SELECT * FROM usuarios WHERE usuario = $1',
            [usuario]
        )

        if (resultado.rows.length === 0) {
            return res.status(401).json({ mensagem: "Login inválido ❌" })
        }

        const usuarioBanco = resultado.rows[0]
        const senhaValida = await bcrypt.compare(senha, usuarioBanco.senha)

        if (!senhaValida) {
            return res.status(401).json({ mensagem: "Login inválido ❌" })
        }

        const token = jwt.sign(
            { id: usuarioBanco.id, usuario: usuarioBanco.usuario },
            SECRET_KEY,
            { expiresIn: '1h' }
        )

        res.json({
            mensagem: "Login aprovado ✅",
            token
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ mensagem: "Erro no servidor ❌" })
    }
}

module.exports = { register, login }
