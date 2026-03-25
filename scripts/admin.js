(function initAdminApp() {
  const {
    buildPublicProfileUrl,
    buildUploadUrl,
    escapeHtml,
    fetchAuthJson,
    logout,
    requireAuth,
  } = window.FrontendUtils;

  const adminLinks = [
    { key: "dashboard", href: "/admin-dashboard.html", label: "Dashboard" },
    { key: "usuarios", href: "/admin-usuarios.html", label: "Usuarios" },
    { key: "tatuadores", href: "/admin-tatuadores.html", label: "Tatuadores" },
    { key: "assinaturas", href: "/admin-assinaturas.html", label: "Assinaturas" },
    { key: "analytics", href: "/admin-analytics.html", label: "Analytics" },
  ];

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function getInitials(value) {
    return String(value || "A")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "A";
  }

  function showFlash(message, type = "info") {
    const flash = document.getElementById("adminFlash");
    if (!flash) {
      return;
    }

    if (!message) {
      flash.hidden = true;
      flash.textContent = "";
      flash.className = "admin-flash";
      return;
    }

    flash.hidden = false;
    flash.textContent = message;
    flash.className = `admin-flash ${type}`;
  }

  function handleAuthFailure(result) {
    if (result.status === 401) {
      logout("/login.html");
      return true;
    }

    if (result.status === 403) {
      logout("/home.html");
      return true;
    }

    return false;
  }

  async function requestAdmin(path, options = {}) {
    const result = await fetchAuthJson(path, options);
    if (handleAuthFailure(result)) {
      return null;
    }
    return result;
  }

  function badge(label, tone = "neutral") {
    return `<span class="tm-badge ${tone}">${escapeHtml(label)}</span>`;
  }

  function renderShell({ pageKey, title, description }) {
    const auth = requireAuth();

    if (!auth) {
      throw new Error("Autenticacao obrigatoria");
    }

    const navMarkup = adminLinks
      .map(
        (link) => `
          <a class="admin-nav-link ${link.key === pageKey ? "active" : ""}" href="${link.href}">
            ${escapeHtml(link.label)}
          </a>
        `
      )
      .join("");

    document.body.className = "admin-body";
    document.body.innerHTML = `
      <div class="admin-layout">
        <aside class="admin-sidebar">
          <div class="admin-brand">
            <span class="admin-brand-mark">TM</span>
            <div>
              <strong>TattooMatch</strong>
              <p>Painel administrativo</p>
            </div>
          </div>

          <nav class="admin-nav" aria-label="Menu administrativo">
            ${navMarkup}
          </nav>

          <div class="admin-sidebar-card">
            <span class="sidebar-label">Seguranca</span>
            <p>Rotas protegidas por JWT, auth e soAdmin, com o banco como fonte de verdade para is_admin.</p>
          </div>
        </aside>

        <div class="admin-main">
          <header class="admin-topbar">
            <div>
              <span class="eyebrow">Operacao TattooMatch</span>
              <h1>${escapeHtml(title)}</h1>
              <p>${escapeHtml(description)}</p>
            </div>

            <div class="admin-topbar-actions">
              <a class="admin-link-button secondary" href="/home.html">Voltar ao site</a>
              <div class="admin-user-chip">
                <span class="admin-user-avatar">${escapeHtml(getInitials(auth.payload.usuario || auth.payload.email || "Admin"))}</span>
                <div>
                  <strong>${escapeHtml(auth.payload.usuario || "Administrador")}</strong>
                  <span>${escapeHtml(auth.payload.email || "Conta autenticada")}</span>
                </div>
              </div>
              <button id="adminLogoutButton" class="admin-link-button" type="button">Sair</button>
            </div>
          </header>

          <div id="adminFlash" class="admin-flash" hidden></div>
          <main id="adminContent" class="admin-content"></main>
        </div>
      </div>
    `;

    const logoutButton = document.getElementById("adminLogoutButton");
    if (logoutButton) {
      logoutButton.addEventListener("click", () => logout("/login.html"));
    }

    return auth;
  }

  function renderMetricGrid(metrics) {
    return `
      <section class="metrics-grid">
        ${metrics
          .map(
            (item) => `
              <article class="metric-card">
                <span class="metric-label">${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(String(item.value))}</strong>
                <p>${escapeHtml(item.help || "")}</p>
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  function renderPanel({ title, description = "", actions = "", content = "" }) {
    return `
      <section class="admin-panel">
        <div class="panel-head">
          <div>
            <h2>${escapeHtml(title)}</h2>
            ${description ? `<p>${escapeHtml(description)}</p>` : ""}
          </div>
          ${actions ? `<div class="panel-actions">${actions}</div>` : ""}
        </div>
        ${content}
      </section>
    `;
  }

  function renderTable({ columns, rows, emptyMessage = "Nenhum registro encontrado." }) {
    if (!rows.length) {
      return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    }

    return `
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderUserRows(users, currentUserId) {
    return users.map((item) => {
      const isSelf = Number(item.id) === Number(currentUserId);
      const statusBadges = [
        badge(item.tipo === "tatuador" ? "Tatuador" : "Cliente", item.tipo === "tatuador" ? "success" : "neutral"),
        item.is_admin ? badge("Admin", "accent") : badge("Padrao", "neutral"),
        item.is_blocked ? badge("Bloqueado", "warning") : badge("Ativo", "success"),
        isSelf ? badge("Voce", "neutral") : "",
      ].join(" ");

      return `
        <tr>
          <td>${escapeHtml(String(item.id))}</td>
          <td>
            <div class="table-primary">
              <strong>${escapeHtml(item.usuario)}</strong>
              <span>${escapeHtml(formatDateTime(item.created_at))}</span>
            </div>
          </td>
          <td>${escapeHtml(item.email)}</td>
          <td>${statusBadges}</td>
          <td>
            <div class="action-row">
              <button class="table-button" type="button" data-action="toggle-admin" data-id="${escapeHtml(String(item.id))}" ${isSelf && item.is_admin ? "disabled" : ""}>
                ${item.is_admin ? "Remover admin" : "Tornar admin"}
              </button>
              <button class="table-button secondary" type="button" data-action="toggle-block" data-id="${escapeHtml(String(item.id))}" ${isSelf ? "disabled" : ""}>
                ${item.is_blocked ? "Desbloquear" : "Bloquear"}
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  }

  function renderTattooerRows(items) {
    return items.map((item) => {
      const profileUrl = buildPublicProfileUrl({
        id: item.id,
        slug: item.slug,
      });

      const photoMarkup = item.foto_perfil
        ? `<img class="artist-avatar" src="${escapeHtml(buildUploadUrl(item.foto_perfil))}" alt="${escapeHtml(item.nome_artistico)}">`
        : `<div class="artist-avatar placeholder">${escapeHtml(getInitials(item.nome_artistico || item.usuario))}</div>`;

      return `
        <tr>
          <td>
            <div class="artist-cell">
              ${photoMarkup}
              <div class="table-primary">
                <strong>${escapeHtml(item.nome_artistico || item.usuario)}</strong>
                <span>${escapeHtml(item.usuario)}</span>
              </div>
            </div>
          </td>
          <td>${escapeHtml(item.cidade || "-")} / ${escapeHtml(item.bairro || "-")}</td>
          <td>
            ${badge(item.plano || "Sem plano", item.premium_ativo ? "accent" : "neutral")}
            ${item.premium_ativo ? badge("Premium", "accent") : ""}
            ${item.patrocinado_ativo ? badge("Patrocinado", "warning") : ""}
          </td>
          <td>${item.disponivel ? badge("Disponivel", "success") : badge("Indisponivel", "warning")}</td>
          <td>
            <div class="action-row">
              <a class="table-button link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer">Perfil publico</a>
              <button class="table-button" type="button" data-action="toggle-highlight" data-id="${escapeHtml(String(item.id))}" data-active="${item.patrocinado_ativo ? "true" : "false"}">
                ${item.patrocinado_ativo ? "Remover destaque" : "Ativar destaque"}
              </button>
              <button class="table-button secondary" type="button" data-action="toggle-user-block" data-user-id="${escapeHtml(String(item.usuario_id))}" data-blocked="${item.is_blocked ? "true" : "false"}">
                ${item.is_blocked ? "Desbloquear usuario" : "Bloquear usuario"}
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  }

  function renderSubscriptionRows(items) {
    return items.map((item) => {
      const profileUrl = buildPublicProfileUrl({
        id: item.tatuador_id,
        slug: item.slug,
      });

      return `
        <tr>
          <td>
            <div class="table-primary">
              <strong>${escapeHtml(item.nome_artistico || item.usuario)}</strong>
              <span>${escapeHtml(item.email)}</span>
            </div>
          </td>
          <td>${escapeHtml(item.plano)}</td>
          <td>${badge(item.status_assinatura || "ativa", item.status_assinatura === "ativa" ? "success" : "warning")}</td>
          <td>${escapeHtml(formatMoney(item.preco))}</td>
          <td>${escapeHtml(formatDateTime(item.highlight_until))}</td>
          <td>
            ${item.patrocinado ? badge("Patrocinado", "warning") : badge("Sem patrocinio", "neutral")}
            ${item.destaque_ativo ? badge("Destaque ativo", "accent") : ""}
          </td>
          <td>
            <a class="table-button link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer">Abrir perfil</a>
          </td>
        </tr>
      `;
    });
  }

  function renderDashboardUserRows(users) {
    return users.map((item) => `
      <tr>
        <td>${escapeHtml(String(item.id))}</td>
        <td>
          <div class="table-primary">
            <strong>${escapeHtml(item.usuario)}</strong>
            <span>${escapeHtml(formatDateTime(item.created_at))}</span>
          </div>
        </td>
        <td>${escapeHtml(item.email)}</td>
        <td>
          ${badge(item.tipo === "tatuador" ? "Tatuador" : "Cliente", item.tipo === "tatuador" ? "success" : "neutral")}
          ${item.is_admin ? badge("Admin", "accent") : ""}
          ${item.is_blocked ? badge("Bloqueado", "warning") : badge("Ativo", "success")}
        </td>
        <td><a class="table-button link" href="/admin-usuarios.html">Abrir gestao</a></td>
      </tr>
    `);
  }

  function renderDashboardTattooerRows(items) {
    return items.map((item) => `
      <tr>
        <td>
          <div class="table-primary">
            <strong>${escapeHtml(item.nome_artistico || item.usuario)}</strong>
            <span>${escapeHtml(item.usuario)}</span>
          </div>
        </td>
        <td>${escapeHtml(item.cidade || "-")} / ${escapeHtml(item.bairro || "-")}</td>
        <td>
          ${badge(item.plano || "Sem plano", item.premium_ativo ? "accent" : "neutral")}
          ${item.patrocinado_ativo ? badge("Patrocinado", "warning") : ""}
        </td>
        <td>${item.disponivel ? badge("Disponivel", "success") : badge("Indisponivel", "warning")}</td>
        <td>
          <a class="table-button link" href="${escapeHtml(buildPublicProfileUrl({ id: item.id, slug: item.slug }))}" target="_blank" rel="noreferrer">
            Perfil publico
          </a>
        </td>
      </tr>
    `);
  }

  function attachTableAction(root, selector, handler) {
    const buttons = root.querySelectorAll(selector);
    buttons.forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.disabled) {
          return;
        }

        button.disabled = true;
        try {
          await handler(button);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  async function initDashboardPage() {
    renderShell({
      pageKey: "dashboard",
      title: "Dashboard administrativo",
      description: "Resumo operacional, moderacao e saude comercial com dados reais da plataforma.",
    });

    const content = document.getElementById("adminContent");
    content.innerHTML = `<div class="loading-state">Carregando indicadores do painel...</div>`;

    const result = await requestAdmin("/admin/dashboard");
    if (!result) {
      return;
    }

    if (!result.ok || !result.data) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(result.error || "Nao foi possivel carregar o dashboard.")}</div>`;
      return;
    }

    const { resumo, recentes, moderacao } = result.data;

    content.innerHTML = `
      ${renderMetricGrid([
        { label: "Total de usuarios", value: resumo.totalUsuarios, help: "Base completa cadastrada no TattooMatch." },
        { label: "Total de tatuadores", value: resumo.totalTatuadores, help: "Perfis profissionais encontrados no schema atual." },
        { label: "Assinaturas ativas", value: resumo.assinaturasAtivas, help: "Subscriptions com status ativo." },
        { label: "Premium ativos", value: resumo.premiumAtivos, help: "Planos com prioridade alta e status ativo." },
        { label: "Patrocinados ativos", value: resumo.patrocinadosAtivos, help: "Tatuadores com highlight vigente." },
        { label: "Receita estimada", value: formatMoney(resumo.receitaEstimada), help: "Soma dos planos ativos + destaque semanal ativo." },
      ])}

      <section class="admin-grid two-columns">
        ${renderPanel({
          title: "Moderacao",
          description: "Visao pronta para evoluir com mais automacoes depois.",
          content: `
            <div class="moderation-grid">
              <article class="moderation-card">
                <span>Usuarios bloqueados</span>
                <strong>${escapeHtml(String(moderacao.usuariosBloqueados || 0))}</strong>
              </article>
              <article class="moderation-card">
                <span>Usuarios ativos (30 dias)</span>
                <strong>${escapeHtml(String(resumo.usuariosAtivos || 0))}</strong>
              </article>
            </div>
          `,
        })}
        ${renderPanel({
          title: "Atalhos",
          description: "Acesso rapido para as areas mais operacionais.",
          content: `
            <div class="quick-links">
              <a class="admin-link-button" href="/admin-usuarios.html">Gerenciar usuarios</a>
              <a class="admin-link-button secondary" href="/admin-tatuadores.html">Gerenciar tatuadores</a>
              <a class="admin-link-button secondary" href="/admin-assinaturas.html">Ver assinaturas</a>
              <a class="admin-link-button secondary" href="/admin-analytics.html">Abrir analytics</a>
            </div>
          `,
        })}
      </section>

      ${renderPanel({
        title: "Cadastros recentes",
        description: "Ultimos usuarios que entraram na plataforma.",
        content: renderTable({
          columns: ["ID", "Nome", "Email", "Status", "Acoes"],
          rows: renderDashboardUserRows(recentes.usuarios || []),
          emptyMessage: "Nenhum cadastro recente encontrado.",
        }),
      })}

      ${renderPanel({
        title: "Tatuadores recentes",
        description: "Perfis profissionais mais recentes com plano e destaque.",
        content: renderTable({
          columns: ["Artista", "Cidade / Bairro", "Plano", "Disponibilidade", "Acoes"],
          rows: renderDashboardTattooerRows(recentes.tatuadores || []),
          emptyMessage: "Nenhum tatuador recente encontrado.",
        }),
      })}
    `;
  }

  async function initUsersPage() {
    const auth = renderShell({
      pageKey: "usuarios",
      title: "Gestao de usuarios",
      description: "Controle de acesso, bloqueio e privilegios administrativos em um unico lugar.",
    });

    const content = document.getElementById("adminContent");
    content.innerHTML = `
      <section class="admin-panel">
        <div class="panel-head">
          <div>
            <h2>Usuarios da plataforma</h2>
            <p>Filtre, promova, bloqueie e acompanhe o status real de cada conta.</p>
          </div>
        </div>

        <div class="toolbar">
          <input id="userSearch" class="toolbar-input" type="search" placeholder="Buscar por nome ou email">
          <select id="userTypeFilter" class="toolbar-select">
            <option value="todos">Todos os tipos</option>
            <option value="cliente">Clientes</option>
            <option value="tatuador">Tatuadores</option>
          </select>
          <select id="userAdminFilter" class="toolbar-select">
            <option value="todos">Todos os papeis</option>
            <option value="admins">Somente admins</option>
            <option value="padrao">Sem admin</option>
          </select>
        </div>

        <p id="userCounter" class="panel-copy">Carregando usuarios...</p>
        <div id="usersTableHolder"></div>
      </section>
    `;

    const result = await requestAdmin("/admin/usuarios");
    if (!result) {
      return;
    }

    if (!result.ok || !Array.isArray(result.data)) {
      document.getElementById("usersTableHolder").innerHTML =
        `<div class="empty-state">${escapeHtml(result.error || "Nao foi possivel carregar os usuarios.")}</div>`;
      return;
    }

    const users = result.data.slice();
    const searchInput = document.getElementById("userSearch");
    const typeFilter = document.getElementById("userTypeFilter");
    const adminFilter = document.getElementById("userAdminFilter");
    const tableHolder = document.getElementById("usersTableHolder");
    const counter = document.getElementById("userCounter");

    const render = () => {
      const search = searchInput.value.trim().toLowerCase();
      const filtered = users.filter((item) => {
        const matchesSearch = !search || `${item.usuario} ${item.email}`.toLowerCase().includes(search);
        const matchesType = typeFilter.value === "todos" || item.tipo === typeFilter.value;
        const matchesAdmin =
          adminFilter.value === "todos" ||
          (adminFilter.value === "admins" && item.is_admin) ||
          (adminFilter.value === "padrao" && !item.is_admin);
        return matchesSearch && matchesType && matchesAdmin;
      });

      counter.textContent = `${filtered.length} de ${users.length} usuario(s) exibido(s).`;
      tableHolder.innerHTML = renderTable({
        columns: ["ID", "Nome", "Email", "Tipo / Status", "Acoes"],
        rows: renderUserRows(filtered, auth.payload.id),
        emptyMessage: "Nenhum usuario corresponde aos filtros atuais.",
      });

      attachTableAction(tableHolder, '[data-action="toggle-admin"]', async (button) => {
        const userId = Number(button.dataset.id);
        const target = users.find((item) => Number(item.id) === userId);
        if (!target) {
          return;
        }

        const promote = !target.is_admin;
        const confirmed = window.confirm(
          promote
            ? `Conceder acesso administrativo para ${target.usuario}?`
            : `Remover acesso administrativo de ${target.usuario}?`
        );

        if (!confirmed) {
          return;
        }

        const updateResult = await requestAdmin(`/admin/usuarios/${encodeURIComponent(userId)}/admin`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_admin: promote }),
        });

        if (!updateResult) {
          return;
        }

        if (!updateResult.ok) {
          showFlash(updateResult.error || "Nao foi possivel atualizar o acesso administrativo.", "error");
          return;
        }

        target.is_admin = promote;
        showFlash(updateResult.data?.mensagem || "Permissao atualizada com sucesso.", "success");
        render();
      });

      attachTableAction(tableHolder, '[data-action="toggle-block"]', async (button) => {
        const userId = Number(button.dataset.id);
        const target = users.find((item) => Number(item.id) === userId);
        if (!target) {
          return;
        }

        const nextBlocked = !target.is_blocked;
        const confirmed = window.confirm(
          nextBlocked
            ? `Bloquear ${target.usuario} no TattooMatch?`
            : `Desbloquear ${target.usuario} e permitir novo acesso?`
        );

        if (!confirmed) {
          return;
        }

        const updateResult = await requestAdmin(`/admin/usuarios/${encodeURIComponent(userId)}/bloqueio`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_blocked: nextBlocked }),
        });

        if (!updateResult) {
          return;
        }

        if (!updateResult.ok) {
          showFlash(updateResult.error || "Nao foi possivel atualizar o bloqueio.", "error");
          return;
        }

        target.is_blocked = nextBlocked;
        showFlash(updateResult.data?.mensagem || "Bloqueio atualizado com sucesso.", "success");
        render();
      });
    };

    searchInput.addEventListener("input", render);
    typeFilter.addEventListener("change", render);
    adminFilter.addEventListener("change", render);
    render();
  }

  async function initTattooersPage() {
    renderShell({
      pageKey: "tatuadores",
      title: "Gestao de tatuadores",
      description: "Perfis profissionais, destaque comercial e moderacao operacional.",
    });

    const content = document.getElementById("adminContent");
    content.innerHTML = `
      <section class="admin-panel">
        <div class="panel-head">
          <div>
            <h2>Tatuadores cadastrados</h2>
            <p>Veja plano, localizacao, disponibilidade e destaque do perfil publico.</p>
          </div>
        </div>

        <div class="toolbar">
          <input id="artistSearch" class="toolbar-input" type="search" placeholder="Buscar por artista, usuario, cidade ou email">
          <select id="artistPlanFilter" class="toolbar-select">
            <option value="todos">Todos os planos</option>
            <option value="premium">Premium</option>
            <option value="pro">Pro</option>
            <option value="free">Free</option>
          </select>
          <select id="artistHighlightFilter" class="toolbar-select">
            <option value="todos">Com ou sem destaque</option>
            <option value="sim">Somente patrocinados</option>
            <option value="nao">Sem patrocinio</option>
          </select>
        </div>

        <p id="artistCounter" class="panel-copy">Carregando tatuadores...</p>
        <div id="artistTableHolder"></div>
      </section>
    `;

    const result = await requestAdmin("/admin/tatuadores");
    if (!result) {
      return;
    }

    if (!result.ok || !Array.isArray(result.data)) {
      document.getElementById("artistTableHolder").innerHTML =
        `<div class="empty-state">${escapeHtml(result.error || "Nao foi possivel carregar os tatuadores.")}</div>`;
      return;
    }

    const artists = result.data.slice();
    const searchInput = document.getElementById("artistSearch");
    const planFilter = document.getElementById("artistPlanFilter");
    const highlightFilter = document.getElementById("artistHighlightFilter");
    const tableHolder = document.getElementById("artistTableHolder");
    const counter = document.getElementById("artistCounter");

    const render = () => {
      const search = searchInput.value.trim().toLowerCase();
      const filtered = artists.filter((item) => {
        const haystack = `${item.nome_artistico} ${item.usuario} ${item.email} ${item.cidade || ""} ${item.bairro || ""}`.toLowerCase();
        const matchesSearch = !search || haystack.includes(search);
        const normalizedPlan = String(item.plano || "").trim().toLowerCase();
        const matchesPlan = planFilter.value === "todos" || normalizedPlan === planFilter.value;
        const matchesHighlight =
          highlightFilter.value === "todos" ||
          (highlightFilter.value === "sim" && item.patrocinado_ativo) ||
          (highlightFilter.value === "nao" && !item.patrocinado_ativo);
        return matchesSearch && matchesPlan && matchesHighlight;
      });

      counter.textContent = `${filtered.length} de ${artists.length} tatuador(es) exibido(s).`;
      tableHolder.innerHTML = renderTable({
        columns: ["Artista", "Cidade / Bairro", "Plano", "Disponibilidade", "Acoes"],
        rows: renderTattooerRows(filtered),
        emptyMessage: "Nenhum tatuador corresponde aos filtros atuais.",
      });

      attachTableAction(tableHolder, '[data-action="toggle-highlight"]', async (button) => {
        const tattooerId = Number(button.dataset.id);
        const active = button.dataset.active !== "true";
        const artist = artists.find((item) => Number(item.id) === tattooerId);
        if (!artist) {
          return;
        }

        const confirmed = window.confirm(
          active
            ? `Ativar destaque/patrocinio para ${artist.nome_artistico || artist.usuario}?`
            : `Remover destaque/patrocinio de ${artist.nome_artistico || artist.usuario}?`
        );

        if (!confirmed) {
          return;
        }

        const updateResult = await requestAdmin(`/admin/tatuadores/${encodeURIComponent(tattooerId)}/destaque`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active }),
        });

        if (!updateResult) {
          return;
        }

        if (!updateResult.ok) {
          showFlash(updateResult.error || "Nao foi possivel atualizar o destaque.", "error");
          return;
        }

        artist.patrocinado_ativo = active;
        artist.highlight_until = updateResult.data?.tatuador?.highlight_until || null;
        showFlash(updateResult.data?.mensagem || "Destaque atualizado com sucesso.", "success");
        render();
      });

      attachTableAction(tableHolder, '[data-action="toggle-user-block"]', async (button) => {
        const userId = Number(button.dataset.userId);
        const artist = artists.find((item) => Number(item.usuario_id) === userId);
        if (!artist) {
          return;
        }

        const nextBlocked = button.dataset.blocked !== "true";
        const confirmed = window.confirm(
          nextBlocked
            ? `Bloquear o usuario relacionado a ${artist.nome_artistico || artist.usuario}?`
            : `Desbloquear o usuario relacionado a ${artist.nome_artistico || artist.usuario}?`
        );

        if (!confirmed) {
          return;
        }

        const updateResult = await requestAdmin(`/admin/usuarios/${encodeURIComponent(userId)}/bloqueio`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_blocked: nextBlocked }),
        });

        if (!updateResult) {
          return;
        }

        if (!updateResult.ok) {
          showFlash(updateResult.error || "Nao foi possivel atualizar o bloqueio do usuario.", "error");
          return;
        }

        artist.is_blocked = nextBlocked;
        showFlash(updateResult.data?.mensagem || "Usuario atualizado com sucesso.", "success");
        render();
      });
    };

    searchInput.addEventListener("input", render);
    planFilter.addEventListener("change", render);
    highlightFilter.addEventListener("change", render);
    render();
  }

  async function initSubscriptionsPage() {
    renderShell({
      pageKey: "assinaturas",
      title: "Gestao de assinaturas",
      description: "Planos ativos, patrocinio e sinais comerciais com base na estrutura real do banco.",
    });

    const content = document.getElementById("adminContent");
    content.innerHTML = `<div class="loading-state">Carregando assinaturas...</div>`;

    const result = await requestAdmin("/admin/assinaturas");
    if (!result) {
      return;
    }

    if (!result.ok || !Array.isArray(result.data)) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(result.error || "Nao foi possivel carregar as assinaturas.")}</div>`;
      return;
    }

    const activeCount = result.data.filter((item) => item.status_assinatura === "ativa").length;
    const sponsoredCount = result.data.filter((item) => item.destaque_ativo).length;

    content.innerHTML = `
      ${renderMetricGrid([
        { label: "Assinaturas listadas", value: result.data.length, help: "Subscriptions encontradas no schema atual." },
        { label: "Ativas", value: activeCount, help: "Status de assinatura igual a ativa." },
        { label: "Com destaque ativo", value: sponsoredCount, help: "Baseado em highlight_until vigente." },
      ])}

      ${renderPanel({
        title: "Assinaturas",
        description: "Como o schema atual nao possui coluna de vencimento mensal, o painel exibe highlight_until quando existir.",
        content: renderTable({
          columns: ["Tatuador", "Plano", "Status", "Preco", "Highlight ate", "Patrocinio", "Perfil"],
          rows: renderSubscriptionRows(result.data),
          emptyMessage: "Nenhuma assinatura encontrada.",
        }),
      })}
    `;
  }

  async function initAnalyticsPage() {
    renderShell({
      pageKey: "analytics",
      title: "Analytics basico",
      description: "Leitura executiva de crescimento, atividade e receita com os dados reais do TattooMatch.",
    });

    const content = document.getElementById("adminContent");
    content.innerHTML = `<div class="loading-state">Carregando analytics...</div>`;

    const result = await requestAdmin("/admin/analytics");
    if (!result) {
      return;
    }

    if (!result.ok || !result.data) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(result.error || "Nao foi possivel carregar os analytics.")}</div>`;
      return;
    }

    const data = result.data;
    const profilesMarkup = (data.perfisMaisVisitados || []).length
      ? `
          <div class="ranking-list">
            ${(data.perfisMaisVisitados || [])
              .map(
                (perfil, index) => `
                  <article class="ranking-item">
                    <span class="ranking-position">${index + 1}</span>
                    <div class="table-primary">
                      <strong>${escapeHtml(perfil.nome_artistico || "Perfil sem nome")}</strong>
                      <span>${escapeHtml(String(perfil.visitas || 0))} visita(s)</span>
                    </div>
                    <a class="table-button link" href="${escapeHtml(buildPublicProfileUrl({ id: perfil.tatuador_id, slug: perfil.slug }))}" target="_blank" rel="noreferrer">
                      Abrir perfil
                    </a>
                  </article>
                `
              )
              .join("")}
          </div>
        `
      : `<div class="empty-state">Nenhuma visita de perfil registrada ainda.</div>`;

    const recentRows = (data.usuariosRecentes || []).map((item) => `
      <tr>
        <td>${escapeHtml(String(item.id))}</td>
        <td>${escapeHtml(item.usuario)}</td>
        <td>${escapeHtml(item.email)}</td>
        <td>${badge(item.tipo === "tatuador" ? "Tatuador" : "Cliente", item.tipo === "tatuador" ? "success" : "neutral")}</td>
        <td>${escapeHtml(formatDateTime(item.created_at))}</td>
      </tr>
    `);

    content.innerHTML = `
      ${renderMetricGrid([
        { label: "Cadastros recentes", value: data.cadastrosRecentes, help: "Usuarios criados nos ultimos 7 dias." },
        { label: "Tatuadores recentes", value: data.tatuadoresRecentes, help: "Tatuadores inferidos via usuarios recentes no schema atual." },
        { label: "Usuarios ativos", value: data.usuariosAtivos, help: "Usuarios distintos com eventos nos ultimos 30 dias." },
        { label: "Receita estimada", value: formatMoney(data.receitaEstimada), help: "Planos ativos + patrocinio semanal em vigor." },
        { label: "Receita confirmada no mes", value: formatMoney(data.receitaConfirmadaMes), help: "Soma real de payment_sessions confirmadas no mes atual." },
        { label: "Agendamentos", value: data.totalAgendamentos, help: "Volume acumulado de pedidos registrados." },
      ])}

      <section class="admin-grid two-columns">
        ${renderPanel({
          title: "Perfis mais visitados",
          description: "Ranking simples baseado nos eventos de visita de perfil.",
          content: profilesMarkup,
        })}
        ${renderPanel({
          title: "Cadastros recentes",
          description: "Ultimos acessos e novos registros observados no banco.",
          content: renderTable({
            columns: ["ID", "Usuario", "Email", "Tipo", "Criado em"],
            rows: recentRows,
            emptyMessage: "Nenhum cadastro recente encontrado.",
          }),
        })}
      </section>
    `;
  }

  window.AdminApp = {
    initAnalyticsPage,
    initDashboardPage,
    initSubscriptionsPage,
    initTattooersPage,
    initUsersPage,
  };
})();
