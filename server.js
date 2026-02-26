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
const publicRoutes = require('./src/routes/publicRoutes')
const tatuagemRoutes = require('./src/routes/tatuagemRoutes')
const perfilProfissionalRoutes = require('./src/routes/perfilProfissionalRoutes')
const avaliacaoRoutes = require('./src/routes/avaliacaoRoutes')
const agendamentoRoutes = require('./src/routes/agendamentoRoutes');
const path = require('path')









// Middlewares
app.use(cors())        // 🔥 permite qualquer origem
app.use(express.json()) // 🔥 lê JSON no body
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use(express.static('.'))
app.use(authRoutes)
app.use(perfilRoutes)
app.use(publicRoutes)
app.use(tatuagemRoutes)
app.use(perfilProfissionalRoutes)
app.use(avaliacaoRoutes)
app.use(agendamentoRoutes);




console.log("🚀 ARQUIVO EXECUTOU")





// Rota inicial
app.get('/', (req, res) => {
    res.send('Servidor funcionando 🚀')
})





// Start do servidor
app.listen(3000, () => {
    console.log("Servidor rodando na porta 3000 🚀")
})

