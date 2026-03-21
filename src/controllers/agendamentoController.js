const fs = require("fs/promises");
const path = require("path");

const pool = require("../config/db");
const { uploadsDir } = require("../config/upload");
const { getTatuadorIdByUsuarioId } = require("../helpers/tatuador");
const { getPaginaFromRequest, registrarEvento } = require("../helpers/analytics");

const statusOrdem = ["PENDENTE", "DATA_SUGERIDA", "APROVADO", "CONCLUIDO"];

async function buscarAgendamentoPorId(agendamentoId) {
  const result = await pool.query(
    "SELECT * FROM agendamentos WHERE id = $1",
    [agendamentoId]
  );

  return result.rows[0] || null;
}

async function buscarAgendamentoComParticipantes(agendamentoId) {
  const result = await pool.query(
    `SELECT
       a.*,
       t.usuario_id AS tatuador_usuario_id,
       COALESCE(t.nome_artistico, u_tatuador.usuario) AS tatuador_nome,
       COALESCE(u_cliente.usuario, a.cliente_nome) AS cliente_usuario
     FROM agendamentos a
     JOIN tatuadores t ON t.id = a.tatuador_id
     LEFT JOIN usuarios u_tatuador ON u_tatuador.id = t.usuario_id
     LEFT JOIN usuarios u_cliente ON u_cliente.id = a.cliente_id
     WHERE a.id = $1`,
    [agendamentoId]
  );

  return result.rows[0] || null;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeDateKey(value) {
  if (!value) {
    return "sem-data";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isPastDate(value) {
  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return true;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return parsed < today;
}

function validateAgendamentoPayload(payload) {
  const clienteNome = normalizeText(payload.cliente_nome);
  const clienteWhatsapp = normalizeText(payload.cliente_whatsapp);
  const descricao = normalizeText(payload.descricao);
  const parteCorpo = normalizeText(payload.parte_corpo);
  const tamanho = normalizeText(payload.tamanho);
  const dataSolicitada = normalizeText(payload.data_solicitada);

  if (clienteNome.length < 3) {
    return { erro: "Nome do cliente precisa ter pelo menos 3 caracteres" };
  }

  if (!/^\d{10,15}$/.test(clienteWhatsapp)) {
    return { erro: "WhatsApp invalido. Use apenas numeros com DDD." };
  }

  if (descricao.length < 10) {
    return { erro: "Descricao precisa ter pelo menos 10 caracteres" };
  }

  if (parteCorpo.length < 2) {
    return { erro: "Parte do corpo precisa ter pelo menos 2 caracteres" };
  }

  if (!tamanho.length) {
    return { erro: "Tamanho e obrigatorio" };
  }

  if (!isValidIsoDate(dataSolicitada) || isPastDate(dataSolicitada)) {
    return { erro: "Data solicitada invalida" };
  }

  return {
    cliente_nome: clienteNome,
    cliente_whatsapp: clienteWhatsapp,
    descricao,
    parte_corpo: parteCorpo,
    tamanho,
    data_solicitada: dataSolicitada,
  };
}

function validateNovaData(value) {
  const normalized = normalizeText(value);

  if (!isValidIsoDate(normalized) || isPastDate(normalized)) {
    return null;
  }

  return normalized;
}

function validateMensagem(value) {
  const mensagem = normalizeText(value);

  if (mensagem.length < 1) {
    return { erro: "Digite uma mensagem antes de enviar" };
  }

  if (mensagem.length > 1000) {
    return { erro: "A mensagem pode ter no maximo 1000 caracteres" };
  }

  return { mensagem };
}

async function removerUploadSeExistir(filename) {
  if (!filename) {
    return;
  }

  await fs.unlink(path.join(uploadsDir, filename)).catch(() => {});
}

function resolverParticipacao(agendamento, usuarioId) {
  if (agendamento.cliente_id === usuarioId) {
    return { tipo: "cliente", outroTipo: "tatuador" };
  }

  if (agendamento.tatuador_usuario_id === usuarioId) {
    return { tipo: "tatuador", outroTipo: "cliente" };
  }

  return null;
}

function agruparAgenda(agendamentos) {
  const grupos = new Map();

  for (const agendamento of agendamentos) {
    const dataBase = agendamento.data_sugerida || agendamento.data_solicitada;
    const dataChave = normalizeDateKey(dataBase);

    if (!grupos.has(dataChave)) {
      grupos.set(dataChave, {
        data: dataChave,
        itens: [],
        totais: {
          total: 0,
          pendentes: 0,
          aprovados: 0,
          sugeridos: 0,
          concluidos: 0,
        },
      });
    }

    const grupo = grupos.get(dataChave);
    grupo.itens.push(agendamento);
    grupo.totais.total += 1;

    if (agendamento.status === "PENDENTE") {
      grupo.totais.pendentes += 1;
    } else if (agendamento.status === "APROVADO") {
      grupo.totais.aprovados += 1;
    } else if (agendamento.status === "DATA_SUGERIDA") {
      grupo.totais.sugeridos += 1;
    } else if (agendamento.status === "CONCLUIDO") {
      grupo.totais.concluidos += 1;
    }
  }

  return Array.from(grupos.values())
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((grupo) => ({
      ...grupo,
      itens: grupo.itens.sort((a, b) => {
        const dataA = normalizeDateKey(a.data_sugerida || a.data_solicitada || "");
        const dataB = normalizeDateKey(b.data_sugerida || b.data_solicitada || "");
        const compareData = dataA.localeCompare(dataB);

        if (compareData !== 0) {
          return compareData;
        }

        return (
          statusOrdem.indexOf(a.status || "PENDENTE") -
          statusOrdem.indexOf(b.status || "PENDENTE")
        );
      }),
    }));
}

exports.criarAgendamento = async (req, res) => {
  const { tatuador_id } = req.body;
  const imagemReferencia = req.file ? req.file.filename : null;
  const clienteId = req.usuario.id;

  if (!tatuador_id || Number.isNaN(Number(tatuador_id))) {
    await removerUploadSeExistir(imagemReferencia);
    return res.status(400).json({ erro: "Tatuador invalido" });
  }

  const payload = validateAgendamentoPayload(req.body);

  if (payload.erro) {
    await removerUploadSeExistir(imagemReferencia);
    return res.status(400).json(payload);
  }

  try {
    const tatuadorResult = await pool.query(
      "SELECT id FROM tatuadores WHERE id = $1",
      [tatuador_id]
    );

    if (tatuadorResult.rows.length === 0) {
      await removerUploadSeExistir(imagemReferencia);
      return res.status(404).json({ erro: "Tatuador nao encontrado" });
    }

    const result = await pool.query(
      `INSERT INTO agendamentos
      (cliente_nome, cliente_id, cliente_whatsapp, descricao, parte_corpo, tamanho, data_solicitada, tatuador_id, imagem_referencia)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        payload.cliente_nome,
        clienteId,
        payload.cliente_whatsapp,
        payload.descricao,
        payload.parte_corpo,
        payload.tamanho,
        payload.data_solicitada,
        tatuador_id,
        imagemReferencia,
      ]
    );

    await registrarEvento({
      tipoEvento: "agendamento_criado",
      usuarioId: clienteId,
      pagina: getPaginaFromRequest(req, `/perfil.html?id=${tatuador_id}`),
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    await removerUploadSeExistir(imagemReferencia);
    console.error(error);
    res.status(500).json({ erro: "Erro ao criar agendamento" });
  }
};

exports.listarAgendamentosDoTatuador = async (req, res) => {
  const tatuadorId = req.params.id;
  const usuarioId = req.usuario.id;

  if (!tatuadorId || Number.isNaN(Number(tatuadorId))) {
    return res.status(400).json({ erro: "ID de tatuador invalido" });
  }

  try {
    const tatuadorLogadoId = await getTatuadorIdByUsuarioId(usuarioId);

    if (!tatuadorLogadoId) {
      return res.status(403).json({ erro: "Usuario nao e tatuador" });
    }

    if (Number(tatuadorId) !== tatuadorLogadoId) {
      return res.status(403).json({ erro: "Nao autorizado" });
    }

    const result = await pool.query(
      `SELECT
         a.*,
         COALESCE((
           SELECT COUNT(*)
           FROM agendamento_mensagens m
           WHERE m.agendamento_id = a.id
           AND m.remetente_tipo = 'cliente'
           AND m.lida_em IS NULL
         ), 0)::INTEGER AS mensagens_nao_lidas
       FROM agendamentos a
       WHERE tatuador_id = $1
       ORDER BY criado_em DESC`,
      [tatuadorId]
    );

    await pool.query(
      `UPDATE agendamentos
       SET visualizado = true
       WHERE tatuador_id = $1`,
      [tatuadorId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar agendamentos" });
  }
};

exports.listarAgendaDoTatuador = async (req, res) => {
  const tatuadorId = req.params.id;
  const usuarioId = req.usuario.id;

  if (!tatuadorId || Number.isNaN(Number(tatuadorId))) {
    return res.status(400).json({ erro: "ID de tatuador invalido" });
  }

  try {
    const tatuadorLogadoId = await getTatuadorIdByUsuarioId(usuarioId);

    if (!tatuadorLogadoId) {
      return res.status(403).json({ erro: "Usuario nao e tatuador" });
    }

    if (Number(tatuadorId) !== tatuadorLogadoId) {
      return res.status(403).json({ erro: "Nao autorizado" });
    }

    const result = await pool.query(
      `SELECT
         a.*,
         COALESCE((
           SELECT COUNT(*)
           FROM agendamento_mensagens m
           WHERE m.agendamento_id = a.id
           AND m.remetente_tipo = 'cliente'
           AND m.lida_em IS NULL
         ), 0)::INTEGER AS mensagens_nao_lidas
       FROM agendamentos a
       WHERE a.tatuador_id = $1
       ORDER BY COALESCE(a.data_sugerida, a.data_solicitada, a.criado_em::date), a.criado_em DESC`,
      [tatuadorId]
    );

    res.json({
      dias: agruparAgenda(result.rows),
      total: result.rows.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao carregar agenda" });
  }
};

exports.aprovarAgendamento = async (req, res) => {
  const agendamentoId = req.params.id;
  const usuarioId = req.usuario.id;

  try {
    const tatuadorLogadoId = await getTatuadorIdByUsuarioId(usuarioId);

    if (!tatuadorLogadoId) {
      return res.status(403).json({ erro: "Usuario nao e tatuador" });
    }

    const agendamento = await buscarAgendamentoPorId(agendamentoId);

    if (!agendamento) {
      return res.status(404).json({ erro: "Agendamento nao encontrado" });
    }

    if (agendamento.tatuador_id !== tatuadorLogadoId) {
      return res.status(403).json({ erro: "Nao autorizado" });
    }

    const result = await pool.query(
      `UPDATE agendamentos
       SET status = 'APROVADO'
       WHERE id = $1
       RETURNING *`,
      [agendamentoId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao aprovar agendamento" });
  }
};

exports.concluirAgendamento = async (req, res) => {
  const agendamentoId = req.params.id;
  const usuarioId = req.usuario.id;

  try {
    const tatuadorLogadoId = await getTatuadorIdByUsuarioId(usuarioId);

    if (!tatuadorLogadoId) {
      return res.status(403).json({ erro: "Usuario nao e tatuador" });
    }

    const agendamento = await buscarAgendamentoPorId(agendamentoId);

    if (!agendamento) {
      return res.status(404).json({ erro: "Agendamento nao encontrado" });
    }

    if (agendamento.tatuador_id !== tatuadorLogadoId) {
      return res.status(403).json({ erro: "Nao autorizado" });
    }

    if (agendamento.status !== "APROVADO") {
      return res.status(400).json({ erro: "So e possivel concluir apos aprovacao" });
    }

    const result = await pool.query(
      `UPDATE agendamentos
       SET status = 'CONCLUIDO'
       WHERE id = $1
       RETURNING *`,
      [agendamentoId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao concluir agendamento" });
  }
};

exports.sugerirNovaData = async (req, res) => {
  const agendamentoId = req.params.id;
  const usuarioId = req.usuario.id;
  const { nova_data } = req.body;
  const novaDataValidada = validateNovaData(nova_data);

  if (!novaDataValidada) {
    return res.status(400).json({ erro: "Nova data invalida" });
  }

  try {
    const tatuadorLogadoId = await getTatuadorIdByUsuarioId(usuarioId);

    if (!tatuadorLogadoId) {
      return res.status(403).json({ erro: "Usuario nao e tatuador" });
    }

    const agendamento = await buscarAgendamentoPorId(agendamentoId);

    if (!agendamento) {
      return res.status(404).json({ erro: "Agendamento nao encontrado" });
    }

    if (agendamento.tatuador_id !== tatuadorLogadoId) {
      return res.status(403).json({ erro: "Nao autorizado" });
    }

    if (agendamento.status === "CONCLUIDO") {
      return res.status(400).json({ erro: "Agendamento ja concluido" });
    }

    const result = await pool.query(
      `UPDATE agendamentos
       SET data_sugerida = $1, status = 'DATA_SUGERIDA'
       WHERE id = $2
       RETURNING *`,
      [novaDataValidada, agendamentoId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao sugerir nova data" });
  }
};

exports.listarAgendamentosCliente = async (req, res) => {
  const { email } = req.params;
  const emailUsuarioLogado = req.usuario.email;

  if (!email) {
    return res.status(400).json({ erro: "Email e obrigatorio" });
  }

  if (email !== emailUsuarioLogado) {
    return res.status(403).json({ erro: "Nao autorizado" });
  }

  try {
    const result = await pool.query(
      `SELECT
         a.*,
         COALESCE((
           SELECT COUNT(*)
           FROM agendamento_mensagens m
           WHERE m.agendamento_id = a.id
           AND m.remetente_tipo = 'tatuador'
           AND m.lida_em IS NULL
         ), 0)::INTEGER AS mensagens_nao_lidas
       FROM agendamentos a
       JOIN usuarios u ON u.id = a.cliente_id
       WHERE u.email = $1
       ORDER BY a.criado_em DESC`,
      [email]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar agendamentos do cliente" });
  }
};

exports.listarAgendamentosDoCliente = async (req, res) => {
  const clienteId = req.usuario.id;

  try {
    const result = await pool.query(
      `SELECT
         a.*,
         COALESCE(t.nome_artistico, u_tatuador.usuario) AS tatuador_nome,
         COALESCE((
           SELECT COUNT(*)
           FROM agendamento_mensagens m
           WHERE m.agendamento_id = a.id
           AND m.remetente_tipo = 'tatuador'
           AND m.lida_em IS NULL
         ), 0)::INTEGER AS mensagens_nao_lidas
       FROM agendamentos a
       JOIN tatuadores t ON t.id = a.tatuador_id
       LEFT JOIN usuarios u_tatuador ON u_tatuador.id = t.usuario_id
       WHERE a.cliente_id = $1
       ORDER BY a.criado_em DESC`,
      [clienteId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar agendamentos" });
  }
};

exports.listarMensagensAgendamento = async (req, res) => {
  const agendamentoId = Number(req.params.id);
  const usuarioId = req.usuario.id;

  if (Number.isNaN(agendamentoId)) {
    return res.status(400).json({ erro: "Agendamento invalido" });
  }

  try {
    const agendamento = await buscarAgendamentoComParticipantes(agendamentoId);

    if (!agendamento) {
      return res.status(404).json({ erro: "Agendamento nao encontrado" });
    }

    const participacao = resolverParticipacao(agendamento, usuarioId);

    if (!participacao) {
      return res.status(403).json({ erro: "Nao autorizado" });
    }

    await pool.query(
      `UPDATE agendamento_mensagens
       SET lida_em = CURRENT_TIMESTAMP
       WHERE agendamento_id = $1
       AND remetente_tipo = $2
       AND lida_em IS NULL`,
      [agendamentoId, participacao.outroTipo]
    );

    const result = await pool.query(
      `SELECT id, agendamento_id, remetente_tipo, mensagem, lida_em, criado_em
       FROM agendamento_mensagens
       WHERE agendamento_id = $1
       ORDER BY criado_em ASC, id ASC`,
      [agendamentoId]
    );

    res.json({
      agendamento: {
        id: agendamento.id,
        status: agendamento.status,
        descricao: agendamento.descricao,
        data_solicitada: agendamento.data_solicitada,
        data_sugerida: agendamento.data_sugerida,
        tatuador_nome: agendamento.tatuador_nome,
        cliente_nome: agendamento.cliente_nome,
      },
      participante: participacao.tipo,
      mensagens: result.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao carregar conversa" });
  }
};

exports.enviarMensagemAgendamento = async (req, res) => {
  const agendamentoId = Number(req.params.id);
  const usuarioId = req.usuario.id;
  const validacao = validateMensagem(req.body.mensagem);

  if (Number.isNaN(agendamentoId)) {
    return res.status(400).json({ erro: "Agendamento invalido" });
  }

  if (validacao.erro) {
    return res.status(400).json(validacao);
  }

  try {
    const agendamento = await buscarAgendamentoComParticipantes(agendamentoId);

    if (!agendamento) {
      return res.status(404).json({ erro: "Agendamento nao encontrado" });
    }

    const participacao = resolverParticipacao(agendamento, usuarioId);

    if (!participacao) {
      return res.status(403).json({ erro: "Nao autorizado" });
    }

    const result = await pool.query(
      `INSERT INTO agendamento_mensagens
       (agendamento_id, remetente_usuario_id, remetente_tipo, mensagem)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agendamento_id, remetente_tipo, mensagem, lida_em, criado_em`,
      [agendamentoId, usuarioId, participacao.tipo, validacao.mensagem]
    );

    res.status(201).json({
      mensagem: "Mensagem enviada com sucesso",
      item: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao enviar mensagem" });
  }
};

exports.contarNovosAgendamentos = async (req, res) => {
  const usuarioId = req.usuario.id;

  try {
    const tatuadorId = await getTatuadorIdByUsuarioId(usuarioId);

    if (!tatuadorId) {
      return res.status(403).json({ erro: "Usuario nao e tatuador" });
    }

    const result = await pool.query(
      `SELECT COUNT(*)
       FROM agendamentos
       WHERE tatuador_id = $1
       AND visualizado = false`,
      [tatuadorId]
    );

    res.json({ novos: result.rows[0].count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao contar agendamentos" });
  }
};
