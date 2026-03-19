async function detectarLocalizacao(req, res) {
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`https://ip-api.com/json/${String(ip).trim()}`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    res.json({
      cidade: data.city || null,
      estado: data.regionName || null,
    });
  } catch (error) {
    console.error(error);
    res.json({
      cidade: null,
      estado: null,
    });
  }
}

module.exports = { detectarLocalizacao };
