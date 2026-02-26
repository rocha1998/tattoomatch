const express = require('express')
const router = express.Router()

const { avaliarTatuador } = require('../controllers/avaliacaoController')

router.post('/avaliar/:usuario', avaliarTatuador)

module.exports = router

