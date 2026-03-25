const express = require("express");

const {
  getAnalytics,
  getDashboard,
  listarUsuarios,
  atualizarAdminUsuario,
  atualizarBloqueioUsuario,
  listarTatuadoresAdmin,
  listarAssinaturasAdmin,
  atualizarDestaqueTatuador,
  bloquearUsuario,
  removerAvaliacao,
  removerPortfolio,
} = require("../controllers/adminController");
const autenticarToken = require("../middlewares/auth");
const soAdmin = require("../middlewares/soAdmin");

const router = express.Router();

router.get("/admin/dashboard", autenticarToken, soAdmin, getDashboard);
router.get("/admin/analytics", autenticarToken, soAdmin, getAnalytics);
router.get("/admin/usuarios", autenticarToken, soAdmin, listarUsuarios);
router.get("/admin/tatuadores", autenticarToken, soAdmin, listarTatuadoresAdmin);
router.get("/admin/assinaturas", autenticarToken, soAdmin, listarAssinaturasAdmin);
router.patch("/admin/usuarios/:id/admin", autenticarToken, soAdmin, atualizarAdminUsuario);
router.patch("/admin/usuarios/:id/bloqueio", autenticarToken, soAdmin, atualizarBloqueioUsuario);
router.patch("/admin/usuarios/bloquear/:id", autenticarToken, soAdmin, bloquearUsuario);
router.patch("/admin/tatuadores/:id/destaque", autenticarToken, soAdmin, atualizarDestaqueTatuador);
router.delete("/admin/avaliacoes/:id", autenticarToken, soAdmin, removerAvaliacao);
router.delete("/admin/portfolio/:id", autenticarToken, soAdmin, removerPortfolio);

module.exports = router;
