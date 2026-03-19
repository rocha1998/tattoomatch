(function initFrontendUtils() {
  const API_BASE = window.location.origin;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getStoredToken() {
    return localStorage.getItem("token");
  }

  function clearToken() {
    localStorage.removeItem("token");
  }

  function logout(redirectTo = "/login.html") {
    clearToken();
    window.location.href = redirectTo;
  }

  function buildPublicProfileUrl(tatuador) {
    if (tatuador?.slug) {
      return `/perfil/${encodeURIComponent(tatuador.slug)}`;
    }

    return `/perfil.html?id=${encodeURIComponent(tatuador?.id ?? "")}`;
  }

  async function loadPartial({ targetId, path, stylesheetHref, datasetKey }) {
    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }

    if (stylesheetHref && !document.querySelector(`link[data-${datasetKey}="true"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = stylesheetHref;
      link.dataset[datasetKey] = "true";
      document.head.appendChild(link);
    }

    const response = await fetch(path);
    const html = await response.text();
    target.innerHTML = html;
  }

  function parseTokenPayload(token = getStoredToken()) {
    if (!token) {
      return null;
    }

    try {
      const parts = token.split(".");
      if (parts.length < 2) {
        throw new Error("Token malformado");
      }

      return JSON.parse(atob(parts[1]));
    } catch (error) {
      clearToken();
      return null;
    }
  }

  async function fetchJson(path, options = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: "Não foi possível conectar ao servidor.",
      };
    }

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error:
        (data && typeof data === "object" && (data.erro || data.mensagem)) ||
        (!response.ok ? "Não foi possível concluir a requisição." : null),
    };
  }

  async function loadNavbar() {
    await loadPartial({
      targetId: "navbar",
      path: "/navbar.html",
      stylesheetHref: "/styles/components/navbar.css",
      datasetKey: "navbarStyles",
    });

    const menuLogin = document.getElementById("menuLogin");
    if (!menuLogin) {
      return;
    }

    const token = getStoredToken();
    const payload = parseTokenPayload(token);

    if (token && payload) {
      const tatuadorLinks = payload.tipo === "tatuador"
        ? `
            <a href="/painel.html">Pedidos recebidos</a>
            <a href="/meus-agendamentos.html">Pedidos enviados</a>
          `
        : `
            <a href="/meus-agendamentos.html">Meus pedidos</a>
          `;

      const adminLinks = payload.is_admin === true
        ? `
            <a href="/admin-dashboard.html">Dashboard</a>
            <a href="/admin-analytics.html">Analytics</a>
            <a href="/admin-usuarios.html">Admins</a>
          `
        : "";

      menuLogin.innerHTML = `
        <a href="/home.html">Minha conta</a>
        ${tatuadorLinks}
        ${adminLinks}
        <a href="#" data-logout-link="true">Sair</a>
      `;

      const link = menuLogin.querySelector('[data-logout-link="true"]');
      if (link) {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          logout();
        });
      }
      return;
    }

    menuLogin.innerHTML = `
      <a href="/login.html">Entrar</a>
    `;
  }

  async function loadFooter() {
    await loadPartial({
      targetId: "footer",
      path: "/footer.html",
      stylesheetHref: "/styles/components/footer.css",
      datasetKey: "footerStyles",
    });
  }

  function requireAuth({ redirectTo = "/login.html" } = {}) {
    const token = getStoredToken();
    const payload = parseTokenPayload(token);

    if (!token || !payload) {
      logout(redirectTo);
      return null;
    }

    return { token, payload };
  }

  window.FrontendUtils = {
    API_BASE,
    buildPublicProfileUrl,
    clearToken,
    escapeHtml,
    fetchJson,
    getStoredToken,
    loadFooter,
    loadNavbar,
    logout,
    parseTokenPayload,
    requireAuth,
  };
})();
