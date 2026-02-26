const express = require('express')
const router = express.Router()

const autenticarToken = require('../middlewares/auth')
const upload = require('../config/upload')
const { atualizarPerfilProfissional } = require('../controllers/perfilProfissionalController')

router.put(
  '/perfil-profissional',
  autenticarToken,
  upload.single('foto_perfil'),
  atualizarPerfilProfissional
)

module.exports = router