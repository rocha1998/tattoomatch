const pool = require("../config/db"); // ajuste se necessário

exports.criarAgendamento = async (req, res) => {
  const {
    cliente_nome,
    cliente_email,
    cliente_whatsapp,
    descricao,
    parte_corpo,
    tamanho,
    data_solicitada,
    tatuador_id
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO agendamentos
      (cliente_nome, cliente_email, cliente_whatsapp, descricao, parte_corpo, tamanho, data_solicitada, tatuador_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        cliente_nome,
        cliente_email,
        cliente_whatsapp,
        descricao,
        parte_corpo,
        tamanho,
        data_solicitada,
        tatuador_id
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao criar agendamento" });
  }
};

exports.listarAgendamentosDoTatuador = async (req, res) => {
  const tatuadorId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT * FROM agendamentos 
       WHERE tatuador_id = $1
       ORDER BY criado_em DESC`,
      [tatuadorId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao buscar agendamentos" });
  }
};

exports.aprovarAgendamento = async (req, res) => {
  const id = req.params.id;

  try {
    const result = await pool.query(
      `UPDATE agendamentos 
       SET status = 'APROVADO'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao aprovar agendamento" });
  }
};

exports.concluirAgendamento = async (req, res) => {
  const agendamentoId = req.params.id;
  const tatuadorLogadoId = req.usuario.id;

  try {
    // buscar agendamento
    const agendamento = await pool.query(
      "SELECT * FROM agendamentos WHERE id = $1",
      [agendamentoId]
    );

    if (agendamento.rows.length === 0) {
      return res.status(404).json({ erro: "Agendamento não encontrado" });
    }

    // verificar dono
    if (agendamento.rows[0].tatuador_id != tatuadorLogadoId) {
      return res.status(403).json({ erro: "Não autorizado" });
    }

    // verificar se está aprovado
    if (agendamento.rows[0].status !== "APROVADO") {
      return res.status(400).json({ erro: "Só é possível concluir após aprovação" });
    }

    // concluir
    const result = await pool.query(
      `UPDATE agendamentos 
       SET status = 'CONCLUIDO'
       WHERE id = $1
       RETURNING *`,
      [agendamentoId]
    );

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({ erro: "Erro ao concluir agendamento" });
  }
};

exports.sugerirNovaData = async (req, res) => {
  const agendamentoId = req.params.id;
  const tatuadorLogadoId = req.usuario.id;
  const { nova_data } = req.body;

  try {
    // buscar agendamento
    const agendamento = await pool.query(
      "SELECT * FROM agendamentos WHERE id = $1",
      [agendamentoId]
    );

    if (agendamento.rows.length === 0) {
      return res.status(404).json({ erro: "Agendamento não encontrado" });
    }

    if (agendamento.rows[0].tatuador_id != tatuadorLogadoId) {
      return res.status(403).json({ erro: "Não autorizado" });
    }

    if (agendamento.rows[0].status === "CONCLUIDO") {
      return res.status(400).json({ erro: "Agendamento já concluído" });
    }

    const result = await pool.query(
      `UPDATE agendamentos 
       SET data_sugerida = $1, status = 'DATA_SUGERIDA'
       WHERE id = $2
       RETURNING *`,
      [nova_data, agendamentoId]
    );

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({ erro: "Erro ao sugerir nova data" });
  }
};