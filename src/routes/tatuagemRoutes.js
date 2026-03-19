const express = require("express");

const { portfolioUpload } = require("../config/upload");
const autenticarToken = require("../middlewares/auth");
const {
  criarTatuagem,
  deletarTatuagem,
} = require("../controllers/tatuagemController");

const router = express.Router();

router.post(
  "/tatuagens",
  autenticarToken,
  portfolioUpload.fields([
    { name: "arquivo", maxCount: 1 },
    { name: "imagem", maxCount: 1 },
  ]),
  criarTatuagem
);
router.delete("/tatuagens/:id", autenticarToken, deletarTatuagem);

module.exports = router;
