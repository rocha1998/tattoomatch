const express = require("express");

const { avaliarTatuador } = require("../controllers/avaliacaoController");

const router = express.Router();

router.post("/avaliar/:usuario", avaliarTatuador);

module.exports = router;
