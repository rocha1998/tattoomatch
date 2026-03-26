function getSafeLocationFallback() {
  return {
    cidade: null,
    estado: null,
  };
}

function getDebugPreview(value) {
  return String(value || "").slice(0, 200);
}

async function detectarLocalizacao(req, res) {
  let timeoutId;

  try {
    let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (Array.isArray(ip)) {
      [ip] = ip;
    }

    if (typeof ip === "string" && ip.includes(",")) {
      [ip] = ip.split(",");
    }

    if (ip === "::1" || ip === "127.0.0.1") {
      ip = "";
    }

    const normalizedIp = String(ip || "").trim();
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`https://ip-api.com/json/${normalizedIp}`, {
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const bodyText = await response.text();

    if (!response.ok) {
      console.error("[localizacao] API externa retornou erro HTTP", {
        status: response.status,
        statusText: response.statusText,
        ip: normalizedIp || "(vazio)",
        contentType,
        bodyPreview: getDebugPreview(bodyText),
      });
      res.json(getSafeLocationFallback());
      return;
    }

    if (!contentType.toLowerCase().includes("application/json")) {
      console.error("[localizacao] API externa retornou content-type inesperado", {
        status: response.status,
        ip: normalizedIp || "(vazio)",
        contentType,
        bodyPreview: getDebugPreview(bodyText),
      });
      res.json(getSafeLocationFallback());
      return;
    }

    if (!bodyText.trim()) {
      console.error("[localizacao] API externa retornou body vazio", {
        status: response.status,
        ip: normalizedIp || "(vazio)",
        contentType,
      });
      res.json(getSafeLocationFallback());
      return;
    }

    let data;

    try {
      data = JSON.parse(bodyText);
    } catch (error) {
      console.error("[localizacao] Falha ao fazer parse do JSON da API externa", {
        message: error.message,
        ip: normalizedIp || "(vazio)",
        contentType,
        bodyPreview: getDebugPreview(bodyText),
      });
      res.json(getSafeLocationFallback());
      return;
    }

    if (data?.status && data.status !== "success") {
      console.error("[localizacao] API externa retornou falha de localizacao", {
        ip: normalizedIp || "(vazio)",
        apiStatus: data.status,
        message: data.message || null,
      });
      res.json(getSafeLocationFallback());
      return;
    }

    res.json({
      cidade: data.city || null,
      estado: data.regionName || null,
    });
  } catch (error) {
    console.error("[localizacao] Erro ao detectar localizacao", {
      message: error.message,
      name: error.name,
    });
    res.json(getSafeLocationFallback());
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

module.exports = { detectarLocalizacao };
