const express = require("express");

const upload = require("../config/upload");
const {
  criarAgendamento,
  listarAgendamentosDoTatuador,
  listarAgendaDoTatuador,
  aprovarAgendamento,
  concluirAgendamento,
  sugerirNovaData,
  listarAgendamentosCliente,
  listarAgendamentosDoCliente,
  listarMensagensAgendamento,
  enviarMensagemAgendamento,
  contarNovosAgendamentos,
} = require("../controllers/agendamentoController");
const autenticarToken = require("../middlewares/auth");
const soTatuador = require("../middlewares/soTatuador");

const router = express.Router();

router.post(
  "/agendamentos",
  autenticarToken,
  upload.single("imagem_referencia"),
  criarAgendamento
);
router.get(
  "/tatuador/:id/agendamentos",
  autenticarToken,
  soTatuador,
  listarAgendamentosDoTatuador
);
router.get(
  "/tatuador/:id/agenda",
  autenticarToken,
  soTatuador,
  listarAgendaDoTatuador
);
router.patch(
  "/agendamentos/:id/aprovar",
  autenticarToken,
  soTatuador,
  aprovarAgendamento
);
router.patch(
  "/agendamentos/:id/concluir",
  autenticarToken,
  soTatuador,
  concluirAgendamento
);
router.patch(
  "/agendamentos/:id/sugerir-data",
  autenticarToken,
  soTatuador,
  sugerirNovaData
);
router.get("/agendamentos/:id/chat", autenticarToken, listarMensagensAgendamento);
router.post("/agendamentos/:id/chat", autenticarToken, enviarMensagemAgendamento);
router.get(
  "/meus-agendamentos/:email",
  autenticarToken,
  listarAgendamentosCliente
);
router.get("/meus-agendamentos", autenticarToken, listarAgendamentosDoCliente);
router.get("/agendamentos/novos", autenticarToken, contarNovosAgendamentos);

module.exports = router;
