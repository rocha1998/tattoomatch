const app = require("./src/app");
const env = require("./src/config/env");

async function startServer() {
  await app.prepare();

  app.listen(env.port, () => {
    console.log(`Servidor TattooMatch rodando na porta ${env.port}`);
  });
}

startServer().catch((error) => {
  console.error("Falha ao preparar dependencias essenciais do banco:", error);
  process.exit(1);
});
