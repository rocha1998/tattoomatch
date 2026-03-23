const pool = require("../config/db");
const env = require("../config/env");
const { createAccessToken } = require("../helpers/auth");
const {
  createMercadoPagoPreference,
  fetchMercadoPagoPaymentById,
  findMercadoPagoApprovedPayment,
  isMercadoPagoConfigured,
} = require("../helpers/payments");
const { getTatuadorIdByUsuarioId } = require("../helpers/tatuador");
const { emptyToNull, generateSlug } = require("../helpers/strings");

function parseBooleanInput(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "on", "sim"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "off", "nao"].includes(normalized)) {
    return false;
  }

  return null;
}

function parseNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseWebhookJsonBody(body) {
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString("utf8"));
    } catch {
      return {};
    }
  }

  return body && typeof body === "object" ? body : {};
}

async function generateUniqueTatuadorSlug({ nomeArtistico, cidade, tatuadorId }) {
  const baseSlug = generateSlug(nomeArtistico, cidade);
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await pool.query(
      `SELECT id
       FROM tatuadores
       WHERE slug = $1
         AND id <> $2
       LIMIT 1`,
      [slug, tatuadorId]
    );

    if (existing.rows.length === 0) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function getAssinaturaAtual(tatuadorId, usuarioId) {
  const planoResult = await pool.query(
    `SELECT
       p.id AS plan_id,
       p.name,
       p.portfolio_limit,
       p.photo_limit,
       p.video_limit,
       COALESCE(s.status, 'ativa') AS status_assinatura,
       COALESCE(s.patrocinado, false) AS patrocinado,
       t.highlight_until,
       CASE
         WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN true
         ELSE false
       END AS destaque_ativo
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     JOIN tatuadores t ON t.id = s.tatuador_id
     WHERE s.tatuador_id = $1
     LIMIT 1`,
    [tatuadorId]
  );

  if (planoResult.rows.length === 0) {
    return null;
  }

  const countResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(tipo, 'foto') = 'foto') AS fotos,
       COUNT(*) FILTER (WHERE COALESCE(tipo, 'foto') = 'video') AS videos
     FROM tatuagens
     WHERE usuario_id = $1`,
    [usuarioId]
  );

  return {
    planoId: planoResult.rows[0].plan_id,
    plano: planoResult.rows[0].name,
    limite: Number(planoResult.rows[0].portfolio_limit),
    limiteFotos: planoResult.rows[0].photo_limit === null ? null : Number(planoResult.rows[0].photo_limit),
    limiteVideos: planoResult.rows[0].video_limit === null ? null : Number(planoResult.rows[0].video_limit),
    usadoFotos: Number(countResult.rows[0].fotos || 0),
    usadoVideos: Number(countResult.rows[0].videos || 0),
    usado: Number(countResult.rows[0].fotos || 0) + Number(countResult.rows[0].videos || 0),
    statusAssinatura: planoResult.rows[0].status_assinatura,
    patrocinado: planoResult.rows[0].patrocinado === true,
    destaqueAtivo: planoResult.rows[0].destaque_ativo === true,
    highlightUntil: planoResult.rows[0].highlight_until,
  };
}

async function ensureSubscription(tatuadorId, planId = 1) {
  const existing = await pool.query(
    `SELECT tatuador_id
     FROM subscriptions
     WHERE tatuador_id = $1
     LIMIT 1`,
    [tatuadorId]
  );

  if (existing.rows.length > 0) {
    return;
  }

  await pool.query(
    `INSERT INTO subscriptions (tatuador_id, plan_id, status, patrocinado)
     VALUES ($1, $2, 'ativa', false)`,
    [tatuadorId, planId]
  );
}

async function ativarDestaqueSemanal(tatuadorId, usuarioId) {
  const highlightResult = await pool.query(
    `UPDATE tatuadores
     SET highlight_until = NOW() + INTERVAL '7 days'
     WHERE id = $1
     RETURNING highlight_until`,
    [tatuadorId]
  );

  await pool.query(
    `UPDATE subscriptions
     SET patrocinado = true,
         status = 'ativa'
     WHERE tatuador_id = $1`,
    [tatuadorId]
  );

  const assinatura = await getAssinaturaAtual(tatuadorId, usuarioId);
  return {
    highlightUntil: highlightResult.rows[0]?.highlight_until || null,
    assinatura,
  };
}

async function atualizarPlanoAssinado(tatuadorId, usuarioId, planId) {
  const planoResult = await pool.query(
    "SELECT id, name, price FROM plans WHERE id = $1",
    [planId]
  );

  if (planoResult.rows.length === 0) {
    return { error: { status: 404, body: { erro: "Plano nao encontrado" } } };
  }

  await pool.query(
    `UPDATE subscriptions
     SET plan_id = $1,
         status = 'ativa'
     WHERE tatuador_id = $2`,
    [planId, tatuadorId]
  );

  const assinatura = await getAssinaturaAtual(tatuadorId, usuarioId);
  return {
    mensagem: `Plano alterado para ${planoResult.rows[0].name}`,
    assinatura,
  };
}

async function createPaymentSessionRecord({
  usuarioId,
  tatuadorId,
  provider,
  paymentKind,
  planId = null,
  amount,
  mode,
  metadata,
}) {
  const result = await pool.query(
    `INSERT INTO payment_sessions (
       usuario_id,
       user_id,
       tatuador_id,
       provider,
       payment_kind,
       plan_id,
       amount,
       mode,
       metadata_json,
       external_reference
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      usuarioId,
      usuarioId,
      tatuadorId,
      provider,
      paymentKind,
      planId,
      amount,
      mode,
      JSON.stringify(metadata || {}),
      null,
    ]
  );

  return result.rows[0];
}

async function updatePaymentSession(id, fields) {
  const keys = Object.keys(fields);

  if (!keys.length) {
    return;
  }

  const values = keys.map((key) => fields[key]);
  const assignments = keys.map((key, index) => `${key} = $${index + 1}`);
  values.push(id);

  await pool.query(
    `UPDATE payment_sessions
     SET ${assignments.join(", ")}
     WHERE id = $${values.length}`,
    values
  );
}

async function getPaymentSessionById(paymentId) {
  const result = await pool.query(
    `SELECT *
     FROM payment_sessions
     WHERE id = $1
     LIMIT 1`,
    [paymentId]
  );

  return result.rows[0] || null;
}

async function markPaymentSessionConfirmed(paymentId, externalId = null) {
  const fields = {
    status: "confirmed",
    approved_at: new Date(),
  };

  if (externalId) {
    fields.external_id = String(externalId);
  }

  await updatePaymentSession(paymentId, fields);
}

async function applyApprovedPaymentSession(payment) {
  if (!payment) {
    return { error: { status: 404, body: { erro: "Pagamento nao encontrado" } } };
  }

  if (payment.status === "confirmed") {
    const assinatura = await getAssinaturaAtual(payment.tatuador_id, payment.usuario_id);
    return {
      mensagem: "Pagamento ja confirmado.",
      assinatura,
      highlight_until: assinatura?.highlightUntil || null,
    };
  }

  if (payment.payment_kind === "highlight") {
    const destaque = await ativarDestaqueSemanal(payment.tatuador_id, payment.usuario_id);
    return {
      mensagem: "Patrocinio semanal ativado com sucesso",
      assinatura: destaque.assinatura,
      highlight_until: destaque.highlightUntil,
    };
  }

  const plano = await atualizarPlanoAssinado(
    payment.tatuador_id,
    payment.usuario_id,
    Number(payment.plan_id)
  );

  if (plano.error) {
    return plano;
  }

  return {
    mensagem: "Plano ativado com sucesso",
    assinatura: plano.assinatura,
    highlight_until: null,
  };
}

async function listarPlanos(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, price, portfolio_limit, photo_limit, video_limit, priority
       FROM plans
       ORDER BY priority ASC, id ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao listar planos" });
  }
}

async function atualizarPerfilProfissional(req, res) {
  const usuarioId = req.usuario.id;
  const fotoPerfil = req.file ? req.file.filename : null;

  const nomeArtistico = emptyToNull(req.body.nome_artistico);
  const bio = emptyToNull(req.body.bio);
  const estado = emptyToNull(req.body.estado);
  const cidade = emptyToNull(req.body.cidade);
  const municipio = emptyToNull(req.body.municipio);
  const bairro = emptyToNull(req.body.bairro);
  const logradouro = emptyToNull(req.body.logradouro);
  const numero = emptyToNull(req.body.numero);
  const complemento = emptyToNull(req.body.complemento);
  const cep = emptyToNull(req.body.cep);
  const estilos = emptyToNull(req.body.estilos);
  const whatsapp = emptyToNull(req.body.whatsapp);
  const disponivel = parseBooleanInput(req.body.disponivel);
  const latitude = parseNullableNumber(req.body.latitude);
  const longitude = parseNullableNumber(req.body.longitude);

  try {
    const perfilAtualResult = await pool.query(
      `SELECT id, nome_artistico, cidade
       FROM tatuadores
       WHERE usuario_id = $1
       LIMIT 1`,
      [usuarioId]
    );

    if (perfilAtualResult.rows.length === 0) {
      return res.status(404).json({ mensagem: "Perfil profissional nao encontrado" });
    }

    const perfilAtual = perfilAtualResult.rows[0];
    const slug = await generateUniqueTatuadorSlug({
      nomeArtistico: nomeArtistico || perfilAtual.nome_artistico || `tatuador-${perfilAtual.id}`,
      cidade: cidade || perfilAtual.cidade,
      tatuadorId: perfilAtual.id,
    });

    await pool.query(
      `UPDATE tatuadores
       SET nome_artistico = COALESCE($1, nome_artistico),
           bio = COALESCE($2, bio),
           estado = COALESCE($3, estado),
           cidade = COALESCE($4, cidade),
           municipio = COALESCE($5, municipio),
           bairro = COALESCE($6, bairro),
           logradouro = COALESCE($7, logradouro),
           numero = COALESCE($8, numero),
           complemento = COALESCE($9, complemento),
           cep = COALESCE($10, cep),
           estilos = COALESCE($11, estilos),
           foto_perfil = COALESCE($12, foto_perfil),
           whatsapp = COALESCE($13, whatsapp),
           disponivel = COALESCE($14, disponivel),
           latitude = COALESCE($15, latitude),
           longitude = COALESCE($16, longitude),
           slug = $17
       WHERE usuario_id = $18`,
      [
        nomeArtistico,
        bio,
        estado,
        cidade,
        municipio,
        bairro,
        logradouro,
        numero,
        complemento,
        cep,
        estilos,
        fotoPerfil,
        whatsapp,
        disponivel,
        latitude,
        longitude,
        slug,
        usuarioId,
      ]
    );

    res.json({ mensagem: "Perfil profissional atualizado com sucesso", slug });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensagem: "Erro ao atualizar perfil profissional" });
  }
}

async function tornarTatuador(req, res) {
  const usuarioId = req.usuario.id;

  try {
    const tatuadorIdExistente = await getTatuadorIdByUsuarioId(usuarioId);

    if (tatuadorIdExistente) {
      return res.status(400).json({ erro: "Voce ja possui perfil de tatuador" });
    }

    const slug = await generateUniqueTatuadorSlug({
      nomeArtistico: "Meu estudio",
      cidade: null,
      tatuadorId: 0,
    });

    const result = await pool.query(
      `INSERT INTO tatuadores (usuario_id, nome_artistico, disponivel, slug)
       VALUES ($1, 'Meu estudio', true, $2)
       RETURNING id, slug`,
      [usuarioId, slug]
    );

    const tatuadorId = result.rows[0].id;

    await ensureSubscription(tatuadorId, 1);

    const usuarioResult = await pool.query(
      "SELECT id, usuario, email, is_admin, is_blocked FROM usuarios WHERE id = $1",
      [usuarioId]
    );

    const token = createAccessToken({
      ...usuarioResult.rows[0],
      tipo: "tatuador",
      is_admin: usuarioResult.rows[0].is_admin === true,
      is_blocked: usuarioResult.rows[0].is_blocked === true,
    });

    res.json({
      mensagem: "Agora voce e tatuador",
      tatuador: result.rows[0],
      token,
      tipo: "tatuador",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao criar perfil de tatuador" });
  }
}

async function getMeuPerfilProfissional(req, res) {
  const usuarioId = req.usuario.id;

  try {
    const result = await pool.query(
      "SELECT * FROM tatuadores WHERE usuario_id = $1",
      [usuarioId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ erro: "Usuario nao e tatuador" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar perfil profissional" });
  }
}

async function meuPlano(req, res) {
  const usuarioId = req.usuario.id;

  try {
    const tatuadorId = await getTatuadorIdByUsuarioId(usuarioId);

    if (!tatuadorId) {
      return res.status(403).json({ erro: "Voce nao e tatuador" });
    }

    const assinatura = await getAssinaturaAtual(tatuadorId, usuarioId);

    if (!assinatura) {
      return res.status(404).json({ erro: "Plano nao encontrado" });
    }

    res.json({
      plano_id: assinatura.planoId,
      plano: assinatura.plano,
      limite: assinatura.limite,
      usado: assinatura.usado,
      limite_fotos: assinatura.limiteFotos,
      limite_videos: assinatura.limiteVideos,
      usadas_fotos: assinatura.usadoFotos,
      usados_videos: assinatura.usadoVideos,
      status_assinatura: assinatura.statusAssinatura,
      patrocinado: assinatura.patrocinado,
      destaque_ativo: assinatura.destaqueAtivo,
      highlight_until: assinatura.highlightUntil,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar plano" });
  }
}

async function alterarPlano(req, res) {
  const usuarioId = req.usuario.id;
  const planId = Number(req.body.plan_id);
  const destaqueSemanal = req.body.highlight === true || req.body.highlight === "true";

  try {
    const tatuadorId = await getTatuadorIdByUsuarioId(usuarioId);

    if (!tatuadorId) {
      return res.status(403).json({ erro: "Voce nao e tatuador" });
    }

    await ensureSubscription(tatuadorId, 1);

    if (destaqueSemanal) {
      const destaque = await ativarDestaqueSemanal(tatuadorId, usuarioId);
      res.json({
        mensagem: "Destaque semanal ativado com sucesso",
        highlight_until: destaque.highlightUntil,
        assinatura: destaque.assinatura,
      });
      return;
    }

    if (!Number.isInteger(planId) || planId <= 0) {
      return res.status(400).json({ erro: "Plano invalido" });
    }

    const resultadoPlano = await atualizarPlanoAssinado(tatuadorId, usuarioId, planId);

    if (resultadoPlano.error) {
      return res.status(resultadoPlano.error.status).json(resultadoPlano.error.body);
    }

    res.json(resultadoPlano);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao atualizar assinatura" });
  }
}

async function criarCheckoutPagamento(req, res) {
  const usuarioId = req.usuario.id;
  const planId = Number(req.body.plan_id);
  const highlight = req.body.highlight === true || req.body.highlight === "true";
  const provider = "mercado_pago";

  try {
    const tatuadorId = await getTatuadorIdByUsuarioId(usuarioId);

    if (!tatuadorId) {
      return res.status(403).json({ erro: "Voce nao e tatuador" });
    }

    await ensureSubscription(tatuadorId, 1);

    if (highlight) {
      const amount = 25;
      const mode = env.paymentTestMode ? "test" : "live";

      if (mode === "live" && !isMercadoPagoConfigured()) {
        console.error("[checkout] Mercado Pago nao configurado para checkout ao vivo", {
          usuarioId,
          tatuadorId,
          paymentKind: "highlight",
          mode,
        });
        return res.status(500).json({ erro: "Mercado Pago nao configurado neste ambiente" });
      }

      const payment = await createPaymentSessionRecord({
        usuarioId,
        tatuadorId,
        provider,
        paymentKind: "highlight",
        amount,
        mode,
        metadata: { label: "Destaque semanal" },
      });

      let checkoutUrl = `/pagamento-sucesso.html?payment_id=${payment.id}&provider=mercado_pago&mode=${mode}`;
      let externalId = null;

      if (mode === "live") {
        const preference = await createMercadoPagoPreference({
          req,
          paymentId: payment.id,
          amount,
          title: "Destaque semanal TattooMatch",
          description: "Patrocinio semanal para aparecer no topo da busca por 7 dias.",
        });

        checkoutUrl = preference.init_point;
        externalId = preference.id;
      }

      await updatePaymentSession(payment.id, {
        external_id: externalId,
        checkout_url: checkoutUrl,
        external_reference: String(payment.id),
      });

      console.info("[checkout] Checkout criado", {
        paymentId: payment.id,
        usuarioId,
        tatuadorId,
        provider,
        paymentKind: "highlight",
        mode,
      });

      return res.json({
        mensagem: mode === "test"
          ? "Checkout de patrocinio criado em modo teste."
          : "Checkout Mercado Pago criado com sucesso.",
        payment_id: payment.id,
        checkout_url: checkoutUrl,
        provider,
        mode,
      });
    }

    if (!Number.isInteger(planId) || ![2, 3].includes(planId)) {
      return res.status(400).json({ erro: "Plano pago invalido" });
    }

    const planoResult = await pool.query(
      "SELECT id, name, price FROM plans WHERE id = $1",
      [planId]
    );

    if (planoResult.rows.length === 0) {
      return res.status(404).json({ erro: "Plano nao encontrado" });
    }

    const plano = planoResult.rows[0];
    const amount = Number(plano.price || 0);
    const mode = env.paymentTestMode ? "test" : "live";

    if (mode === "live" && !isMercadoPagoConfigured()) {
      console.error("[checkout] Mercado Pago nao configurado para checkout ao vivo", {
        usuarioId,
        tatuadorId,
        planId,
        paymentKind: "plan",
        mode,
      });
      return res.status(500).json({ erro: "Mercado Pago nao configurado neste ambiente" });
    }

    const payment = await createPaymentSessionRecord({
      usuarioId,
      tatuadorId,
      provider,
      paymentKind: "plan",
      planId,
      amount,
      mode,
      metadata: { planName: plano.name },
    });

    let checkoutUrl = `/pagamento-sucesso.html?payment_id=${payment.id}&provider=mercado_pago&mode=${mode}`;
    let externalId = null;

    if (mode === "live") {
      const preference = await createMercadoPagoPreference({
        req,
        paymentId: payment.id,
        amount,
        title: `Plano ${plano.name} TattooMatch`,
        description: `Assinatura mensal do plano ${plano.name} no TattooMatch.`,
      });

      checkoutUrl = preference.init_point;
      externalId = preference.id;
    }

    await updatePaymentSession(payment.id, {
      external_id: externalId,
      checkout_url: checkoutUrl,
      external_reference: String(payment.id),
    });

    console.info("[checkout] Checkout criado", {
      paymentId: payment.id,
      usuarioId,
      tatuadorId,
      provider,
      paymentKind: "plan",
      planId,
      mode,
    });

    res.json({
      mensagem: mode === "test"
        ? "Checkout Mercado Pago criado em modo teste."
        : "Checkout Mercado Pago criado com sucesso.",
      payment_id: payment.id,
      checkout_url: checkoutUrl,
      provider,
      mode,
    });
  } catch (error) {
    console.error("[checkout] Falha ao criar checkout Mercado Pago", {
      usuarioId,
      planId,
      highlight,
      provider,
      error: error.message,
    });
    res.status(500).json({
      erro: "Nao foi possivel iniciar o checkout do Mercado Pago",
      detalhe: error.message,
    });
  }
}

async function confirmarCheckoutPagamento(req, res) {
  const usuarioId = req.usuario.id;
  const paymentId = Number(req.body.payment_id);
  const sessionId = emptyToNull(req.body.session_id);

  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return res.status(400).json({ erro: "Pagamento invalido" });
  }

  try {
    const paymentResult = await pool.query(
      `SELECT *
       FROM payment_sessions
       WHERE id = $1
         AND usuario_id = $2
       LIMIT 1`,
      [paymentId, usuarioId]
    );

    if (paymentResult.rows.length === 0) {
      console.warn("[checkout] Tentativa de confirmar sessao inexistente", {
        paymentId,
        usuarioId,
      });
      return res.status(404).json({ erro: "Pagamento nao encontrado" });
    }

    const payment = paymentResult.rows[0];

    if (payment.status === "confirmed") {
      const assinatura = await getAssinaturaAtual(payment.tatuador_id, usuarioId);
      return res.json({
        mensagem: "Pagamento ja confirmado.",
        assinatura,
        highlight_until: assinatura?.highlightUntil || null,
      });
    }

    let aprovado = false;
    let externalId = sessionId || payment.external_id || null;

    if (payment.mode === "test") {
      aprovado = true;
    } else if (payment.provider === "mercado_pago") {
      const mpPayment = await findMercadoPagoApprovedPayment(payment.id);
      aprovado = Boolean(mpPayment);
      externalId = mpPayment?.id ? String(mpPayment.id) : externalId;
    }

    if (!aprovado) {
      console.warn("[checkout] Pagamento ainda nao aprovado na confirmacao", {
        paymentId: payment.id,
        usuarioId,
        provider: payment.provider,
        mode: payment.mode,
      });
      return res.status(400).json({ erro: "Pagamento ainda nao foi aprovado" });
    }

    const resultado = await applyApprovedPaymentSession(payment);

    if (resultado.error) {
      return res.status(resultado.error.status).json(resultado.error.body);
    }

    await markPaymentSessionConfirmed(payment.id, externalId);

    console.info("[checkout] Pagamento confirmado", {
      paymentId: payment.id,
      usuarioId,
      provider: payment.provider,
      mode: payment.mode,
      externalId,
    });

    res.json({
      ...resultado,
      payment_id: payment.id,
      provider: payment.provider,
      mode: payment.mode,
    });
  } catch (error) {
    console.error("[checkout] Falha ao confirmar pagamento", {
      paymentId,
      usuarioId,
      error: error.message,
    });
    res.status(500).json({
      erro: "Nao foi possivel confirmar o pagamento",
      detalhe: error.message,
    });
  }
}

async function webhookPagamento(req, res) {
  try {
    const parsedBody = parseWebhookJsonBody(req.body);

    if (env.paymentTestMode && req.headers["x-payment-test-mode"] === "true") {
      const paymentId = Number(parsedBody.payment_id || req.query.payment_id);
      const payment = await getPaymentSessionById(paymentId);

      if (!payment) {
        console.warn("[webhook] Sessao de pagamento de teste nao encontrada", {
          paymentId,
        });
        return res.status(404).json({ erro: "Sessao de pagamento nao encontrada" });
      }

      const resultado = await applyApprovedPaymentSession(payment);

      if (resultado.error) {
        return res.status(resultado.error.status).json(resultado.error.body);
      }

      await markPaymentSessionConfirmed(payment.id, parsedBody.external_id || "test-webhook");
      console.info("[webhook] Pagamento de teste confirmado", {
        paymentId: payment.id,
        provider: payment.provider,
      });
      return res.json({ ok: true, provider: payment.provider, payment_id: payment.id, mode: "test" });
    }

    const provider = String(req.query.provider || parsedBody.provider || "").trim().toLowerCase();

    if (provider !== "mercado_pago") {
      console.warn("[webhook] Provider nao suportado", {
        provider,
      });
      return res.status(400).json({ erro: "Provider de webhook nao suportado" });
    }

    if (!env.mercadoPagoWebhookToken || String(req.query.token || "") !== env.mercadoPagoWebhookToken) {
      console.warn("[webhook] Webhook Mercado Pago nao autorizado", {
        provider,
      });
      return res.status(401).json({ erro: "Webhook Mercado Pago nao autorizado" });
    }

    const paymentGatewayId = parsedBody?.data?.id || req.query["data.id"] || req.query.id;

    if (!paymentGatewayId) {
      console.info("[webhook] Evento ignorado sem payment gateway id", {
        provider,
      });
      return res.json({ ok: true, ignored: true });
    }

    const mpPayment = await fetchMercadoPagoPaymentById(paymentGatewayId);

    if (mpPayment?.status !== "approved") {
      console.info("[webhook] Pagamento ainda nao aprovado", {
        provider,
        paymentGatewayId,
        status: mpPayment?.status || null,
      });
      return res.json({ ok: true, ignored: true });
    }

    const paymentId = Number(mpPayment.external_reference);
    const payment = await getPaymentSessionById(paymentId);

    if (!payment) {
      console.warn("[webhook] Sessao local nao encontrada para pagamento aprovado", {
        provider,
        paymentGatewayId,
        paymentId,
      });
      return res.status(404).json({ erro: "Sessao de pagamento nao encontrada" });
    }

    const resultado = await applyApprovedPaymentSession(payment);

    if (resultado.error) {
      return res.status(resultado.error.status).json(resultado.error.body);
    }

    await markPaymentSessionConfirmed(payment.id, paymentGatewayId);
    console.info("[webhook] Pagamento confirmado com sucesso", {
      provider,
      paymentGatewayId,
      paymentId: payment.id,
    });
    return res.json({ ok: true, provider: "mercado_pago", payment_id: payment.id });
  } catch (error) {
    console.error("[webhook] Falha ao processar webhook Mercado Pago", {
      provider: String(req.query.provider || "").trim().toLowerCase() || null,
      queryPaymentId: req.query.payment_id || req.query["data.id"] || req.query.id || null,
      error: error.message,
    });
    res.status(500).json({
      erro: "Erro ao processar webhook de pagamento",
      detalhe: error.message,
    });
  }
}

module.exports = {
  alterarPlano,
  confirmarCheckoutPagamento,
  criarCheckoutPagamento,
  atualizarPerfilProfissional,
  getMeuPerfilProfissional,
  listarPlanos,
  meuPlano,
  tornarTatuador,
  webhookPagamento,
};
