const express = require('express')
const router = express.Router()

const autenticarToken = require('../middlewares/auth')
const { getPerfil, updatePerfil,deletePerfil } = require('../controllers/perfilController')

router.get('/perfil', autenticarToken, getPerfil)
router.put('/perfil', autenticarToken, updatePerfil)
router.delete('/perfil', autenticarToken, deletePerfil)

module.exports = router


 

