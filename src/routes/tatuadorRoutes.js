const express = require("express");

const {
  rankingTatuadores,
  tatuadoresDestaque,
  rankingPorCidade,
  rankingCidadeEstilo,
} = require("../controllers/tatuadorController");

const router = express.Router();

router.get("/ranking", rankingTatuadores);
router.get("/tatuadores-destaque", tatuadoresDestaque);
router.get("/ranking/:cidade", rankingPorCidade);
router.get("/ranking/:cidade/:estilo", rankingCidadeEstilo);

module.exports = router;
