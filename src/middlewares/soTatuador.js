module.exports = function(req, res, next){

  if(req.usuario.tipo !== "tatuador"){
    return res.status(403).json({ erro: "Acesso permitido apenas para tatuadores" })
  }

  next()
}