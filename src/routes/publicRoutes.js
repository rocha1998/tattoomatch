const express = require('express')
const router = express.Router()

const { getTatuadorPublico } = require('../controllers/publicController')
const { listarTatuadores } = require('../controllers/publicController')

// 🔥 ROTA DO PERFIL PÚBLICO
router.get('/tatuador/:id', getTatuadorPublico)

// Rota pública do tatuador
router.get('/tatuadores', listarTatuadores)

module.exports = router
