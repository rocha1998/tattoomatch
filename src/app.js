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
const renderProductionOrigin = "https://tattoomatch-3.onrender.com";

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function isLocalDevelopmentOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

const allowedOrigins = new Set(
  [renderProductionOrigin, env.siteUrl, ...env.corsOrigins]
    .map(normalizeOrigin)
    .filter(Boolean)
);

const publicRootFiles = [
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
  "navbar.html",
  "footer.html",
];

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

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (!env.corsOrigins.length) {
        if (isProduction) {
          if (allowedOrigins.has(normalizeOrigin(origin))) {
            callback(null, true);
            return;
          }

          callback(new Error("Origem nao permitida pelo CORS"));
          return;
        }

        if (isLocalDevelopmentOrigin(normalizeOrigin(origin)) || allowedOrigins.has(normalizeOrigin(origin))) {
          callback(null, true);
          return;
        }

        callback(new Error("Origem nao permitida pelo CORS"));
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (allowedOrigins.has(normalizedOrigin) || (!isProduction && isLocalDevelopmentOrigin(normalizedOrigin))) {
        callback(null, true);
        return;
      }

      callback(new Error("Origem nao permitida pelo CORS"));
    },
  })
);
app.post("/webhook/payment", express.raw({ type: "application/json" }), webhookPagamento);
app.use(express.json());
app.use(limiter);
app.use("/uploads", express.static(uploadsDir));
app.use("/styles", express.static(path.join(env.rootDir, "styles")));
app.use("/scripts", express.static(path.join(env.rootDir, "scripts")));

for (const filename of publicRootFiles) {
  app.get(`/${filename}`, (req, res) => {
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
  res.sendFile(path.join(env.rootDir, "index.html"));
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
