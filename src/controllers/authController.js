const bcrypt = require("bcrypt");
const crypto = require("crypto");

const pool = require("../config/db");
const { createAccessToken } = require("../helpers/auth");
const { getPaginaFromRequest, registrarEvento } = require("../helpers/analytics");
const { ensureUserSchema } = require("../helpers/userSchema");

async function register(req, res) {
  const { usuario, email, senha } = req.body;

  if (!usuario || !email || !senha) {
    return res.status(400).json({ erro: "Preencha todos os campos" });
  }

  if (usuario.length < 3) {
    return res.status(400).json({ erro: "Usuario precisa ter 3+ caracteres" });
  }

  if (!email.includes("@")) {
    return res.status(400).json({ erro: "Email invalido" });
  }

  if (senha.length < 6) {
    return res.status(400).json({ erro: "Senha precisa ter 6+ caracteres" });
  }

  try {
    await ensureUserSchema();

    const existeEmail = await pool.query(
      "SELECT id FROM usuarios WHERE email = $1",
      [email]
    );

    if (existeEmail.rows.length > 0) {
      return res.status(400).json({ erro: "Email ja cadastrado" });
    }

    const existeUsuario = await pool.query(
      "SELECT id FROM usuarios WHERE usuario = $1",
      [usuario]
    );

    if (existeUsuario.rows.length > 0) {
      return res.status(400).json({ erro: "Usuario ja existe" });
    }

    const senhaCriptografada = await bcrypt.hash(senha, 10);

    const novoUsuario = await pool.query(
      `INSERT INTO usuarios (usuario, email, senha)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [usuario, email, senhaCriptografada]
    );

    await registrarEvento({
      tipoEvento: "cadastro",
      usuarioId: novoUsuario.rows[0].id,
      pagina: getPaginaFromRequest(req, "/login.html"),
    });

    res.status(201).json({ mensagem: "Conta criada com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro no servidor" });
  }
}

async function login(req, res) {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: "Preencha usuario e senha" });
  }

  try {
    await ensureUserSchema();

    const resultado = await pool.query(
      "SELECT * FROM usuarios WHERE usuario = $1",
      [usuario]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ erro: "Usuario ou senha invalidos" });
    }

    const usuarioBanco = resultado.rows[0];

    if (usuarioBanco.is_blocked === true) {
      return res.status(403).json({ erro: "Usuario bloqueado pela administracao" });
    }

    const senhaValida = await bcrypt.compare(senha, usuarioBanco.senha);

    if (!senhaValida) {
      return res.status(401).json({ erro: "Usuario ou senha invalidos" });
    }

    const tatuador = await pool.query(
      "SELECT id FROM tatuadores WHERE usuario_id = $1",
      [usuarioBanco.id]
    );

    const tipo = tatuador.rows.length > 0 ? "tatuador" : "cliente";

    const token = createAccessToken({
      id: usuarioBanco.id,
      usuario: usuarioBanco.usuario,
      email: usuarioBanco.email,
      tipo,
      is_admin: usuarioBanco.is_admin === true,
      is_blocked: usuarioBanco.is_blocked === true,
    });

    await registrarEvento({
      tipoEvento: "login",
      usuarioId: usuarioBanco.id,
      pagina: getPaginaFromRequest(req, "/login.html"),
    });

    res.json({
      mensagem: "Login aprovado",
      token,
      tipo,
      is_admin: usuarioBanco.is_admin === true,
      is_blocked: usuarioBanco.is_blocked === true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro no servidor" });
  }
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function getBaseUrl(req) {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/+$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
}

async function forgotPassword(req, res) {
  const email = String(req.body.email ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return res.status(400).json({ erro: "Informe um email valido" });
  }

  try {
    await ensureUserSchema();

    const userResult = await pool.query(
      "SELECT id, email FROM usuarios WHERE LOWER(email) = $1 LIMIT 1",
      [email]
    );

    if (userResult.rows.length > 0) {
      const usuario = userResult.rows[0];
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(token);

      await pool.query(
        `DELETE FROM password_reset_tokens
         WHERE usuario_id = $1
            OR expires_at <= NOW()
            OR used_at IS NOT NULL`,
        [usuario.id]
      );

      await pool.query(
        `INSERT INTO password_reset_tokens (usuario_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [usuario.id, tokenHash]
      );

      const resetUrl = `${getBaseUrl(req)}/reset-password.html?token=${encodeURIComponent(token)}`;
      console.log(`Link de recuperacao para ${usuario.email}: ${resetUrl}`);

      const response = {
        mensagem: "Se o email existir, enviamos as instrucoes de recuperacao.",
      };

      if (process.env.NODE_ENV !== "production") {
        response.preview_url = resetUrl;
      }

      return res.json(response);
    }

    return res.json({
      mensagem: "Se o email existir, enviamos as instrucoes de recuperacao.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Erro ao iniciar recuperacao de senha" });
  }
}

async function validateResetToken(req, res) {
  const token = String(req.query.token ?? "").trim();

  if (!token) {
    return res.status(400).json({ erro: "Token ausente" });
  }

  try {
    await ensureUserSchema();

    const result = await pool.query(
      `SELECT id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [hashResetToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ erro: "Token invalido ou expirado" });
    }

    return res.json({ mensagem: "Token valido" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Erro ao validar token de recuperacao" });
  }
}

async function resetPassword(req, res) {
  const token = String(req.body.token ?? "").trim();
  const novaSenha = String(req.body.nova_senha ?? "");

  if (!token) {
    return res.status(400).json({ erro: "Token ausente" });
  }

  if (novaSenha.length < 6) {
    return res.status(400).json({ erro: "Senha precisa ter 6+ caracteres" });
  }

  try {
    await ensureUserSchema();

    const tokenResult = await pool.query(
      `SELECT id, usuario_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [hashResetToken(token)]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ erro: "Token invalido ou expirado" });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    const resetToken = tokenResult.rows[0];

    await pool.query("UPDATE usuarios SET senha = $1 WHERE id = $2", [
      senhaHash,
      resetToken.usuario_id,
    ]);

    await pool.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1",
      [resetToken.id]
    );

    return res.json({ mensagem: "Senha redefinida com sucesso" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Erro ao redefinir senha" });
  }
}

module.exports = {
  forgotPassword,
  login,
  register,
  resetPassword,
  validateResetToken,
};
