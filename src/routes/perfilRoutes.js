const express = require("express");

const upload = require("../config/upload");
const autenticarToken = require("../middlewares/auth");
const {
  getPerfil,
  updatePerfil,
  deletePerfil,
} = require("../controllers/perfilController");

const router = express.Router();

router.get("/perfil", autenticarToken, getPerfil);
router.put("/perfil", autenticarToken, updatePerfil);
router.delete("/perfil", autenticarToken, deletePerfil);

router.post(
  "/perfil/foto",
  autenticarToken,
  upload.single("foto"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ erro: "Nenhuma imagem enviada" });
    }

    res.json({
      mensagem: "Imagem enviada com sucesso",
      arquivo: req.file.filename,
    });
  }
);

module.exports = router;
