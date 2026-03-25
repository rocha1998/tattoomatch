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

  function buildUploadUrl(filename) {
    if (!filename) {
      return "";
    }

    return `${API_BASE}/uploads/${encodeURIComponent(filename)}`;
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

      const base64 = parts[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const json = new TextDecoder().decode(bytes);

      return JSON.parse(json);
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
        error: "N\u00e3o foi poss\u00edvel conectar ao servidor.",
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
        (!response.ok ? "N\u00e3o foi poss\u00edvel concluir a requisi\u00e7\u00e3o." : null),
    };
  }

  async function fetchAuthJson(path, options = {}) {
    const token = getStoredToken();
    const headers = new Headers(options.headers || {});

    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return fetchJson(path, {
      ...options,
      headers,
    });
  }

  async function getSessionProfile() {
    const token = getStoredToken();
    const payload = parseTokenPayload(token);

    if (!token || !payload) {
      return {
        ok: false,
        status: 401,
        data: null,
        error: "Sessao ausente",
      };
    }

    const result = await fetchAuthJson("/perfil");

    if (result.ok && result.data) {
      return result;
    }

    if (result.status === 401 || result.status === 403) {
      clearToken();
    }

    return result;
  }

  async function loadNavbar() {
    await loadPartial({
      targetId: "navbar",
      path: "/navbar.html",
      stylesheetHref: "/styles/components/navbar.css",
      datasetKey: "navbarStyles",
    });

    const menuLogin = document.getElementById("menuLogin");
    const menuLogout = document.getElementById("menuLogout");
    const menuFooter = document.getElementById("navbarMenuFooter");
    if (!menuLogin) {
      return;
    }

    const token = getStoredToken();
    const tokenPayload = parseTokenPayload(token);

    if (token && tokenPayload) {
      const profileResult = await getSessionProfile();

      if (profileResult.status === 401 || profileResult.status === 403) {
        menuLogin.innerHTML = `
          <a href="/login.html">Entrar</a>
        `;
        return;
      }

      const payload = profileResult.ok && profileResult.data
        ? {
            ...tokenPayload,
            ...profileResult.data,
          }
        : tokenPayload;

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
            <a href="/admin-tatuadores.html">Tatuadores</a>
            <a href="/admin-assinaturas.html">Assinaturas</a>
            <a href="/admin-analytics.html">Analytics</a>
            <a href="/admin-usuarios.html">Usuarios</a>
          `
        : "";

      menuLogin.innerHTML = `
        <a href="/home.html">Minha conta</a>
        ${tatuadorLinks}
        ${adminLinks}
      `;
      if (menuLogout) {
        menuLogout.innerHTML = `<a href="#" data-logout-link="true">Sair</a>`;
      }
      if (menuFooter) {
        menuFooter.hidden = false;
      }

      bindNavbarInteractions();
      return;
    }

    menuLogin.innerHTML = `
      <a href="/login.html">Entrar</a>
    `;
    if (menuLogout) {
      menuLogout.innerHTML = "";
    }
    if (menuFooter) {
      menuFooter.hidden = true;
    }
    bindNavbarInteractions();
  }

  function bindNavbarInteractions() {
    const navbar = document.querySelector(".navbar");
    const toggle = document.getElementById("navbarToggle");
    const menu = document.getElementById("navbarMenu");
    const backdrop = document.getElementById("navbarBackdrop");
    const logoutLink = document.querySelector('[data-logout-link="true"]');

    if (!navbar || !toggle || !menu || !backdrop) {
      return;
    }

    const isMobile = () => window.matchMedia("(max-width: 720px)").matches;

    const openMenu = () => {
      if (!isMobile()) {
        return;
      }

      navbar.classList.add("menu-open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Fechar menu");
      menu.hidden = false;
      backdrop.hidden = false;
    };

    const closeMenu = () => {
      navbar.classList.remove("menu-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Abrir menu");
      menu.hidden = !isMobile();
      backdrop.hidden = true;
    };

    closeMenu();

    if (!navbar.dataset.mobileMenuBound) {
      toggle.addEventListener("click", () => {
        if (navbar.classList.contains("menu-open")) {
          closeMenu();
          return;
        }

        openMenu();
      });

      backdrop.addEventListener("click", closeMenu);

      document.addEventListener("click", (event) => {
        if (!isMobile() || !navbar.classList.contains("menu-open")) {
          return;
        }

        if (navbar.contains(event.target)) {
          return;
        }

        closeMenu();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeMenu();
        }
      });

      window.addEventListener("resize", () => {
        if (!isMobile()) {
          navbar.classList.remove("menu-open");
          toggle.setAttribute("aria-expanded", "false");
          toggle.setAttribute("aria-label", "Abrir menu");
          menu.hidden = false;
          backdrop.hidden = true;
          return;
        }

        if (!navbar.classList.contains("menu-open")) {
          menu.hidden = true;
          backdrop.hidden = true;
        }
      });

      navbar.dataset.mobileMenuBound = "true";
    }

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        if (link.dataset.logoutLink === "true") {
          return;
        }

        closeMenu();
      });
    });

    if (logoutLink && !logoutLink.dataset.boundLogout) {
      logoutLink.dataset.boundLogout = "true";
      logoutLink.addEventListener("click", (event) => {
        event.preventDefault();
        closeMenu();
        logout();
      });
    }
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
    buildUploadUrl,
    clearToken,
    escapeHtml,
    fetchAuthJson,
    fetchJson,
    getSessionProfile,
    getStoredToken,
    loadFooter,
    loadNavbar,
    logout,
    parseTokenPayload,
    requireAuth,
  };
})();
