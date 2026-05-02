const nodemailer = require("nodemailer");

let transporterPromise = null;

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || "";
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || "";

  const enabled = Boolean(host && port && user && pass && from);

  return {
    enabled,
    from,
    transport: enabled
      ? {
          host,
          port,
          secure: port === 465,
          auth: {
            user,
            pass,
          },
        }
      : null,
  };
}

async function getTransporter() {
  const smtp = getSmtpConfig();

  if (!smtp.enabled) {
    return null;
  }

  if (!transporterPromise) {
    transporterPromise = Promise.resolve(nodemailer.createTransport(smtp.transport));
  }

  return transporterPromise;
}

async function sendPasswordResetEmail({ to, resetUrl }) {
  const smtp = getSmtpConfig();
  const transporter = await getTransporter();

  if (!smtp.enabled || !transporter) {
    return { sent: false, skipped: true };
  }

  const info = await transporter.sendMail({
    from: smtp.from,
    to,
    subject: "Redefinicao de senha - TattooMatch",
    text: [
      "Recebemos um pedido para redefinir sua senha no TattooMatch.",
      "",
      `Abra este link para escolher uma nova senha: ${resetUrl}`,
      "",
      "Se voce nao solicitou essa redefinicao, ignore este email.",
      "Este link expira em 1 hora.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f1f1f;">
        <h2 style="margin-bottom: 12px;">Redefina sua senha</h2>
        <p>Recebemos um pedido para redefinir sua senha no TattooMatch.</p>
        <p>
          <a
            href="${resetUrl}"
            style="display:inline-block;padding:12px 18px;border-radius:999px;background:#ef8354;color:#140f0c;text-decoration:none;font-weight:700;"
          >Redefinir senha</a>
        </p>
        <p>Se preferir, copie e cole este link no navegador:</p>
        <p>${resetUrl}</p>
        <p>Se voce nao solicitou essa redefinicao, ignore este email.</p>
        <p>Este link expira em 1 hora.</p>
      </div>
    `,
  });

  return {
    sent: true,
    skipped: false,
    messageId: info.messageId,
  };
}

module.exports = {
  sendPasswordResetEmail,
};
