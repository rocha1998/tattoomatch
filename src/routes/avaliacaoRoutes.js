const express = require("express");

const { avaliarTatuador } = require("../controllers/avaliacaoController");
const autenticarToken = require("../middlewares/auth");

const router = express.Router();

router.post("/avaliar/:usuario", autenticarToken, avaliarTatuador);

module.exports = router;
