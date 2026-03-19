const express = require("express");

const upload = require("../config/upload");
const autenticarToken = require("../middlewares/auth");
const {
  alterarPlano,
  confirmarCheckoutPagamento,
  criarCheckoutPagamento,
  atualizarPerfilProfissional,
  getMeuPerfilProfissional,
  listarPlanos,
  meuPlano,
  tornarTatuador,
} = require("../controllers/perfilProfissionalController");

const router = express.Router();

router.put(
  "/perfil-profissional",
  autenticarToken,
  upload.single("foto_perfil"),
  atualizarPerfilProfissional
);

router.get("/perfil-profissional", autenticarToken, getMeuPerfilProfissional);
router.post("/tornar-tatuador", autenticarToken, tornarTatuador);
router.get("/planos", listarPlanos);
router.get("/meu-plano", autenticarToken, meuPlano);
router.post("/meu-plano", autenticarToken, alterarPlano);
router.post("/checkout/plan", autenticarToken, criarCheckoutPagamento);
router.post("/checkout/confirm", autenticarToken, confirmarCheckoutPagamento);

module.exports = router;
