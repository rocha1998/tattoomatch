# AI_CONTEXT

## 1. Descricao do projeto

O projeto e uma plataforma chamada **TattooMatch**, focada em conectar clientes e tatuadores. A aplicacao mistura:

- **Backend Node.js + Express** para autenticacao, perfis, portfolio, avaliacoes, ranking e agendamentos.
- **Frontend estatico em HTML/CSS/JavaScript puro** servido pelo mesmo servidor Express.
- **Banco PostgreSQL** para persistir usuarios, tatuadores, planos, subscriptions, tatuagens, avaliacoes, visualizacoes de perfil e agendamentos.

Existem duas personas principais:

- **Cliente**: cria conta, busca tatuadores, visualiza perfis, envia pedidos de agendamento e acompanha seus agendamentos.
- **Tatuador**: nasce como usuario comum e pode se transformar em tatuador, editar perfil profissional, publicar portfolio, acompanhar pedidos e gerenciar status de agendamentos.

## 2. Arquitetura do sistema

Arquitetura em camadas simples, sem framework de frontend:

- `server.js`: ponto de entrada correto que sobe o servidor HTTP.
- `src/app.js`: configuracao principal do Express.
- `src/config/*`: variaveis de ambiente, conexao com banco e upload de arquivos.
- `src/routes/*`: definicao das rotas HTTP.
- `src/controllers/*`: regras de negocio e acesso ao banco.
- `src/middlewares/*`: autenticacao JWT e restricao de acesso para tatuadores.
- `src/helpers/*`: utilitarios de token, strings e lookup de tatuador.
- arquivos `.html` na raiz: frontend estatico.
- `styles/theme.css`: tokens visuais compartilhados.
- `test/api.test.js`: testes de integracao da API usando `node:test`.

Fluxo geral:

1. O navegador carrega paginas HTML estaticas servidas pelo Express.
2. O frontend usa `fetch` contra `http://localhost:3000`.
3. As rotas chamam controllers.
4. Os controllers executam queries SQL diretamente via `pg`.
5. JWT e middlewares controlam acesso a rotas privadas.

## 3. Estrutura de pastas

```text
backend/
  server.js
  app.js
  package.json
  .env.example
  index.html
  login.html
  home.html
  tatuadores.html
  perfil.html
  painel.html
  editar-perfil.html
  meus-agendamentos.html
  ranking.html
  navbar.html
  styles/
    theme.css
  src/
    app.js
    config/
      db.js
      env.js
      upload.js
    controllers/
      authController.js
      perfilController.js
      perfilProfissionalController.js
      publicController.js
      tatuadorController.js
      tatuagemController.js
      avaliacaoController.js
      agendamentoController.js
      localizacaoController.js
    middlewares/
      auth.js
      soTatuador.js
    helpers/
      auth.js
      strings.js
      tatuador.js
    routes/
      authRoutes.js
      perfilRoutes.js
      perfilProfissionalRoutes.js
      publicRoutes.js
      tatuadorRoutes.js
      tatuagemRoutes.js
      avaliacaoRoutes.js
      agendamentoRoutes.js
      localizacaoRoutes.js
  test/
    api.test.js
  uploads/
    ...
```

Observacao:

- `src/app.js` e o app principal em uso.
- `app.js` na raiz e um script frontend legado/demo e nao e o backend principal.

## 4. Tecnologias utilizadas

- **Node.js**
- **Express 5**
- **PostgreSQL**
- **pg** para acesso ao banco
- **jsonwebtoken** para autenticacao JWT
- **bcrypt** para hash de senha
- **multer** para upload de imagens
- **cors** liberado globalmente
- **express-rate-limit** para limitar requisicoes
- **HTML + CSS + JavaScript vanilla** no frontend
- **node:test** + `assert` para testes

## 5. Fluxo de autenticacao

### Cadastro

- Rota: `POST /register`
- Controller: `authController.register`
- Validacoes:
  - `usuario`, `email` e `senha` obrigatorios
  - usuario com minimo de 3 caracteres
  - email deve conter `@`
  - senha com minimo de 6 caracteres
- Regras:
  - email nao pode estar duplicado
  - username nao pode estar duplicado
  - senha e armazenada com `bcrypt.hash(..., 10)`

### Login

- Rota: `POST /login`
- Controller: `authController.login`
- Busca usuario por `usuario`
- Compara senha com `bcrypt.compare`
- Detecta tipo do usuario:
  - `cliente` se nao existir registro em `tatuadores`
  - `tatuador` se existir registro em `tatuadores`
- Gera JWT com:
  - `id`
  - `usuario`
  - `email`
  - `tipo`
- Expiracao do token: **1 hora**

### Persistencia no frontend

- O frontend salva o token em `localStorage` com a chave `token`.
- Varias paginas decodificam o payload do JWT no navegador com `atob(...)` para adaptar a UI.
- Ao transformar um cliente em tatuador, a API devolve um novo token com `tipo: "tatuador"` e o frontend substitui o token anterior.

## 6. Fluxo de agendamentos

### Criacao do pedido pelo cliente

- Tela principal: `perfil.html`
- Rota: `POST /agendamentos`
- Exige JWT
- Dados enviados:
  - `cliente_nome`
  - `cliente_whatsapp`
  - `descricao`
  - `parte_corpo`
  - `tamanho`
  - `data_solicitada`
  - `tatuador_id`
- O `cliente_id` vem do token autenticado
- A API valida se o `tatuador_id` existe antes de inserir

### Acompanhamento pelo cliente

- Tela: `meus-agendamentos.html`
- Rotas:
  - `GET /meus-agendamentos`
  - `GET /meus-agendamentos/:email`
- O fluxo principal do frontend usa `GET /meus-agendamentos`
- O endpoint por email so permite consultar o proprio email autenticado

### Gestao pelo tatuador

- Tela: `painel.html`
- Primeiro o frontend consulta `GET /perfil-profissional` para descobrir o `id` do tatuador logado
- Depois carrega `GET /tatuador/:id/agendamentos`
- A API so permite acessar os agendamentos se:
  - o usuario estiver autenticado
  - o tipo do token for `tatuador`
  - o `:id` da rota for exatamente o tatuador vinculado ao usuario logado

### Acoes do tatuador

- `PATCH /agendamentos/:id/aprovar`
  - muda status para `APROVADO`
- `PATCH /agendamentos/:id/sugerir-data`
  - recebe `nova_data`
  - muda status para `DATA_SUGERIDA`
  - grava `data_sugerida`
- `PATCH /agendamentos/:id/concluir`
  - so pode concluir se status atual for `APROVADO`
  - muda status para `CONCLUIDO`

### Notificacoes

- `GET /agendamentos/novos`
- Conta agendamentos do tatuador com `visualizado = false`
- Quando o tatuador lista seus agendamentos, a API marca todos como `visualizado = true`

## 7. Rotas da API

### Autenticacao

- `POST /register`
- `POST /login`

### Perfil do usuario

- `GET /perfil`
- `PUT /perfil`
- `DELETE /perfil`
- `POST /perfil/foto`

### Perfil profissional / tatuador autenticado

- `PUT /perfil-profissional`
- `GET /perfil-profissional`
- `POST /tornar-tatuador`
- `GET /meu-plano`

### Descoberta publica

- `GET /tatuadores`
- `GET /tatuador/:id`
- `GET /ranking`
- `GET /tatuadores-destaque`
- `GET /ranking/:cidade`
- `GET /ranking/:cidade/:estilo`
- `GET /localizacao`

### Portfolio

- `POST /tatuagens`
- `DELETE /tatuagens/:id`

### Avaliacoes

- `POST /avaliar/:usuario`

### Agendamentos

- `POST /agendamentos`
- `GET /tatuador/:id/agendamentos`
- `PATCH /agendamentos/:id/aprovar`
- `PATCH /agendamentos/:id/concluir`
- `PATCH /agendamentos/:id/sugerir-data`
- `GET /meus-agendamentos/:email`
- `GET /meus-agendamentos`
- `GET /agendamentos/novos`

## 8. Regras de seguranca (JWT, middleware etc)

### JWT

- Segredo vindo de `JWT_SECRET` em `.env`
- Token criado em `src/helpers/auth.js`
- Token validado em `src/middlewares/auth.js`
- O middleware:
  - le header `Authorization: Bearer <token>`
  - responde `401` se token estiver ausente
  - responde `403` se token for invalido
  - injeta payload em `req.usuario`

### Middleware de papel

- `src/middlewares/soTatuador.js`
- Exige `req.usuario.tipo === "tatuador"`
- Bloqueia rotas de painel/gestao do lado do tatuador

### Senhas

- Nunca sao salvas em texto puro
- Hash com bcrypt, custo 10

### Banco

- Todas as queries usam placeholders (`$1`, `$2`, ...), reduzindo risco de SQL injection

### Rate limit

- Configurado globalmente em `src/app.js`
- Janela: 15 minutos
- Limite: 100 requests
- Em desenvolvimento e localhost, o limitador e ignorado

### Uploads

- `multer` grava arquivos diretamente em `uploads/`
- `uploads/` e exposto estaticamente em `/uploads`

### CORS

- `cors()` esta habilitado globalmente sem restricao de origem

### Pontos de atencao de seguranca

- `POST /avaliar/:usuario` e publico e nao exige autenticacao
- `POST /perfil/foto` faz upload, mas nao persiste o nome do arquivo no usuario
- varias paginas confiam no payload do JWT decodificado no frontend apenas para mudar interface; a protecao real continua sendo do backend
- `GET /localizacao` depende de chamada externa a `ip-api.com`

## 9. Como o frontend se comunica com o backend

O frontend e composto por paginas HTML estaticas servidas pelo mesmo Express, mas as chamadas de API usam URL absoluta `http://localhost:3000`.

Padrao de comunicacao:

- `fetch(...)` com JSON para a maioria das rotas
- `fetch(...)` com `FormData` para uploads
- token JWT salvo em `localStorage`
- envio do token por `Authorization: Bearer <token>`
- paginas carregam `navbar.html` via `fetch("/navbar.html")`

Paginas principais e suas integracoes:

- `login.html`
  - `POST /login`
  - `POST /register`
- `home.html`
  - `POST /tornar-tatuador`
  - `GET /tatuadores-destaque`
- `tatuadores.html`
  - `GET /localizacao`
  - `GET /tatuadores` com filtros `estado`, `cidade`, `municipio`, `estilo`
- `perfil.html`
  - `GET /tatuador/:id`
  - `POST /avaliar/:usuario`
  - `POST /agendamentos`
  - `GET /meu-plano`
  - `POST /tatuagens`
  - `DELETE /tatuagens/:id`
- `editar-perfil.html`
  - `GET /perfil-profissional`
  - `PUT /perfil-profissional`
- `painel.html`
  - `GET /perfil-profissional`
  - `GET /tatuador/:id/agendamentos`
  - `PATCH /agendamentos/:id/aprovar`
  - `PATCH /agendamentos/:id/concluir`
  - `PATCH /agendamentos/:id/sugerir-data`
  - `GET /agendamentos/novos`
- `meus-agendamentos.html`
  - `GET /meus-agendamentos`
- `ranking.html`
  - `GET /ranking`

## 10. Observacoes importantes para desenvolvimento futuro

### Estrutura e manutencao

- O projeto atualmente junta backend, frontend estatico e arquivos legados na mesma raiz.
- `app.js` na raiz nao e o app principal; o ponto correto do backend e `src/app.js`.
- Os controllers acessam SQL diretamente; se o projeto crescer, pode valer separar services/repositorios.

### Dependencias externas

- A rota `/localizacao` usa `fetch` para `http://ip-api.com/json/...`.
- Isso adiciona dependencia de rede externa e pode falhar em ambientes restritos.

### Banco de dados esperado

- O codigo pressupoe varias tabelas ja existentes, incluindo:
  - `usuarios`
  - `tatuadores`
  - `subscriptions`
  - `plans`
  - `tatuagens`
  - `avaliacoes`
  - `perfil_views`
  - `agendamentos`
- Nao ha migracoes/versionamento de schema no repositorio.

### Regras de negocio existentes

- Um usuario comum pode virar tatuador via `POST /tornar-tatuador`.
- Ao virar tatuador:
  - e criado registro em `tatuadores`
  - e criada subscription com `plan_id = 1`
  - novo JWT e emitido
- O limite do portfolio depende do plano atual em `plans.portfolio_limit`.

### Riscos ou inconsistencias atuais

- `perfil.html` envia `cliente_email` no agendamento, mas o backend nao usa esse campo na insercao.
- `avaliacaoController` grava `usuario_id` do proprio tatuador avaliado, nao do cliente autenticado ou visitante; isso pode afetar rastreabilidade das avaliacoes.
- `GET /ranking/:cidade` usa `ILIKE $1` sem adicionar `%...%`, diferente de outros filtros.
- `POST /perfil/foto` faz upload isolado e responde sucesso, mas nao integra com `usuarios` nem com `tatuadores`.
- O frontend usa muitas strings absolutas `http://localhost:3000`; para deploy, convem centralizar configuracao.
- O arquivo `.env` e obrigatorio porque `JWT_SECRET`, `DB_USER`, `DB_NAME` e `DB_PASSWORD` sao exigidos por `env.js`.

### Testes

- `test/api.test.js` cobre fluxos principais:
  - listagem publica
  - ranking
  - perfil publico
  - cadastro/login/perfil/tornar tatuador
  - protecao de rotas
  - criacao e consulta de agendamentos
  - criacao de avaliacao
- Os testes dependem de banco real e de dados existentes, incluindo tatuador com `id = 1` e usuario `rafael`.

### Sugestoes naturais de evolucao

- adicionar migracoes de banco
- centralizar configuracao de `API_BASE`
- restringir CORS por ambiente
- exigir autenticacao ou regra antifraude para avaliacoes
- registrar dono/autor real da avaliacao
- melhorar modelagem de upload de foto de perfil
- separar frontend e backend ou organizar uma pasta dedicada para assets/paginas
