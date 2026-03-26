const fs = require("fs");
const path = require("path");

const pool = require("../config/db");
const env = require("../config/env");
const {
  getOptionalUsuarioIdFromRequest,
  registrarEvento,
} = require("../helpers/analytics");
const { escapeHtml, slugToText, titleCase } = require("../helpers/strings");

let perfilTemplateCache = null;

function buildDistanceSql(latitude, longitude) {
  return `
    CASE
      WHEN t.latitude IS NULL OR t.longitude IS NULL THEN NULL
      ELSE 6371 * ACOS(
        LEAST(
          1,
          GREATEST(
            -1,
            COS(RADIANS(${latitude})) * COS(RADIANS(t.latitude)) * COS(RADIANS(t.longitude) - RADIANS(${longitude})) +
            SIN(RADIANS(${latitude})) * SIN(RADIANS(t.latitude))
          )
        )
      )
    END
  `;
}

function buildTatuadoresQuery({ estado, cidade, municipio, estilo, latitude, longitude } = {}) {
  const latitudeNumber = Number(latitude);
  const longitudeNumber = Number(longitude);
  const hasCoordinates = Number.isFinite(latitudeNumber) && Number.isFinite(longitudeNumber);
  const distanceSql = hasCoordinates ? buildDistanceSql(latitudeNumber, longitudeNumber) : "NULL";

  let query = `
    SELECT
      t.id,
      t.slug,
      u.usuario,
      t.nome_artistico,
      t.estado,
      t.cidade,
      COALESCE(t.bairro, t.municipio) AS bairro,
      t.municipio,
      t.estilos,
      t.foto_perfil,
      t.disponivel,
      t.highlight_until,
      CASE
        WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN true
        ELSE false
      END AS highlight_ativo,
      CASE
        WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN true
        ELSE false
      END AS patrocinado,
      CASE
        WHEN COALESCE(s.status, 'ativa') = 'ativa' AND COALESCE(p.priority, 0) >= 3 THEN true
        ELSE false
      END AS premium_ativo,
      COALESCE(s.status, 'ativa') AS status_assinatura,
      COALESCE(AVG(a.nota), 0) AS media,
      COUNT(a.id) AS total_avaliacoes,
      p.priority,
      p.name AS plano,
      CASE WHEN p.priority >= 3 THEN true ELSE false END AS verificado,
      ${distanceSql} AS distancia_km
    FROM tatuadores t
    JOIN usuarios u ON u.id = t.usuario_id
    LEFT JOIN avaliacoes a ON t.id = a.tatuador_id
    LEFT JOIN subscriptions s ON s.tatuador_id = t.id
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE t.nome_artistico IS NOT NULL
      AND COALESCE(t.disponivel, true) = true
  `;

  const valores = [];

  if (estado) {
    valores.push(`%${estado}%`);
    query += ` AND t.estado ILIKE $${valores.length}`;
  }

  if (cidade) {
    valores.push(`%${cidade}%`);
    query += ` AND t.cidade ILIKE $${valores.length}`;
  }

  if (municipio) {
    valores.push(`%${municipio}%`);
    query += ` AND t.municipio ILIKE $${valores.length}`;
  }

  if (estilo) {
    valores.push(`%${estilo}%`);
    query += ` AND t.estilos ILIKE $${valores.length}`;
  }

  query += `
    GROUP BY
      t.id,
      t.slug,
      t.usuario_id,
      u.usuario,
      t.nome_artistico,
      t.estado,
      t.cidade,
      t.bairro,
      t.municipio,
      t.estilos,
      t.foto_perfil,
      t.disponivel,
      t.highlight_until,
      p.priority,
      p.name,
      s.patrocinado,
      s.status
    ORDER BY
      CASE
        WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN 1
        ELSE 0
      END DESC,
      CASE
        WHEN COALESCE(s.status, 'ativa') = 'ativa' AND COALESCE(p.priority, 0) >= 3 THEN 1
        ELSE 0
      END DESC,
      COALESCE(p.priority, 1) DESC,
      ${hasCoordinates ? "distancia_km ASC NULLS LAST," : ""}
      media DESC NULLS LAST,
      RANDOM()
  `;

  return { query, valores };
}

async function buscarTatuadoresFiltrados(filters = {}) {
  const { query, valores } = buildTatuadoresQuery(filters);
  const result = await pool.query(query, valores);
  return result.rows;
}

function getPerfilPath(tatuador) {
  if (tatuador?.slug) {
    return `/perfil/${encodeURIComponent(tatuador.slug)}`;
  }

  return `/perfil.html?id=${encodeURIComponent(tatuador?.id ?? "")}`;
}

function renderSeoListPage({
  req,
  title,
  description,
  heading,
  lead,
  canonicalPath,
  tatuadores,
  robots = "index,follow",
}) {
  const baseUrl = getBaseUrl(req);
  const canonicalUrl = `${baseUrl}${canonicalPath}`;
  const socialImage = `${baseUrl}/styles/assets/perfil.jpg`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: canonicalUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: tatuadores.length,
      itemListElement: tatuadores.slice(0, 12).map((tatuador, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${baseUrl}${getPerfilPath(tatuador)}`,
        name: tatuador.nome_artistico || "Tatuador",
      })),
    },
  };

  const cards = tatuadores.length
    ? tatuadores
        .map((tatuador) => {
          const foto = tatuador.foto_perfil
            ? `/uploads/${encodeURIComponent(tatuador.foto_perfil)}`
            : "/styles/assets/perfil.jpg";
          const badges = [];

          if (tatuador.patrocinado) {
            badges.push('<span class="badge patrocinado">Patrocinado</span>');
          }

          if (tatuador.premium_ativo) {
            badges.push('<span class="badge premium">Premium</span>');
          }

          if (tatuador.highlight_ativo) {
            badges.push('<span class="badge destaque">Destaque semanal</span>');
          }

          if (!tatuador.premium_ativo && tatuador.verificado) {
            badges.push('<span class="badge verificado">Verificado</span>');
          } else if (tatuador.plano === "Pro") {
            badges.push('<span class="badge pro">Plano Pro</span>');
          }

          return `
            <article class="card">
              <img src="${foto}" alt="${escapeHtml(tatuador.nome_artistico || "Tatuador")}">
              <div class="card-body">
                <div class="badge-row">${badges.join("")}</div>
                <h2>${escapeHtml(tatuador.nome_artistico || "Artista sem nome")}</h2>
                <p class="location">${escapeHtml(tatuador.cidade || "Cidade nao informada")} - ${escapeHtml(tatuador.estado || "Estado nao informado")}</p>
                <p class="meta">Bairro: ${escapeHtml(tatuador.bairro || "Nao informado")}</p>
                <p class="meta">Estilos: ${escapeHtml(tatuador.estilos || "Nao informado")}</p>
                ${Number.isFinite(Number(tatuador.distancia_km)) ? `<p class="meta">Distancia: ${Number(tatuador.distancia_km).toFixed(1)} km</p>` : ""}
                <p class="meta">Nota media: ${Number(tatuador.media || 0).toFixed(1)} (${Number(tatuador.total_avaliacoes || 0)} avaliacao(oes))</p>
                <a class="button-secondary" href="${escapeHtml(getPerfilPath(tatuador))}">Ver perfil</a>
              </div>
            </article>
          `;
        })
        .join("")
    : `
      <article class="empty-block">
        Nenhum tatuador encontrado para este filtro no momento.
      </article>
    `;

  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="${escapeHtml(robots)}">
<link rel="canonical" href="${escapeHtml(canonicalUrl)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta property="og:image" content="${escapeHtml(socialImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(socialImage)}">
<link rel="stylesheet" href="/styles/theme.css">
<link rel="stylesheet" href="/styles/pages/tatuadores.css">
<script type="application/ld+json">${sanitizeJsonForScript(jsonLd)}</script>
</head>
<body>
<header class="seo-header">
  <nav class="seo-nav">
    <a class="seo-brand" href="/">TattooMatch</a>
    <div class="seo-links">
      <a href="/tatuadores.html">Explorar</a>
      <a href="/ranking.html">Ranking</a>
      <a href="/login.html">Entrar</a>
    </div>
  </nav>
</header>
<main>
  <section class="hero">
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(lead)}</p>
    <div class="hero-actions">
      <a class="button" href="/tatuadores.html">Ver filtros completos</a>
      <a class="button-secondary" href="/ranking.html">Ver ranking</a>
    </div>
  </section>
  <p class="status">${tatuadores.length} tatuador(es) encontrado(s).</p>
  <section class="stack">
    <section class="section-shell">
      <div class="section-head">
        <div>
          <h2>Lista de tatuadores</h2>
          <p>Perfis disponiveis no TattooMatch para este recorte.</p>
        </div>
      </div>
      <div class="container">
        ${cards}
      </div>
    </section>
  </section>
</main>
</body>
</html>`;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textToSlug(value) {
  return slugToText(value)
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function getBaseUrl(req) {
  if (env.siteUrl) {
    return env.siteUrl.replace(/\/+$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
}

function getPerfilTemplate() {
  if (!perfilTemplateCache) {
    perfilTemplateCache = fs.readFileSync(path.join(env.rootDir, "perfil.html"), "utf8");
  }

  return perfilTemplateCache;
}

function splitEstilos(estilos) {
  return String(estilos ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatLocation(tatuador) {
  const cidade = tatuador?.cidade?.trim();
  const estado = tatuador?.estado?.trim();

  if (cidade && estado) {
    return `${cidade}, ${estado}`;
  }

  return cidade || estado || "";
}

function buildPerfilTitle(tatuador) {
  const nome = tatuador?.nome_artistico || "Tatuador";
  const location = formatLocation(tatuador);
  const estilos = splitEstilos(tatuador?.estilos);

  if (estilos.length > 0 && tatuador?.cidade) {
    return `Tatuador de ${estilos[0]} em ${tatuador.cidade} | ${nome} | TattooMatch`;
  }

  if (location) {
    return `${nome} em ${location} | TattooMatch`;
  }

  return `${nome} | TattooMatch`;
}

function buildPerfilDescription(tatuador, avaliacoes = []) {
  const nome = tatuador?.nome_artistico || "este tatuador";
  const location = formatLocation(tatuador);
  const estilos = splitEstilos(tatuador?.estilos).slice(0, 2);
  const temAvaliacoes = avaliacoes.length > 0;
  const especialidade = estilos.length
    ? ` especializado em ${estilos.join(" e ")}`
    : "";
  const local = location ? ` em ${location}` : "";
  const prova = temAvaliacoes ? " avaliações" : " informações";

  return `Conheça ${nome}, tatuador${local}${especialidade}. Veja portfólio,${prova} e peça orçamento no TattooMatch.`;
}

function buildPerfilEyebrow(tatuador) {
  const estilos = splitEstilos(tatuador?.estilos);
  const cidade = tatuador?.cidade?.trim();

  if (estilos.length > 0 && cidade) {
    return `${titleCase(estilos[0])} em ${cidade}`;
  }

  if (cidade) {
    return `Tatuador em ${cidade}`;
  }

  return "Perfil do artista";
}

function getSocialImageUrl(req, tatuador) {
  const baseUrl = getBaseUrl(req);

  if (tatuador?.foto_perfil) {
    return `${baseUrl}/uploads/${encodeURIComponent(tatuador.foto_perfil)}`;
  }

  return `${baseUrl}/styles/assets/perfil.jpg`;
}

function sanitizeJsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildAggregateRating(avaliacoes = []) {
  if (!avaliacoes.length) {
    return null;
  }

  const soma = avaliacoes.reduce((acc, item) => acc + Number(item.nota || 0), 0);
  const media = soma / avaliacoes.length;

  return {
    media: Number(media.toFixed(1)),
    total: avaliacoes.length,
  };
}

function buildPerfilStructuredData({ req, tatuador, avaliacoes }) {
  const estilos = splitEstilos(tatuador?.estilos);
  const url = `${getBaseUrl(req)}${getPerfilPath(tatuador)}`;
  const description = buildPerfilDescription(tatuador, avaliacoes);
  const aggregateRating = buildAggregateRating(avaliacoes);
  const possuiEndereco = Boolean(tatuador?.cidade || tatuador?.estado);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: tatuador?.nome_artistico || "Tatuador",
    jobTitle: "Tatuador",
    description,
    url,
    image: getSocialImageUrl(req, tatuador),
    address: possuiEndereco
      ? {
          "@type": "PostalAddress",
          addressLocality: tatuador?.cidade || undefined,
          addressRegion: tatuador?.estado || undefined,
        }
      : undefined,
    knowsAbout: estilos.length ? estilos : undefined,
    telephone: tatuador?.whatsapp || undefined,
  };

  if (aggregateRating) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: aggregateRating.media,
      reviewCount: aggregateRating.total,
    };
  }

  return jsonLd;
}

function renderPerfilPageHtml({ req, tatuador, avaliacoes = [] }) {
  const title = buildPerfilTitle(tatuador);
  const description = buildPerfilDescription(tatuador, avaliacoes);
  const canonicalUrl = `${getBaseUrl(req)}${getPerfilPath(tatuador)}`;
  const socialImage = getSocialImageUrl(req, tatuador);
  const replacements = {
    "__SEO_TITLE__": escapeHtml(title),
    "__SEO_DESCRIPTION__": escapeHtml(description),
    "__SEO_ROBOTS__": "index,follow",
    "__SEO_CANONICAL__": escapeHtml(canonicalUrl),
    "__SEO_OG_TITLE__": escapeHtml(title),
    "__SEO_OG_DESCRIPTION__": escapeHtml(description),
    "__SEO_OG_IMAGE__": escapeHtml(socialImage),
    "__SEO_TWITTER_TITLE__": escapeHtml(title),
    "__SEO_TWITTER_DESCRIPTION__": escapeHtml(description),
    "__SEO_TWITTER_IMAGE__": escapeHtml(socialImage),
    "__SEO_JSON_LD__": sanitizeJsonForScript(
      buildPerfilStructuredData({ req, tatuador, avaliacoes })
    ),
    "__SEO_H1__": escapeHtml(tatuador?.nome_artistico || "Perfil do tatuador"),
    "__SEO_EYEBROW__": escapeHtml(buildPerfilEyebrow(tatuador)),
    "__SEO_LEAD__": escapeHtml(description),
  };

  let html = getPerfilTemplate();

  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replaceAll(placeholder, value);
  }

  return html;
}

function renderGenericPerfilPage(req) {
  const baseUrl = getBaseUrl(req);
  const replacements = {
    "__SEO_TITLE__": "Perfil de tatuador | TattooMatch",
    "__SEO_DESCRIPTION__": "Veja portfólio, avaliações e peça orçamento para tatuadores no TattooMatch.",
    "__SEO_ROBOTS__": "noindex,nofollow",
    "__SEO_CANONICAL__": `${baseUrl}/perfil.html`,
    "__SEO_OG_TITLE__": "Perfil de tatuador | TattooMatch",
    "__SEO_OG_DESCRIPTION__": "Veja portfólio, avaliações e peça orçamento para tatuadores no TattooMatch.",
    "__SEO_OG_IMAGE__": `${baseUrl}/styles/assets/perfil.jpg`,
    "__SEO_TWITTER_TITLE__": "Perfil de tatuador | TattooMatch",
    "__SEO_TWITTER_DESCRIPTION__": "Veja portfólio, avaliações e peça orçamento para tatuadores no TattooMatch.",
    "__SEO_TWITTER_IMAGE__": `${baseUrl}/styles/assets/perfil.jpg`,
    "__SEO_JSON_LD__": sanitizeJsonForScript({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Perfil de tatuador | TattooMatch",
      url: `${baseUrl}/perfil.html`,
    }),
    "__SEO_H1__": "Perfil do tatuador",
    "__SEO_EYEBROW__": "Perfil do artista",
    "__SEO_LEAD__": "Veja portfólio, avaliações e peça orçamento no TattooMatch.",
  };

  let html = getPerfilTemplate();

  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replaceAll(placeholder, value);
  }

  return html;
}

async function fetchTatuadorPublicData({ identifier, req, trackView = true }) {
  if (!identifier) {
    return null;
  }

  const tatuadorFilter =
    Number.isInteger(Number(identifier)) && String(Number(identifier)) === String(identifier)
      ? { clause: "t.id = $1", value: Number(identifier) }
      : { clause: "t.slug = $1", value: identifier };

  const tatuadorResult = await pool.query(
    `SELECT
       t.id,
       t.usuario_id,
       t.slug,
       u.usuario,
       t.nome_artistico,
       t.bio,
       t.estado,
       t.cidade,
       COALESCE(t.bairro, t.municipio) AS bairro,
       t.municipio,
       t.estilos,
       t.foto_perfil,
       t.whatsapp,
       t.disponivel,
       t.highlight_until,
       COALESCE(s.status, 'ativa') AS status_assinatura,
       p.name AS plano,
       CASE
         WHEN COALESCE(s.status, 'ativa') = 'ativa' AND COALESCE(p.priority, 0) >= 3 THEN true
         ELSE false
       END AS premium_ativo,
       CASE
         WHEN t.highlight_until IS NOT NULL AND t.highlight_until > NOW() THEN true
         ELSE false
       END AS destaque_ativo
     FROM tatuadores t
     JOIN usuarios u ON u.id = t.usuario_id
     LEFT JOIN subscriptions s ON s.tatuador_id = t.id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE ${tatuadorFilter.clause}`,
    [tatuadorFilter.value]
  );

  if (tatuadorResult.rows.length === 0) {
    return null;
  }

  const tatuador = tatuadorResult.rows[0];
  const perfilPath = getPerfilPath(tatuador);

  if (trackView) {
    await pool.query("INSERT INTO perfil_views (tatuador_id) VALUES ($1)", [tatuador.id]);
    await registrarEvento({
      tipoEvento: "visita_perfil",
      usuarioId: getOptionalUsuarioIdFromRequest(req),
      pagina: perfilPath,
    });
  }

  const [viewsResult, tattoosResult, avaliacoesResult] = await Promise.all([
    pool.query("SELECT COUNT(*) FROM perfil_views WHERE tatuador_id = $1", [tatuador.id]),
    pool.query(
      `SELECT id, imagem, descricao, estilo, COALESCE(tipo, 'foto') AS tipo, created_at
       FROM tatuagens
       WHERE usuario_id = $1
       ORDER BY created_at DESC`,
      [tatuador.usuario_id]
    ),
    pool.query(
      `SELECT nota, comentario, created_at
       FROM avaliacoes
       WHERE tatuador_id = $1
       ORDER BY created_at DESC`,
      [tatuador.id]
    ),
  ]);

  return {
    tatuador,
    portfolio: tattoosResult.rows,
    avaliacoes: avaliacoesResult.rows,
    views: Number(viewsResult.rows[0].count),
  };
}

async function renderPerfilPublicoPage(req, res) {
  const identifier = req.params.slug || req.query.id || null;

  if (!identifier) {
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.type("html").send(renderGenericPerfilPage(req));
    return;
  }

  try {
    const data = await fetchTatuadorPublicData({
      identifier,
      req,
      trackView: false,
    });

    if (!data) {
      return res.status(404).type("html").send("Perfil de tatuador nao encontrado");
    }

    res.set("X-Robots-Tag", "index, follow");
    res.type("html").send(
      renderPerfilPageHtml({
        req,
        tatuador: data.tatuador,
        avaliacoes: data.avaliacoes,
      })
    );
  } catch (error) {
    console.error(error);
    res.status(500).type("html").send("Erro ao carregar o perfil do tatuador");
  }
}

async function getTatuadorPublico(req, res) {
  const { slugOrId } = req.params;

  if (!slugOrId) {
    return res.status(400).json({ erro: "Identificador de tatuador invalido" });
  }

  try {
    const data = await fetchTatuadorPublicData({
      identifier: slugOrId,
      req,
      trackView: true,
    });

    if (!data) {
      return res.status(404).json({ mensagem: "Tatuador nao encontrado" });
    }

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro no servidor" });
  }
}

async function listarTatuadores(req, res) {
  const { estado, cidade, municipio, estilo, latitude, longitude } = req.query;

  try {
    const tatuadores = await buscarTatuadoresFiltrados({
      estado,
      cidade,
      municipio,
      estilo,
      latitude,
      longitude,
    });
    res.json(tatuadores);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensagem: "Erro ao listar tatuadores" });
  }
}

async function listarTatuadoresPorCidadeSeo(req, res) {
  const cidade = slugToText(req.params.cidade);
  const cidadeFormatada = titleCase(cidade);

  try {
    const tatuadores = await buscarTatuadoresFiltrados({ cidade });
    const robots = tatuadores.length ? "index,follow" : "noindex,nofollow";
    const title = `Melhores tatuadores em ${cidadeFormatada} | TattooMatch`;
    const description = `Encontre ${tatuadores.length} tatuador(es) em ${cidadeFormatada}, veja estilos, avaliacoes e escolha o profissional ideal no TattooMatch.`;
    const html = renderSeoListPage({
      req,
      title,
      description,
      heading: `Melhores tatuadores em ${cidadeFormatada}`,
      lead: `Descubra artistas em ${cidadeFormatada}, compare estilos e encontre o perfil ideal para sua proxima tatuagem.`,
      canonicalPath: `/tatuadores/${req.params.cidade}`,
      tatuadores,
      robots,
    });

    res.set("X-Robots-Tag", robots === "index,follow" ? "index, follow" : "noindex, nofollow");
    res.status(tatuadores.length ? 200 : 404).type("html").send(html);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao carregar a pagina de tatuadores por cidade");
  }
}

async function listarTatuadoresPorEstiloSeo(req, res) {
  const estilo = slugToText(req.params.estilo);
  const estiloFormatado = titleCase(estilo);

  try {
    const tatuadores = await buscarTatuadoresFiltrados({ estilo });
    const robots = tatuadores.length ? "index,follow" : "noindex,nofollow";
    const title = `Tatuadores de ${estiloFormatado} | TattooMatch`;
    const description = `Explore ${tatuadores.length} tatuador(es) especializados em ${estiloFormatado}, veja portfolios e encontre seu proximo artista no TattooMatch.`;
    const html = renderSeoListPage({
      req,
      title,
      description,
      heading: `Tatuadores de ${estiloFormatado}`,
      lead: `Veja profissionais com foco em ${estiloFormatado}, compare perfis e encontre o estilo que combina com voce.`,
      canonicalPath: `/tatuadores/estilo/${req.params.estilo}`,
      tatuadores,
      robots,
    });

    res.set("X-Robots-Tag", robots === "index,follow" ? "index, follow" : "noindex, nofollow");
    res.status(tatuadores.length ? 200 : 404).type("html").send(html);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao carregar a pagina de tatuadores por estilo");
  }
}

async function getSitemapXml(req, res) {
  try {
    const baseUrl = getBaseUrl(req);
    const urls = new Map();

    const addUrl = (pathname, changefreq = "weekly", priority = "0.7") => {
      urls.set(`${baseUrl}${pathname}`, { changefreq, priority });
    };

    [
      ["/", "weekly", "1.0"],
      ["/tatuadores.html", "daily", "0.9"],
      ["/ranking.html", "daily", "0.8"],
      ["/planos.html", "weekly", "0.8"],
      ["/termos.html", "monthly", "0.5"],
      ["/privacidade.html", "monthly", "0.5"],
      ["/seguranca.html", "monthly", "0.5"],
    ].forEach(([pathname, changefreq, priority]) => addUrl(pathname, changefreq, priority));

    const [cidadesResult, estilosResult, perfisResult] = await Promise.all([
      pool.query(
        "SELECT DISTINCT cidade FROM tatuadores WHERE cidade IS NOT NULL AND cidade <> '' ORDER BY cidade ASC"
      ),
      pool.query(
        "SELECT estilos FROM tatuadores WHERE estilos IS NOT NULL AND estilos <> ''"
      ),
      pool.query(`
        SELECT id, slug
        FROM tatuadores
        WHERE slug IS NOT NULL
          AND slug <> ''
          AND nome_artistico IS NOT NULL
          AND COALESCE(disponivel, true) = true
        ORDER BY id ASC
      `),
    ]);

    cidadesResult.rows.forEach((item) => {
      addUrl(`/tatuadores/${encodeURIComponent(textToSlug(item.cidade))}`, "weekly", "0.8");
    });

    const estilos = new Set();
    estilosResult.rows.forEach((item) => {
      String(item.estilos)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => estilos.add(textToSlug(value)));
    });

    Array.from(estilos)
      .sort()
      .forEach((estiloSlug) => {
        addUrl(`/tatuadores/estilo/${encodeURIComponent(estiloSlug)}`, "weekly", "0.8");
      });

    perfisResult.rows.forEach((item) => {
      addUrl(getPerfilPath(item), "weekly", "0.6");
    });

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from(urls.entries())
  .map(
    ([loc, metadata]) => `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <changefreq>${metadata.changefreq}</changefreq>
    <priority>${metadata.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    res.type("application/xml").send(body);
  } catch (error) {
    console.error(error);
    res.status(500).type("application/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><error>Erro ao gerar sitemap</error>");
  }
}

function getRobotsTxt(req, res) {
  const baseUrl = getBaseUrl(req);
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin-dashboard.html",
    "Disallow: /admin-analytics.html",
    "Disallow: /admin-usuarios.html",
    "Disallow: /admin-tatuadores.html",
    "Disallow: /admin-assinaturas.html",
    "Disallow: /home.html",
    "Disallow: /painel.html",
    "Disallow: /editar-perfil.html",
    "Disallow: /meus-agendamentos.html",
    "Disallow: /login.html",
    "Disallow: /forgot-password.html",
    "Disallow: /reset-password.html",
    "Disallow: /pagamento-sucesso.html",
    "Disallow: /pagamento-cancelado.html",
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ];

  res.type("text/plain").send(`${lines.join("\n")}\n`);
}

module.exports = {
  getRobotsTxt,
  getSitemapXml,
  getPerfilPath,
  getTatuadorPublico,
  listarTatuadores,
  listarTatuadoresPorCidadeSeo,
  listarTatuadoresPorEstiloSeo,
  renderPerfilPublicoPage,
};
