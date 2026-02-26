const express = require("express");
const router = express.Router();
const agendamentoController = require("../controllers/agendamentoController");
const auth = require("../middlewares/auth");

router.post("/agendamentos", agendamentoController.criarAgendamento);

router.get(
  "/tatuador/:id/agendamentos",
  agendamentoController.listarAgendamentosDoTatuador
);

router.patch(
  "/agendamentos/:id/aprovar",
  auth,
  agendamentoController.aprovarAgendamento
);

router.patch(
  "/agendamentos/:id/concluir",
  auth,
  agendamentoController.concluirAgendamento
);

router.patch(
  "/agendamentos/:id/sugerir-data",
  auth,
  agendamentoController.sugerirNovaData
);
module.exports = router;