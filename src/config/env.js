const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..", "..");
const envFilePath = path.join(rootDir, ".env");

loadEnvFile(envFilePath);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const fileContents = fs.readFileSync(filePath, "utf8");
  const lines = fileContents.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "on", "sim"].includes(String(value).trim().toLowerCase());
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }

  return value;
}

module.exports = {
  rootDir,
  uploadsDir: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(rootDir, "uploads"),
  port: toNumber(process.env.PORT, 3000),
  siteUrl: process.env.SITE_URL || "",
  mercadoPagoAccessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
  mercadoPagoWebhookToken: process.env.MERCADO_PAGO_WEBHOOK_TOKEN || "",
  paymentTestMode: toBoolean(process.env.PAYMENT_TEST_MODE, process.env.NODE_ENV !== "production"),
  corsOrigins: parseCsv(process.env.CORS_ORIGINS),
  jwtSecret: requireEnv("JWT_SECRET"),
  db: {
    user: requireEnv("DB_USER"),
    host: process.env.DB_HOST || "localhost",
    database: requireEnv("DB_NAME"),
    password: requireEnv("DB_PASSWORD"),
    port: toNumber(process.env.DB_PORT, 5432),
  },
};
