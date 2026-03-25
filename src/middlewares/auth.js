const jwt = require("jsonwebtoken");

const pool = require("../config/db");
const env = require("../config/env");

async function autenticarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ mensagem: "Token ausente" });
  }

  try {
    const usuario = jwt.verify(token, env.jwtSecret);
    const result = await pool.query(
      "SELECT usuario, email, is_admin, is_blocked FROM usuarios WHERE id = $1",
      [usuario.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ mensagem: "Usuario nao encontrado" });
    }

    if (result.rows[0].is_blocked === true) {
      return res.status(403).json({ mensagem: "Usuario bloqueado pela administracao" });
    }

    req.usuario = {
      ...usuario,
      usuario: result.rows[0].usuario || usuario.usuario,
      email: result.rows[0].email || usuario.email,
      is_admin: result.rows[0].is_admin === true,
      is_blocked: result.rows[0].is_blocked === true,
    };
    next();
  } catch (error) {
    return res.status(403).json({ mensagem: "Token invalido" });
  }
}

module.exports = autenticarToken;
