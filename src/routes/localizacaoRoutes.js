const express = require("express");

const { detectarLocalizacao } = require("../controllers/localizacaoController");

const router = express.Router();

router.get("/localizacao", detectarLocalizacao);

module.exports = router;
