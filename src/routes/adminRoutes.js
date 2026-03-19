const express = require("express");

const {
  getAnalytics,
  getDashboard,
  listarUsuarios,
  atualizarAdminUsuario,
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
router.patch("/admin/usuarios/:id/admin", autenticarToken, soAdmin, atualizarAdminUsuario);
router.patch("/admin/usuarios/bloquear/:id", autenticarToken, soAdmin, bloquearUsuario);
router.delete("/admin/avaliacoes/:id", autenticarToken, soAdmin, removerAvaliacao);
router.delete("/admin/portfolio/:id", autenticarToken, soAdmin, removerPortfolio);

module.exports = router;
