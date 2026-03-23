const env = require("../config/env");

function getBaseUrl(req) {
  if (env.siteUrl) {
    return env.siteUrl.replace(/\/+$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
}

function isMercadoPagoConfigured() {
  return Boolean(env.mercadoPagoAccessToken);
}

function buildMercadoPagoUrls({ req, paymentId }) {
  const baseUrl = getBaseUrl(req);
  const baseParams = {
    payment_id: String(paymentId),
    provider: "mercado_pago",
  };

  return {
    success: `${baseUrl}/pagamento-sucesso.html?${new URLSearchParams({
      ...baseParams,
    }).toString()}`,
    failure: `${baseUrl}/pagamento-cancelado.html?${new URLSearchParams({
      ...baseParams,
    }).toString()}`,
    pending: `${baseUrl}/pagamento-cancelado.html?${new URLSearchParams({
      ...baseParams,
      pending: "1",
    }).toString()}`,
  };
}

async function createMercadoPagoPreference({
  req,
  paymentId,
  amount,
  title,
  description,
}) {
  const urls = buildMercadoPagoUrls({ req, paymentId });
  const webhookUrl = env.mercadoPagoWebhookToken
    ? `${getBaseUrl(req)}/webhook/payment?provider=mercado_pago&token=${encodeURIComponent(env.mercadoPagoWebhookToken)}`
    : undefined;
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.mercadoPagoAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          title,
          description,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number(amount),
        },
      ],
      external_reference: String(paymentId),
      back_urls: urls,
      auto_return: "approved",
      notification_url: webhookUrl,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const apiMessage =
      data?.message ||
      data?.error ||
      data?.cause?.[0]?.description ||
      "Nao foi possivel criar o checkout Mercado Pago";
    throw new Error(`Mercado Pago checkout/preferences (${response.status}): ${apiMessage}`);
  }

  return data;
}

async function findMercadoPagoApprovedPayment(paymentId) {
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(paymentId)}&sort=date_created&criteria=desc`,
    {
      headers: {
        Authorization: `Bearer ${env.mercadoPagoAccessToken}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const apiMessage =
      data?.message ||
      data?.error ||
      data?.cause?.[0]?.description ||
      "Nao foi possivel validar o pagamento Mercado Pago";
    throw new Error(`Mercado Pago payments/search (${response.status}): ${apiMessage}`);
  }

  const results = Array.isArray(data?.results) ? data.results : [];
  return results.find((item) => item.status === "approved") || null;
}

async function fetchMercadoPagoPaymentById(paymentGatewayId) {
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentGatewayId)}`,
    {
      headers: {
        Authorization: `Bearer ${env.mercadoPagoAccessToken}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const apiMessage =
      data?.message ||
      data?.error ||
      data?.cause?.[0]?.description ||
      "Nao foi possivel buscar o pagamento Mercado Pago";
    throw new Error(`Mercado Pago payments/{id} (${response.status}): ${apiMessage}`);
  }

  return data;
}

module.exports = {
  createMercadoPagoPreference,
  fetchMercadoPagoPaymentById,
  findMercadoPagoApprovedPayment,
  getBaseUrl,
  isMercadoPagoConfigured,
};
