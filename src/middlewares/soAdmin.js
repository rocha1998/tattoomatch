module.exports = function soAdmin(req, res, next) {
  if (!req.usuario || req.usuario.is_admin !== true) {
    return res.status(403).json({ erro: "Acesso permitido apenas para administradores" });
  }

  next();
};
