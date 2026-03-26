const fs = require("fs");
const cors = require("cors");
const express = require("express");
const path = require("path");
const rateLimit = require("express-rate-limit");

const env = require("./config/env");
const { ensureUploadsDir, uploadsDir } = require("./config/upload");
const authRoutes = require("./routes/authRoutes");
const perfilRoutes = require("./routes/perfilRoutes");
const publicRoutes = require("./routes/publicRoutes");
const tatuagemRoutes = require("./routes/tatuagemRoutes");
const perfilProfissionalRoutes = require("./routes/perfilProfissionalRoutes");
const avaliacaoRoutes = require("./routes/avaliacaoRoutes");
const agendamentoRoutes = require("./routes/agendamentoRoutes");
const tatuadorRoutes = require("./routes/tatuadorRoutes");
const localizacaoRoutes = require("./routes/localizacaoRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { renderPerfilPublicoPage } = require("./controllers/publicController");
const { webhookPagamento } = require("./controllers/perfilProfissionalController");
const { ensureAnalyticsSchema } = require("./helpers/analytics");
const { ensureMarketplaceSchema } = require("./helpers/marketplaceSchema");
const { ensureUserSchema } = require("./helpers/userSchema");

const app = express();
let prepareAppPromise = null;
const isProduction = process.env.NODE_ENV === "production";
const canonicalSiteUrl = "https://tattoomatch.com.br";
const canonicalRedirectHosts = new Set([
  "www.tattoomatch.com.br",
  "tattoomatch-3.onrender.com",
]);

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function isLocalDevelopmentOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function getAllowedOriginsList() {
  return Array.from(allowedOrigins);
}

function logCorsDecision({ origin, normalizedOrigin, allowed, reason }) {
  console.info("[cors] Validacao de origem", {
    origin: origin || null,
    normalizedOrigin: normalizedOrigin || null,
    allowed,
    reason,
    siteUrl: env.siteUrl,
    corsOrigins: env.corsOrigins,
    allowedOrigins: getAllowedOriginsList(),
    isProduction,
  });
}

const allowedOrigins = new Set(
  [env.siteUrl, ...env.corsOrigins]
    .map(normalizeOrigin)
    .filter(Boolean)
);

console.info("[cors] Configuracao carregada", {
  siteUrl: env.siteUrl,
  normalizedSiteUrl: normalizeOrigin(env.siteUrl),
  corsOrigins: env.corsOrigins,
  normalizedCorsOrigins: env.corsOrigins.map(normalizeOrigin),
  allowedOrigins: getAllowedOriginsList(),
  isProduction,
});

const publicRootFiles = [
  "favicon.ico",
  "favicon-32x32.png",
  "favicon-16x16.png",
  "index.html",
  "login.html",
  "forgot-password.html",
  "reset-password.html",
  "home.html",
  "tatuadores.html",
  "painel.html",
  "editar-perfil.html",
  "meus-agendamentos.html",
  "ranking.html",
  "planos.html",
  "pagamento-sucesso.html",
  "pagamento-cancelado.html",
  "termos.html",
  "privacidade.html",
  "seguranca.html",
  "admin-dashboard.html",
  "admin-analytics.html",
  "admin-usuarios.html",
  "admin-tatuadores.html",
  "admin-assinaturas.html",
  "navbar.html",
  "footer.html",
];

const privateNoIndexPaths = new Set([
  "/login.html",
  "/forgot-password.html",
  "/reset-password.html",
  "/home.html",
  "/painel.html",
  "/editar-perfil.html",
  "/meus-agendamentos.html",
  "/pagamento-sucesso.html",
  "/pagamento-cancelado.html",
  "/admin-dashboard.html",
  "/admin-analytics.html",
  "/admin-usuarios.html",
  "/admin-tatuadores.html",
  "/admin-assinaturas.html",
]);

const seoTemplateCache = new Map();

function getBaseUrl(req) {
  if (env.siteUrl) {
    return env.siteUrl.replace(/\/+$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeJsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function getSeoTemplate(filename) {
  if (!seoTemplateCache.has(filename)) {
    seoTemplateCache.set(filename, fs.readFileSync(path.join(env.rootDir, filename), "utf8"));
  }

  return seoTemplateCache.get(filename);
}

function renderSeoFile(filename, replacements) {
  let html = getSeoTemplate(filename);

  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replaceAll(placeholder, value);
  }

  return html;
}

function renderStaticSeoPage(req, filename, seo) {
  const baseUrl = getBaseUrl(req);
  const canonicalUrl = `${baseUrl}${seo.canonicalPath}`;
  const imageUrl = `${baseUrl}${seo.imagePath || "/styles/assets/perfil.jpg"}`;
  const title = seo.title;
  const description = seo.description;
  const robots = seo.robots || "index,follow";

  return renderSeoFile(filename, {
    "__SEO_TITLE__": escapeHtml(title),
    "__SEO_DESCRIPTION__": escapeHtml(description),
    "__SEO_ROBOTS__": robots,
    "__SEO_CANONICAL__": escapeHtml(canonicalUrl),
    "__SEO_OG_TITLE__": escapeHtml(seo.ogTitle || title),
    "__SEO_OG_DESCRIPTION__": escapeHtml(seo.ogDescription || description),
    "__SEO_OG_IMAGE__": escapeHtml(imageUrl),
    "__SEO_TWITTER_TITLE__": escapeHtml(seo.twitterTitle || title),
    "__SEO_TWITTER_DESCRIPTION__": escapeHtml(seo.twitterDescription || description),
    "__SEO_TWITTER_IMAGE__": escapeHtml(imageUrl),
    "__SEO_JSON_LD__": sanitizeJsonForScript(
      seo.jsonLd || {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: title,
        description,
        url: canonicalUrl,
      }
    ),
  });
}

const staticSeoPages = {
  "index.html": (req) => ({
    title: "TattooMatch | Encontre seu proximo tatuador",
    description:
      "TattooMatch conecta clientes e tatuadores com busca por cidade, estilo, portfolio e reputacao.",
    canonicalPath: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "TattooMatch",
      url: `${getBaseUrl(req)}/`,
      description:
        "Marketplace para encontrar tatuadores por cidade, estilo, portfolio e reputacao.",
    },
  }),
  "tatuadores.html": (req) => ({
    title: "Tatuadores | TattooMatch",
    description:
      "Busque tatuadores disponiveis por cidade, estilo e proximidade no TattooMatch.",
    canonicalPath: "/tatuadores.html",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Tatuadores | TattooMatch",
      description:
        "Pagina de busca publica para encontrar tatuadores por localizacao e estilo.",
      url: `${getBaseUrl(req)}/tatuadores.html`,
    },
  }),
  "planos.html": (req) => ({
    title: "Planos | TattooMatch",
    description:
      "Escolha o plano ideal para atrair mais clientes, ganhar visibilidade e pagar com Mercado Pago no TattooMatch.",
    canonicalPath: "/planos.html",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Planos | TattooMatch",
      description:
        "Planos para tatuadores ganharem mais visibilidade dentro do TattooMatch.",
      url: `${getBaseUrl(req)}/planos.html`,
    },
  }),
  "ranking.html": (req) => ({
    title: "Ranking de Tatuadores | TattooMatch",
    description:
      "Veja os tatuadores mais bem posicionados com base em avaliacoes e prioridade de plano no TattooMatch.",
    canonicalPath: "/ranking.html",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Ranking de Tatuadores | TattooMatch",
      description:
        "Ranking publico de tatuadores com base em avaliacao e relevancia na plataforma.",
      url: `${getBaseUrl(req)}/ranking.html`,
    },
  }),
};

function prepareApp() {
  if (!prepareAppPromise) {
    prepareAppPromise = Promise.all([
      Promise.resolve().then(() => ensureUploadsDir()),
      ensureUserSchema(),
      ensureAnalyticsSchema(),
      ensureMarketplaceSchema(),
    ]).catch((error) => {
      prepareAppPromise = null;
      throw error;
    });
  }

  return prepareAppPromise;
}

if (isProduction && !process.env.UPLOADS_DIR) {
  console.warn(
    "UPLOADS_DIR nao esta configurado em producao. Os arquivos enviados podem sumir apos restart, novo deploy ou roteamento para outra instancia no Render."
  );
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Muitas requisicoes. Tente novamente em 15 minutos.",
  skip: (req) => {
    const ip = req.ip || req.socket?.remoteAddress || "";
    return process.env.NODE_ENV !== "production" || ip === "::1" || ip === "127.0.0.1";
  },
});

app.set("trust proxy", 1);

app.use((req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    next();
    return;
  }

  const hostHeader = String(req.get("host") || "")
    .trim()
    .toLowerCase();
  const hostname = hostHeader.split(":")[0];

  if (!canonicalRedirectHosts.has(hostname)) {
    next();
    return;
  }

  const path = req.originalUrl || req.url || "/";
  res.redirect(301, `${canonicalSiteUrl}${path}`);
});

app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = normalizeOrigin(origin);

      if (!origin) {
        logCorsDecision({
          origin,
          normalizedOrigin,
          allowed: true,
          reason: "request-sem-origin",
        });
        callback(null, true);
        return;
      }

      if (!env.corsOrigins.length) {
        if (isProduction) {
          if (allowedOrigins.has(normalizedOrigin)) {
            logCorsDecision({
              origin,
              normalizedOrigin,
              allowed: true,
              reason: "site-url-match-sem-cors-origins",
            });
            callback(null, true);
            return;
          }

          logCorsDecision({
            origin,
            normalizedOrigin,
            allowed: false,
            reason: "origin-bloqueada-sem-cors-origins-em-producao",
          });
          callback(new Error("Origem nao permitida pelo CORS"));
          return;
        }

        if (isLocalDevelopmentOrigin(normalizedOrigin) || allowedOrigins.has(normalizedOrigin)) {
          logCorsDecision({
            origin,
            normalizedOrigin,
            allowed: true,
            reason: "origem-local-ou-site-url-em-desenvolvimento",
          });
          callback(null, true);
          return;
        }

        logCorsDecision({
          origin,
          normalizedOrigin,
          allowed: false,
          reason: "origin-bloqueada-sem-cors-origins",
        });
        callback(new Error("Origem nao permitida pelo CORS"));
        return;
      }

      if (allowedOrigins.has(normalizedOrigin) || (!isProduction && isLocalDevelopmentOrigin(normalizedOrigin))) {
        logCorsDecision({
          origin,
          normalizedOrigin,
          allowed: true,
          reason: allowedOrigins.has(normalizedOrigin)
            ? "origin-presente-em-allowed-origins"
            : "origin-local-em-desenvolvimento",
        });
        callback(null, true);
        return;
      }

      logCorsDecision({
        origin,
        normalizedOrigin,
        allowed: false,
        reason: "origin-bloqueada",
      });
      callback(new Error("Origem nao permitida pelo CORS"));
    },
  })
);
app.post("/webhook/payment", express.raw({ type: "application/json" }), webhookPagamento);
app.use(express.json());
app.use(limiter);
app.use((req, res, next) => {
  if (privateNoIndexPaths.has(req.path)) {
    res.set("X-Robots-Tag", "noindex, nofollow");
  }

  next();
});
app.use("/uploads", express.static(uploadsDir));
app.use("/styles", express.static(path.join(env.rootDir, "styles")));
app.use("/scripts", express.static(path.join(env.rootDir, "scripts")));

for (const filename of publicRootFiles) {
  app.get(`/${filename}`, (req, res) => {
    if (filename === "index.html") {
      res.redirect(301, "/");
      return;
    }

    if (staticSeoPages[filename]) {
      res.set("X-Robots-Tag", "index, follow");
      res.type("html").send(renderStaticSeoPage(req, filename, staticSeoPages[filename](req)));
      return;
    }

    res.sendFile(path.join(env.rootDir, filename));
  });
}

app.get("/perfil.html", renderPerfilPublicoPage);
app.get("/perfil/:slug", renderPerfilPublicoPage);

app.use(authRoutes);
app.use(perfilRoutes);
app.use(publicRoutes);
app.use(tatuagemRoutes);
app.use(perfilProfissionalRoutes);
app.use(avaliacaoRoutes);
app.use(agendamentoRoutes);
app.use(tatuadorRoutes);
app.use(localizacaoRoutes);
app.use(adminRoutes);

app.get("/", (req, res) => {
  res.set("X-Robots-Tag", "index, follow");
  res.type("html").send(renderStaticSeoPage(req, "index.html", staticSeoPages["index.html"](req)));
});

app.use((error, req, res, next) => {
  if (!error) {
    next();
    return;
  }

  if (error.name === "MulterError") {
    res.status(400).json({ erro: error.message });
    return;
  }

  if (error.statusCode) {
    res.status(error.statusCode).json({ erro: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ erro: "Erro interno do servidor" });
});

app.prepare = prepareApp;

module.exports = app;
