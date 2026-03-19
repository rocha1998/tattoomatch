# Deploy TattooMatch no Render

## Entrada da aplicacao

- O backend deve ser iniciado por [server.js](/c:/Users/Rafael/backend/server.js).
- O comando correto de start ja esta em [package.json](/c:/Users/Rafael/backend/package.json): `npm start`
- O `server.js` usa `env.port`, que le `process.env.PORT` em [src/config/env.js](/c:/Users/Rafael/backend/src/config/env.js).
- O arquivo [app.js](/c:/Users/Rafael/backend/app.js) na raiz e legado e nao deve ser usado para subir a API.

## Variaveis de ambiente

Preencha no Render:

- `SITE_URL=https://seu-servico.onrender.com`
- `JWT_SECRET=troque-por-uma-chave-segura`
- `DB_HOST=host-do-postgres`
- `DB_PORT=5432`
- `DB_NAME=nome-do-banco`
- `DB_USER=usuario-do-banco`
- `DB_PASSWORD=senha-do-banco`
- `CORS_ORIGINS=https://seu-servico.onrender.com`
- `MERCADO_PAGO_ACCESS_TOKEN=...`
- `MERCADO_PAGO_WEBHOOK_TOKEN=...`
- `PAYMENT_TEST_MODE=false`

Observacoes:

- O Render injeta `PORT` automaticamente. Nao fixe porta manualmente em producao.
- Se houver frontend em outro dominio, adicione esse dominio em `CORS_ORIGINS` separado por virgula.
- O arquivo [.env.example](/c:/Users/Rafael/backend/.env.example) esta alinhado com essas variaveis.

## Banco

- O startup prepara os schemas essenciais automaticamente.
- Se a preparacao do banco falhar, o processo encerra com erro. Isso e esperado e evita subir um app quebrado.
- Garanta que o Postgres do Render aceite conexao a partir da aplicacao e que as credenciais estejam corretas.

## Pagamentos

- O fluxo atual usa apenas Mercado Pago.
- Em producao, configure:
  - `MERCADO_PAGO_ACCESS_TOKEN`
  - `MERCADO_PAGO_WEBHOOK_TOKEN`
  - `SITE_URL`
- O webhook deve apontar para:
  - `https://seu-servico.onrender.com/webhook/payment?provider=mercado_pago&token=SEU_TOKEN`

## CORS e URL publica

- Em [src/app.js](/c:/Users/Rafael/backend/src/app.js), o CORS agora exige `CORS_ORIGINS` em producao.
- Em [src/app.js](/c:/Users/Rafael/backend/src/app.js), `trust proxy` esta habilitado para funcionar corretamente atras do proxy do Render.
- `SITE_URL` deve estar preenchido em producao para links de recuperacao, sitemap, canonical e callbacks de pagamento.

## Arquivos estaticos

- O Express serve apenas os HTMLs publicos conhecidos e os diretorios `uploads`, `styles` e `scripts`.
- A raiz inteira do projeto nao e publicada.

## Comandos sugeridos no Render

- Build Command: `npm install`
- Start Command: `npm start`

## Checklist antes de publicar

- `npm start` sobe localmente sem erro
- `SITE_URL` aponta para a URL publica correta
- `CORS_ORIGINS` inclui todos os dominios reais do frontend
- `PAYMENT_TEST_MODE=false` em producao
- `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_TOKEN` configurados
- Banco acessivel a partir do Render

## Possiveis pontos de atencao no Render

- Se `CORS_ORIGINS` ficar vazio em producao, a API vai bloquear origens de navegador.
- Se `SITE_URL` nao estiver configurado, links de recuperacao e callbacks podem usar URL incorreta.
- A rota de geolocalizacao depende de um servico externo por IP. Se esse servico falhar, o sistema faz fallback seguro retornando `cidade` e `estado` nulos.
