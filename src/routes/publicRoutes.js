const express = require("express");

const {
  getTatuadorPublico,
  getSitemapXml,
  listarTatuadores,
  listarTatuadoresPorCidadeSeo,
  listarTatuadoresPorEstiloSeo,
} = require("../controllers/publicController");

const router = express.Router();

router.get("/sitemap.xml", getSitemapXml);
router.get("/tatuador/:slugOrId", getTatuadorPublico);
router.get("/tatuadores/estilo/:estilo", listarTatuadoresPorEstiloSeo);
router.get("/tatuadores/:cidade", listarTatuadoresPorCidadeSeo);
router.get("/tatuadores", listarTatuadores);

module.exports = router;
