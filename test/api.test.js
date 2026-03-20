const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../src/app");
const pool = require("../src/config/db");
const { ensureUserSchema } = require("../src/helpers/userSchema");

let server;
let baseUrl;

async function cleanupUserByUsername(usuario) {
  const userResult = await pool.query(
    "SELECT id FROM usuarios WHERE usuario = $1",
    [usuario]
  );

  if (userResult.rows.length === 0) {
    return;
  }

  const userId = userResult.rows[0].id;

  const agendamentoImages = await pool.query(
    `SELECT a.imagem_referencia
     FROM agendamentos a
     LEFT JOIN tatuadores t ON t.id = a.tatuador_id
     WHERE (a.cliente_id = $1 OR t.usuario_id = $1)
     AND a.imagem_referencia IS NOT NULL`,
    [userId]
  );

  const tatuagemImages = await pool.query(
    "SELECT imagem FROM tatuagens WHERE usuario_id = $1 AND imagem IS NOT NULL",
    [userId]
  );

  await pool.query("DELETE FROM analytics_eventos WHERE usuario_id = $1", [userId]);
  await pool.query("DELETE FROM password_reset_tokens WHERE usuario_id = $1", [userId]);
  await pool.query(
    `DELETE FROM payment_sessions
     WHERE usuario_id = $1
        OR tatuador_id IN (SELECT id FROM tatuadores WHERE usuario_id = $1)`,
    [userId]
  );
  await pool.query(
    `DELETE FROM agendamentos
     WHERE cliente_id = $1
     OR tatuador_id IN (SELECT id FROM tatuadores WHERE usuario_id = $1)`,
    [userId]
  );
  await pool.query("DELETE FROM tatuagens WHERE usuario_id = $1", [userId]);
  await pool.query(
    "DELETE FROM subscriptions WHERE tatuador_id IN (SELECT id FROM tatuadores WHERE usuario_id = $1)",
    [userId]
  );
  await pool.query("DELETE FROM tatuadores WHERE usuario_id = $1", [userId]);
  await pool.query("DELETE FROM usuarios WHERE id = $1", [userId]);

  for (const item of agendamentoImages.rows) {
    if (item.imagem_referencia) {
      fs.rmSync(path.join(process.cwd(), "uploads", item.imagem_referencia), {
        force: true,
      });
    }
  }

  for (const item of tatuagemImages.rows) {
    if (item.imagem) {
      fs.rmSync(path.join(process.cwd(), "uploads", item.imagem), {
        force: true,
      });
    }
  }
}

async function promoteUserToAdmin(usuario) {
  await ensureUserSchema();

  const result = await pool.query(
    `UPDATE usuarios
     SET is_admin = true
     WHERE usuario = $1
     RETURNING id`,
    [usuario]
  );

  return result.rows[0] || null;
}

async function createAndLoginUser(prefix) {
  const suffix = Date.now();
  const usuario = `${prefix}${suffix}`;
  const email = `${prefix}${suffix}@example.com`;
  const senha = "123456";

  await cleanupUserByUsername(usuario);

  const register = await request("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, email, senha }),
  });

  assert.equal(register.response.status, 201);

  const login = await request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, senha }),
  });

  assert.equal(login.response.status, 200);

  return {
    usuario,
    email,
    senha,
    token: login.body.token,
    tipo: login.body.tipo,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();

  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}

  return { response, body };
}

function toSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

test.before(async () => {
  await app.prepare();
  await ensureUserSchema();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await pool.end();
});

test("GET /tatuadores retorna uma lista", async () => {
  const { response, body } = await request("/tatuadores");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body));
});

test("GET /ranking retorna uma lista", async () => {
  const { response, body } = await request("/ranking");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body));
});

test("pagina SEO por cidade gera title, description e robots", async () => {
  const cidadeResult = await pool.query(
    "SELECT cidade FROM tatuadores WHERE cidade IS NOT NULL AND cidade <> '' LIMIT 1"
  );

  assert.ok(cidadeResult.rows.length > 0);

  const cidade = cidadeResult.rows[0].cidade;
  const slug = toSlug(cidade);
  const { response, body } = await request(`/tatuadores/${encodeURIComponent(slug)}`);

  assert.equal(response.status, 200);
  assert.match(body, /<title>Melhores tatuadores em .* \| TattooMatch<\/title>/);
  assert.match(body, /<meta name="description" content="[^"]+">/);
  assert.match(body, /<meta name="robots" content="index,follow">/);
  assert.equal(response.headers.get("x-robots-tag"), "index, follow");
});

test("pagina SEO por estilo gera HTML indexavel", async () => {
  const estiloResult = await pool.query(
    "SELECT estilos FROM tatuadores WHERE estilos IS NOT NULL AND estilos <> '' LIMIT 1"
  );

  assert.ok(estiloResult.rows.length > 0);

  const estilo = estiloResult.rows[0].estilos.split(",")[0].trim();
  const slug = toSlug(estilo);
  const { response, body } = await request(`/tatuadores/estilo/${encodeURIComponent(slug)}`);

  assert.equal(response.status, 200);
  assert.match(body, /<meta name="description" content="[^"]+">/);
  assert.match(body, /<meta name="robots" content="index,follow">/);
  assert.match(body, /Lista de tatuadores/);
});

test("sitemap.xml lista paginas principais e URLs SEO", async () => {
  const { response, body } = await request("/sitemap.xml");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/xml|text\/xml/);
  assert.match(body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(body, /<loc>http:\/\/localhost:3000\/tatuadores\.html<\/loc>|<loc>http:\/\/127\.0\.0\.1:\d+\/tatuadores\.html<\/loc>/);
  assert.match(body, /\/tatuadores\/estilo\//);
  assert.match(body, /\/perfil\//);
});

test("GET /tatuador/:id retorna perfil publico completo", async () => {
  const { response, body } = await request("/tatuador/1");

  assert.equal(response.status, 200);
  assert.equal(body.tatuador.id, 1);
  assert.ok(Array.isArray(body.portfolio));
  assert.ok(Array.isArray(body.avaliacoes));
  assert.equal(typeof body.views, "number");
});

test("GET /tatuador/:slug retorna perfil publico completo", async () => {
  const slugResult = await pool.query(
    `SELECT id, slug
     FROM tatuadores
     WHERE slug IS NOT NULL AND slug <> ''
     ORDER BY id ASC
     LIMIT 1`
  );

  assert.ok(slugResult.rows.length > 0);

  const { response, body } = await request(`/tatuador/${encodeURIComponent(slugResult.rows[0].slug)}`);

  assert.equal(response.status, 200);
  assert.equal(body.tatuador.id, slugResult.rows[0].id);
  assert.equal(body.tatuador.slug, slugResult.rows[0].slug);
});

test("GET /perfil/:slug entrega SEO on-page dinamico", async () => {
  const perfilResult = await pool.query(
    `SELECT slug, nome_artistico
     FROM tatuadores
     WHERE slug IS NOT NULL AND slug <> ''
     ORDER BY id ASC
     LIMIT 1`
  );

  assert.ok(perfilResult.rows.length > 0);

  const { response, body } = await request(`/perfil/${encodeURIComponent(perfilResult.rows[0].slug)}`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(body, /<title>.*TattooMatch<\/title>/);
  assert.match(body, /<meta name="description" content="[^"]+">/);
  assert.match(body, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/perfil\//);
  assert.match(body, /<meta property="og:title" content="[^"]+">/);
  assert.match(body, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(body, /<script type="application\/ld\+json" id="seoJsonLd">/);
  assert.ok(body.includes(`<h1 id="nome">${perfilResult.rows[0].nome_artistico}`));
});

test("fluxo de cadastro, login, perfil e tornar tatuador funciona", async () => {
  const user = await createAndLoginUser("testapi");

  try {
    assert.equal(user.tipo, "cliente");

    const perfil = await request("/perfil", {
      headers: { Authorization: `Bearer ${user.token}` },
    });

    assert.equal(perfil.response.status, 200);
    assert.equal(perfil.body.usuario, user.usuario);

    const tornarTatuador = await request("/tornar-tatuador", {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` },
    });

    assert.equal(tornarTatuador.response.status, 200);
    assert.equal(tornarTatuador.body.tipo, "tatuador");
    assert.ok(tornarTatuador.body.token);
    assert.equal(typeof tornarTatuador.body.tatuador.slug, "string");

    const meuPlano = await request("/meu-plano", {
      headers: { Authorization: `Bearer ${tornarTatuador.body.token}` },
    });

    assert.equal(meuPlano.response.status, 200);
    assert.equal(meuPlano.body.plano, "Free");

    const perfilProfissional = await request("/perfil-profissional", {
      headers: { Authorization: `Bearer ${tornarTatuador.body.token}` },
    });

    assert.equal(perfilProfissional.response.status, 200);
    assert.equal(typeof perfilProfissional.body.slug, "string");
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("rota de tatuador bloqueia cliente autenticado", async () => {
  const user = await createAndLoginUser("clientrole");

  try {
    const result = await request("/agendamentos/novos", {
      headers: { Authorization: `Bearer ${user.token}` },
    });

    assert.equal(result.response.status, 403);
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("fluxo de agendamento funciona por token e por email", async () => {
  const user = await createAndLoginUser("agendaapi");

  try {
    const payload = {
      cliente_nome: "Teste Agenda",
      cliente_email: user.email,
      cliente_whatsapp: "31999999999",
      descricao: "Tattoo teste agenda",
      parte_corpo: "braco",
      tamanho: "medio",
      data_solicitada: "2026-03-21",
      tatuador_id: 1,
    };

    const create = await request("/agendamentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(create.response.status, 201);
    assert.equal(create.body.tatuador_id, 1);

    const byToken = await request("/meus-agendamentos", {
      headers: { Authorization: `Bearer ${user.token}` },
    });

    assert.equal(byToken.response.status, 200);
    assert.ok(byToken.body.some((item) => item.id === create.body.id));

    const byEmail = await request(`/meus-agendamentos/${user.email}`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });

    assert.equal(byEmail.response.status, 200);
    assert.ok(byEmail.body.some((item) => item.id === create.body.id));
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("analytics registra eventos e retorna resumo autenticado", async () => {
  const user = await createAndLoginUser("analyticsapi");

  try {
    await promoteUserToAdmin(user.usuario);

    const adminLogin = await request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: user.usuario, senha: user.senha }),
    });

    assert.equal(adminLogin.response.status, 200);
    assert.equal(adminLogin.body.is_admin, true);

    const perfil = await request("/tatuador/1", {
      headers: { Authorization: `Bearer ${adminLogin.body.token}` },
    });

    assert.equal(perfil.response.status, 200);

    const agendamento = await request("/agendamentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminLogin.body.token}`,
      },
      body: JSON.stringify({
        cliente_nome: "Analytics User",
        cliente_email: user.email,
        cliente_whatsapp: "31999999999",
        descricao: "Tattoo analytics",
        parte_corpo: "braco",
        tamanho: "medio",
        data_solicitada: "2026-03-25",
        tatuador_id: 1,
      }),
    });

    assert.equal(agendamento.response.status, 201);

    const analytics = await request("/admin/analytics", {
      headers: { Authorization: `Bearer ${adminLogin.body.token}` },
    });

    assert.equal(analytics.response.status, 200);
    assert.equal(typeof analytics.body.totalUsuarios, "number");
    assert.equal(typeof analytics.body.totalTatuadores, "number");
    assert.equal(typeof analytics.body.totalAgendamentos, "number");
    assert.ok(Array.isArray(analytics.body.perfisMaisVisitados));

    const userResult = await pool.query(
      "SELECT id FROM usuarios WHERE usuario = $1",
      [user.usuario]
    );

    const events = await pool.query(
      `SELECT tipo_evento, pagina
       FROM analytics_eventos
       WHERE usuario_id = $1`,
      [userResult.rows[0].id]
    );

    const tipos = events.rows.map((item) => item.tipo_evento);

    assert.ok(tipos.includes("cadastro"));
    assert.ok(tipos.includes("login"));
    assert.ok(tipos.includes("visita_perfil"));
    assert.ok(tipos.includes("agendamento_criado"));
    const slugResult = await pool.query(
      "SELECT slug FROM tatuadores WHERE id = 1"
    );

    const perfilPath = slugResult.rows[0]?.slug
      ? `/perfil/${slugResult.rows[0].slug}`
      : "/perfil.html?id=1";

    assert.ok(events.rows.some((item) => item.pagina === perfilPath));
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("analytics exige permissao de administrador", async () => {
  const user = await createAndLoginUser("analyticsdeny");

  try {
    const result = await request("/admin/analytics", {
      headers: { Authorization: `Bearer ${user.token}` },
    });

    assert.equal(result.response.status, 403);
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("admin pode listar usuarios e promover outro usuario", async () => {
  const admin = await createAndLoginUser("adminmanage");
  const target = await createAndLoginUser("adminmanaged");

  try {
    await promoteUserToAdmin(admin.usuario);

    const adminLogin = await request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: admin.usuario, senha: admin.senha }),
    });

    assert.equal(adminLogin.response.status, 200);
    assert.equal(adminLogin.body.is_admin, true);

    const lista = await request("/admin/usuarios", {
      headers: { Authorization: `Bearer ${adminLogin.body.token}` },
    });

    assert.equal(lista.response.status, 200);
    assert.ok(Array.isArray(lista.body));
    assert.ok(lista.body.some((item) => item.usuario === target.usuario && item.is_admin === false));

    const targetId = lista.body.find((item) => item.usuario === target.usuario).id;

    const promote = await request(`/admin/usuarios/${targetId}/admin`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminLogin.body.token}`,
      },
      body: JSON.stringify({ is_admin: true }),
    });

    assert.equal(promote.response.status, 200);
    assert.equal(promote.body.usuario.is_admin, true);

    const targetLogin = await request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: target.usuario, senha: target.senha }),
    });

    assert.equal(targetLogin.response.status, 200);
    assert.equal(targetLogin.body.is_admin, true);
  } finally {
    await cleanupUserByUsername(admin.usuario);
    await cleanupUserByUsername(target.usuario);
  }
});

test("dashboard administrativo retorna totais da plataforma", async () => {
  const admin = await createAndLoginUser("admindashboard");

  try {
    await promoteUserToAdmin(admin.usuario);

    const adminLogin = await request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: admin.usuario, senha: admin.senha }),
    });

    const dashboard = await request("/admin/dashboard", {
      headers: { Authorization: `Bearer ${adminLogin.body.token}` },
    });

    assert.equal(dashboard.response.status, 200);
    assert.equal(typeof dashboard.body.totalUsuarios, "number");
    assert.equal(typeof dashboard.body.totalTatuadores, "number");
    assert.equal(typeof dashboard.body.totalAgendamentos, "number");
    assert.equal(typeof dashboard.body.totalAvaliacoes, "number");
  } finally {
    await cleanupUserByUsername(admin.usuario);
  }
});

test("admin pode bloquear usuario e impedir login e acesso autenticado", async () => {
  const admin = await createAndLoginUser("adminblocker");
  const alvo = await createAndLoginUser("blockeduser");

  try {
    await promoteUserToAdmin(admin.usuario);
    const alvoId = await getUserId(alvo.usuario);

    const adminLogin = await request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: admin.usuario, senha: admin.senha }),
    });

    const block = await request(`/admin/usuarios/bloquear/${alvoId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminLogin.body.token}` },
    });

    assert.equal(block.response.status, 200);
    assert.equal(block.body.usuario.is_blocked, true);

    const blockedLogin = await request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: alvo.usuario, senha: alvo.senha }),
    });

    assert.equal(blockedLogin.response.status, 403);

    const perfil = await request("/perfil", {
      headers: { Authorization: `Bearer ${alvo.token}` },
    });

    assert.equal(perfil.response.status, 403);
  } finally {
    await cleanupUserByUsername(admin.usuario);
    await cleanupUserByUsername(alvo.usuario);
  }
});

test("admin pode remover avaliacao e imagem do portfolio", async () => {
  const admin = await createAndLoginUser("adminmoderator");
  const comentario = `teste-admin-del-${Date.now()}`;

  try {
    await promoteUserToAdmin(admin.usuario);

    const adminLogin = await request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: admin.usuario, senha: admin.senha }),
    });

    const avaliacao = await request("/avaliar/rafael", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminLogin.body.token}`,
      },
      body: JSON.stringify({ nota: 4, comentario }),
    });

    assert.equal(avaliacao.response.status, 201);

    const avaliacaoDb = await pool.query(
      "SELECT id FROM avaliacoes WHERE comentario = $1",
      [comentario]
    );

    const deleteAvaliacao = await request(`/admin/avaliacoes/${avaliacaoDb.rows[0].id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminLogin.body.token}` },
    });

    assert.equal(deleteAvaliacao.response.status, 200);

    const avaliacaoCheck = await pool.query(
      "SELECT id FROM avaliacoes WHERE comentario = $1",
      [comentario]
    );

    assert.equal(avaliacaoCheck.rows.length, 0);

    const tatuadorOwner = await pool.query(
      "SELECT usuario_id FROM tatuadores WHERE id = 1"
    );

    const imageName = `admin-test-${Date.now()}.jpg`;
    const imagePath = path.join(process.cwd(), "uploads", imageName);
    fs.writeFileSync(imagePath, "admin-test-image");

    const tatuagemDb = await pool.query(
      `INSERT INTO tatuagens (usuario_id, imagem, descricao, estilo)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [tatuadorOwner.rows[0].usuario_id, imageName, "Imagem de teste", "teste"]
    );

    const deletePortfolio = await request(`/admin/portfolio/${tatuagemDb.rows[0].id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminLogin.body.token}` },
    });

    assert.equal(deletePortfolio.response.status, 200);

    const portfolioCheck = await pool.query(
      "SELECT id FROM tatuagens WHERE id = $1",
      [tatuagemDb.rows[0].id]
    );

    assert.equal(portfolioCheck.rows.length, 0);
    assert.equal(fs.existsSync(imagePath), false);
  } finally {
    await pool.query("DELETE FROM avaliacoes WHERE comentario = $1", [comentario]);
    await cleanupUserByUsername(admin.usuario);
  }
});

async function getUserId(usuario) {
  const result = await pool.query(
    "SELECT id FROM usuarios WHERE usuario = $1",
    [usuario]
  );

  return result.rows[0]?.id;
}

test("rotas sensiveis de agendamento exigem autenticacao e acesso correto", async () => {
  const user = await createAndLoginUser("agendaauth");
  const otherUser = await createAndLoginUser("agendaother");

  try {
    const noAuth = await request(`/meus-agendamentos/${user.email}`);
    assert.equal(noAuth.response.status, 401);

    const wrongUser = await request(`/meus-agendamentos/${user.email}`, {
      headers: { Authorization: `Bearer ${otherUser.token}` },
    });
    assert.equal(wrongUser.response.status, 403);

    const tatuadorNoAuth = await request("/tatuador/1/agendamentos");
    assert.equal(tatuadorNoAuth.response.status, 401);
  } finally {
    await cleanupUserByUsername(user.usuario);
    await cleanupUserByUsername(otherUser.usuario);
  }
});

test("POST /avaliar/:usuario cria avaliacao para o tatuador", async () => {
  const user = await createAndLoginUser("avaliadorapi");
  const comentario = `teste-aval-${Date.now()}`;

  try {
    const result = await request("/avaliar/rafael", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ nota: 5, comentario }),
    });

    assert.equal(result.response.status, 201);

    const check = await pool.query(
      "SELECT comentario, usuario_id FROM avaliacoes WHERE comentario = $1",
      [comentario]
    );

    assert.equal(check.rows.length, 1);
    const userId = await getUserId(user.usuario);
    assert.equal(check.rows[0].usuario_id, userId);
  } finally {
    await pool.query("DELETE FROM avaliacoes WHERE comentario = $1", [comentario]);
    await cleanupUserByUsername(user.usuario);
  }
});

test("fluxo de recuperacao de senha gera token e redefine acesso", async () => {
  const user = await createAndLoginUser("recoverapi");

  try {
    const forgot = await request("/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email }),
    });

    assert.equal(forgot.response.status, 200);
    assert.equal(typeof forgot.body.mensagem, "string");
    assert.equal(typeof forgot.body.preview_url, "string");

    const token = new URL(forgot.body.preview_url).searchParams.get("token");
    assert.ok(token);

    const validate = await request(`/reset-password/validate?token=${encodeURIComponent(token)}`);
    assert.equal(validate.response.status, 200);

    const reset = await request("/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, nova_senha: "654321" }),
    });

    assert.equal(reset.response.status, 200);

    const login = await request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: user.usuario, senha: "654321" }),
    });

    assert.equal(login.response.status, 200);
    assert.ok(login.body.token);
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("agendamento aceita imagem de referencia em multipart", async () => {
  const user = await createAndLoginUser("agendaimagem");

  try {
    const formData = new FormData();
    formData.append("cliente_nome", "Cliente Imagem");
    formData.append("cliente_email", user.email);
    formData.append("cliente_whatsapp", "31999999999");
    formData.append("descricao", "Tattoo teste com imagem");
    formData.append("parte_corpo", "braco");
    formData.append("tamanho", "medio");
    formData.append("data_solicitada", "2026-03-28");
    formData.append("tatuador_id", "1");
    formData.append(
      "imagem_referencia",
      new Blob(["fake-image"], { type: "image/png" }),
      "referencia.png"
    );

    const response = await fetch(`${baseUrl}/agendamentos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user.token}`,
      },
      body: formData,
    });

    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(typeof body.imagem_referencia, "string");
    assert.equal(
      fs.existsSync(path.join(process.cwd(), "uploads", body.imagem_referencia)),
      true
    );
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("portfolio aceita video e respeita limite de videos do plano Free", async () => {
  const user = await createAndLoginUser("portfoliovideo");

  try {
    const tornarTatuador = await request("/tornar-tatuador", {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` },
    });

    assert.equal(tornarTatuador.response.status, 200);

    const primeiroVideo = new FormData();
    primeiroVideo.append("estilo", "fineline");
    primeiroVideo.append("descricao", "Video do portfolio");
    primeiroVideo.append(
      "arquivo",
      new Blob(["fake-video"], { type: "video/mp4" }),
      "portfolio.mp4"
    );

    const response1 = await fetch(`${baseUrl}/tatuagens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tornarTatuador.body.token}`,
      },
      body: primeiroVideo,
    });

    const body1 = await response1.json();

    assert.equal(response1.status, 201);
    assert.equal(body1.tatuagem.tipo, "video");

    const segundoVideo = new FormData();
    segundoVideo.append("estilo", "fineline");
    segundoVideo.append("descricao", "Segundo video do portfolio");
    segundoVideo.append(
      "arquivo",
      new Blob(["fake-video-2"], { type: "video/mp4" }),
      "portfolio-2.mp4"
    );

    const response2 = await fetch(`${baseUrl}/tatuagens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tornarTatuador.body.token}`,
      },
      body: segundoVideo,
    });

    const body2 = await response2.json();

    assert.equal(response2.status, 403);
    assert.match(body2.mensagem, /1 video\(s\)/);
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("agendamento aceita parte do corpo com texto livre valido", async () => {
  const user = await createAndLoginUser("agendaparte");

  try {
    const create = await request("/agendamentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        cliente_nome: "Teste Parte",
        cliente_email: user.email,
        cliente_whatsapp: "31999999999",
        descricao: "Tattoo teste com parte livre",
        parte_corpo: "  dedo mindinho  ",
        tamanho: "medio",
        data_solicitada: "2026-03-29",
        tatuador_id: 1,
      }),
    });

    assert.equal(create.response.status, 201);
    assert.equal(create.body.parte_corpo, "dedo mindinho");
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("agendamento aceita tamanho com texto livre valido", async () => {
  const user = await createAndLoginUser("agendatamanho");

  try {
    const create = await request("/agendamentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        cliente_nome: "Teste Tamanho",
        cliente_email: user.email,
        cliente_whatsapp: "31999999999",
        descricao: "Tattoo teste com tamanho livre",
        parte_corpo: "costela lateral",
        tamanho: "  80cm  ",
        data_solicitada: "2026-03-30",
        tatuador_id: 1,
      }),
    });

    assert.equal(create.response.status, 201);
    assert.equal(create.body.tamanho, "80cm");
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("chat de agendamento permite conversa entre cliente e tatuador com controle de acesso", async () => {
  const cliente = await createAndLoginUser("chatcliente");
  const tatuador = await createAndLoginUser("chattatuador");
  const intruso = await createAndLoginUser("chatintruso");

  try {
    const tornarTatuador = await request("/tornar-tatuador", {
      method: "POST",
      headers: { Authorization: `Bearer ${tatuador.token}` },
    });

    assert.equal(tornarTatuador.response.status, 200);

    const perfil = await request("/perfil-profissional", {
      headers: { Authorization: `Bearer ${tornarTatuador.body.token}` },
    });

    assert.equal(perfil.response.status, 200);
    assert.ok(perfil.body.id);

    const create = await request("/agendamentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cliente.token}`,
      },
      body: JSON.stringify({
        cliente_nome: "Cliente Chat",
        cliente_email: cliente.email,
        cliente_whatsapp: "31999999999",
        descricao: "Quero conversar antes de fechar",
        parte_corpo: "braco",
        tamanho: "medio",
        data_solicitada: "2026-03-29",
        tatuador_id: perfil.body.id,
      }),
    });

    assert.equal(create.response.status, 201);

    const emptyChat = await request(`/agendamentos/${create.body.id}/chat`, {
      headers: { Authorization: `Bearer ${cliente.token}` },
    });

    assert.equal(emptyChat.response.status, 200);
    assert.ok(Array.isArray(emptyChat.body.mensagens));
    assert.equal(emptyChat.body.mensagens.length, 0);

    const sendCliente = await request(`/agendamentos/${create.body.id}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cliente.token}`,
      },
      body: JSON.stringify({ mensagem: "Oi, voce atende blackwork?" }),
    });

    assert.equal(sendCliente.response.status, 201);
    assert.equal(sendCliente.body.item.remetente_tipo, "cliente");

    const listarTatuador = await request(`/agendamentos/${create.body.id}/chat`, {
      headers: { Authorization: `Bearer ${tornarTatuador.body.token}` },
    });

    assert.equal(listarTatuador.response.status, 200);
    assert.equal(listarTatuador.body.mensagens.length, 1);
    assert.equal(listarTatuador.body.mensagens[0].remetente_tipo, "cliente");
    assert.ok(listarTatuador.body.mensagens[0].lida_em);

    const sendTatuador = await request(`/agendamentos/${create.body.id}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tornarTatuador.body.token}`,
      },
      body: JSON.stringify({ mensagem: "Atendo sim, pode mandar referencias." }),
    });

    assert.equal(sendTatuador.response.status, 201);
    assert.equal(sendTatuador.body.item.remetente_tipo, "tatuador");

    const listarCliente = await request(`/agendamentos/${create.body.id}/chat`, {
      headers: { Authorization: `Bearer ${cliente.token}` },
    });

    assert.equal(listarCliente.response.status, 200);
    assert.equal(listarCliente.body.mensagens.length, 2);
    assert.equal(listarCliente.body.mensagens[1].remetente_tipo, "tatuador");
    assert.ok(listarCliente.body.mensagens[1].lida_em);

    const acessoIntruso = await request(`/agendamentos/${create.body.id}/chat`, {
      headers: { Authorization: `Bearer ${intruso.token}` },
    });

    assert.equal(acessoIntruso.response.status, 403);
  } finally {
    await cleanupUserByUsername(cliente.usuario);
    await cleanupUserByUsername(tatuador.usuario);
    await cleanupUserByUsername(intruso.usuario);
  }
});

test("agenda do tatuador retorna agendamentos agrupados por dia", async () => {
  const cliente = await createAndLoginUser("agendacliente");
  const tatuador = await createAndLoginUser("agendatatuador");

  try {
    const tornarTatuador = await request("/tornar-tatuador", {
      method: "POST",
      headers: { Authorization: `Bearer ${tatuador.token}` },
    });

    assert.equal(tornarTatuador.response.status, 200);

    const perfil = await request("/perfil-profissional", {
      headers: { Authorization: `Bearer ${tornarTatuador.body.token}` },
    });

    assert.equal(perfil.response.status, 200);

    const primeiro = await request("/agendamentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cliente.token}`,
      },
      body: JSON.stringify({
        cliente_nome: "Cliente Agenda 1",
        cliente_email: cliente.email,
        cliente_whatsapp: "31999999999",
        descricao: "Primeiro item da agenda",
        parte_corpo: "braco",
        tamanho: "medio",
        data_solicitada: "2026-03-30",
        tatuador_id: perfil.body.id,
      }),
    });

    const segundo = await request("/agendamentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cliente.token}`,
      },
      body: JSON.stringify({
        cliente_nome: "Cliente Agenda 2",
        cliente_email: cliente.email,
        cliente_whatsapp: "31999999999",
        descricao: "Segundo item da agenda",
        parte_corpo: "perna",
        tamanho: "grande",
        data_solicitada: "2026-03-31",
        tatuador_id: perfil.body.id,
      }),
    });

    assert.equal(primeiro.response.status, 201);
    assert.equal(segundo.response.status, 201);

    const agenda = await request(`/tatuador/${perfil.body.id}/agenda`, {
      headers: { Authorization: `Bearer ${tornarTatuador.body.token}` },
    });

    assert.equal(agenda.response.status, 200);
    assert.equal(typeof agenda.body.total, "number");
    assert.ok(Array.isArray(agenda.body.dias));
    assert.equal(agenda.body.total, 2);
    assert.ok(agenda.body.dias.some((dia) => dia.data === "2026-03-30"));
    assert.ok(agenda.body.dias.some((dia) => dia.data === "2026-03-31"));
    assert.ok(
      agenda.body.dias.every(
        (dia) => typeof dia.totais.total === "number" && Array.isArray(dia.itens)
      )
    );
  } finally {
    await cleanupUserByUsername(cliente.usuario);
    await cleanupUserByUsername(tatuador.usuario);
  }
});

test("usuario tatuador continua acessando meus-agendamentos como cliente", async () => {
  const contaHibrida = await createAndLoginUser("hibridaconta");
  const outroTatuador = await createAndLoginUser("hibridaalvo");

  try {
    const tornarContaHibrida = await request("/tornar-tatuador", {
      method: "POST",
      headers: { Authorization: `Bearer ${contaHibrida.token}` },
    });

    const tornarOutroTatuador = await request("/tornar-tatuador", {
      method: "POST",
      headers: { Authorization: `Bearer ${outroTatuador.token}` },
    });

    assert.equal(tornarContaHibrida.response.status, 200);
    assert.equal(tornarOutroTatuador.response.status, 200);

    const perfilOutro = await request("/perfil-profissional", {
      headers: { Authorization: `Bearer ${tornarOutroTatuador.body.token}` },
    });

    assert.equal(perfilOutro.response.status, 200);

    const create = await request("/agendamentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tornarContaHibrida.body.token}`,
      },
      body: JSON.stringify({
        cliente_nome: "Conta Hibrida",
        cliente_email: contaHibrida.email,
        cliente_whatsapp: "31999999999",
        descricao: "Pedido enviado por tatuador para outro tatuador",
        parte_corpo: "braco fechado",
        tamanho: "braco inteiro",
        data_solicitada: "2026-04-02",
        tatuador_id: perfilOutro.body.id,
      }),
    });

    assert.equal(create.response.status, 201);

    const meus = await request("/meus-agendamentos", {
      headers: { Authorization: `Bearer ${tornarContaHibrida.body.token}` },
    });

    assert.equal(meus.response.status, 200);
    assert.ok(meus.body.some((item) => item.id === create.body.id));
  } finally {
    await cleanupUserByUsername(contaHibrida.usuario);
    await cleanupUserByUsername(outroTatuador.usuario);
  }
});

test("vitrine publica separa patrocinado ativo de premium e prioriza highlight na busca", async () => {
  const patrocinadoUser = await createAndLoginUser("patrocinadoon");
  const premiumUser = await createAndLoginUser("premiumon");

  try {
    const patrocinadoTornar = await request("/tornar-tatuador", {
      method: "POST",
      headers: { Authorization: `Bearer ${patrocinadoUser.token}` },
    });

    const premiumTornar = await request("/tornar-tatuador", {
      method: "POST",
      headers: { Authorization: `Bearer ${premiumUser.token}` },
    });

    assert.equal(patrocinadoTornar.response.status, 200);
    assert.equal(premiumTornar.response.status, 200);

    const cidadeTeste = `Cidade Vitrine ${Date.now()}`;

    await pool.query(
      `UPDATE tatuadores
       SET nome_artistico = $1,
           cidade = $2,
           estado = 'MG',
           disponivel = true
       WHERE usuario_id = (SELECT id FROM usuarios WHERE usuario = $3)`,
      ["Artista Patrocinado Teste", cidadeTeste, patrocinadoUser.usuario]
    );

    await pool.query(
      `UPDATE tatuadores
       SET nome_artistico = $1,
           cidade = $2,
           estado = 'MG',
           disponivel = true
       WHERE usuario_id = (SELECT id FROM usuarios WHERE usuario = $3)`,
      ["Artista Premium Teste", cidadeTeste, premiumUser.usuario]
    );

    const ativarPremium = await request("/meu-plano", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${premiumTornar.body.token}`,
      },
      body: JSON.stringify({ plan_id: 3 }),
    });

    assert.equal(ativarPremium.response.status, 200);

    const ativarPatrocinio = await request("/meu-plano", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patrocinadoTornar.body.token}`,
      },
      body: JSON.stringify({ highlight: true }),
    });

    assert.equal(ativarPatrocinio.response.status, 200);
    assert.equal(typeof ativarPatrocinio.body.highlight_until, "string");

    const busca = await request(`/tatuadores?cidade=${encodeURIComponent(cidadeTeste)}`);

    assert.equal(busca.response.status, 200);
    assert.ok(Array.isArray(busca.body));
    assert.equal(busca.body.length, 2);
    assert.equal(busca.body[0].nome_artistico, "Artista Patrocinado Teste");
    assert.equal(busca.body[0].patrocinado, true);
    assert.equal(busca.body[0].highlight_ativo, true);
    assert.equal(busca.body[0].premium_ativo, false);
    assert.equal(busca.body[1].nome_artistico, "Artista Premium Teste");
    assert.equal(busca.body[1].patrocinado, false);
    assert.equal(busca.body[1].premium_ativo, true);

    const destaques = await request("/tatuadores-destaque");

    assert.equal(destaques.response.status, 200);
    assert.ok(
      destaques.body.some(
        (item) => item.nome_artistico === "Artista Premium Teste" && item.premium_ativo === true
      )
    );
    assert.ok(
      !destaques.body.some(
        (item) => item.nome_artistico === "Artista Patrocinado Teste" && item.premium_ativo !== true
      )
    );
  } finally {
    await cleanupUserByUsername(patrocinadoUser.usuario);
    await cleanupUserByUsername(premiumUser.usuario);
  }
});

test("checkout em modo teste ativa plano Pro e patrocinio semanal", async () => {
  const user = await createAndLoginUser("checkouttest");

  try {
    const tornarTatuador = await request("/tornar-tatuador", {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` },
    });

    assert.equal(tornarTatuador.response.status, 200);

    const criarPlano = await request("/checkout/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tornarTatuador.body.token}`,
      },
      body: JSON.stringify({ plan_id: 2 }),
    });

    assert.equal(criarPlano.response.status, 200);
    assert.equal(criarPlano.body.mode, "test");
    assert.equal(typeof criarPlano.body.payment_id, "number");
    assert.match(criarPlano.body.checkout_url, /pagamento-sucesso\.html\?/);

    const confirmarPlano = await request("/checkout/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tornarTatuador.body.token}`,
      },
      body: JSON.stringify({ payment_id: criarPlano.body.payment_id }),
    });

    assert.equal(confirmarPlano.response.status, 200);
    assert.equal(confirmarPlano.body.assinatura.plano, "Pro");

    const criarPatrocinio = await request("/checkout/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tornarTatuador.body.token}`,
      },
      body: JSON.stringify({ highlight: true }),
    });

    assert.equal(criarPatrocinio.response.status, 200);
    assert.equal(criarPatrocinio.body.mode, "test");

    const confirmarPatrocinio = await request("/checkout/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tornarTatuador.body.token}`,
      },
      body: JSON.stringify({ payment_id: criarPatrocinio.body.payment_id }),
    });

    assert.equal(confirmarPatrocinio.response.status, 200);
    assert.equal(typeof confirmarPatrocinio.body.highlight_until, "string");

    const meuPlano = await request("/meu-plano", {
      headers: { Authorization: `Bearer ${tornarTatuador.body.token}` },
    });

    assert.equal(meuPlano.response.status, 200);
    assert.equal(meuPlano.body.plano, "Pro");
    assert.equal(meuPlano.body.destaque_ativo, true);
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});

test("webhook em modo teste confirma pagamento sem depender do navegador", async () => {
  const user = await createAndLoginUser("webhooktest");

  try {
    const tornarTatuador = await request("/tornar-tatuador", {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` },
    });

    assert.equal(tornarTatuador.response.status, 200);

    const criarPlano = await request("/checkout/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tornarTatuador.body.token}`,
      },
      body: JSON.stringify({ plan_id: 3 }),
    });

    assert.equal(criarPlano.response.status, 200);

    const webhook = await request("/webhook/payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-payment-test-mode": "true",
      },
      body: JSON.stringify({
        payment_id: criarPlano.body.payment_id,
        external_id: "test-webhook-mercado-pago",
      }),
    });

    assert.equal(webhook.response.status, 200);
    assert.equal(webhook.body.ok, true);

    const meuPlano = await request("/meu-plano", {
      headers: { Authorization: `Bearer ${tornarTatuador.body.token}` },
    });

    assert.equal(meuPlano.response.status, 200);
    assert.equal(meuPlano.body.plano, "Premium");

    const paymentCheck = await pool.query(
      "SELECT status, external_id FROM payment_sessions WHERE id = $1",
      [criarPlano.body.payment_id]
    );

    assert.equal(paymentCheck.rows[0].status, "confirmed");
    assert.equal(paymentCheck.rows[0].external_id, "test-webhook-mercado-pago");
  } finally {
    await cleanupUserByUsername(user.usuario);
  }
});
