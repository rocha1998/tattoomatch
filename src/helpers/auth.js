const jwt = require("jsonwebtoken");

const env = require("../config/env");

function createAccessToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      usuario: usuario.usuario,
      email: usuario.email,
      tipo: usuario.tipo,
      is_admin: usuario.is_admin === true,
      is_blocked: usuario.is_blocked === true,
    },
    env.jwtSecret,
    { expiresIn: "1h" }
  );
}

module.exports = { createAccessToken };
