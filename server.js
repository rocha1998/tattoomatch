const cors = require('cors')
const express = require('express')
const app = express()
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { Pool } = require('pg')
const pool = require('./src/config/db')
const autenticarToken = require('./src/middlewares/auth')
const authRoutes = require('./src/routes/authRoutes')
const perfilRoutes = require('./src/routes/perfilRoutes')






// 🔑 Chave secreta para JWT
const SECRET_KEY = "minha_chave_super_secreta_123"

// Middlewares
app.use(cors())        // 🔥 permite qualquer origem
app.use(express.json()) // 🔥 lê JSON no body
app.use(authRoutes)
app.use(perfilRoutes)



console.log("🚀 ARQUIVO EXECUTOU")





// Rota inicial
app.get('/', (req, res) => {
    res.send('Servidor funcionando 🚀')
})





// Start do servidor
app.listen(3000, () => {
    console.log("Servidor rodando na porta 3000 🚀")
})

