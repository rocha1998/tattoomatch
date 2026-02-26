const express = require('express')
const router = express.Router()

const autenticarToken = require('../middlewares/auth')
const upload = require('../config/upload')
const { criarTatuagem } = require('../controllers/tatuagemController')
const { deletarTatuagem } = require('../controllers/tatuagemController')

router.delete('/tatuagens/:id', autenticarToken, deletarTatuagem)


router.post('/tatuagens', autenticarToken, upload.single('imagem'), criarTatuagem)

module.exports = router


