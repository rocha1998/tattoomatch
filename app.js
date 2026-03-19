// Script legado de demonstracao do frontend.
// O backend real sobe por `server.js`, que carrega `src/app.js`.
const { API_BASE, fetchJson, logout: sharedLogout, parseTokenPayload } = window.FrontendUtils || {};

// Recupera token salvo quando a pagina carrega
let token = localStorage.getItem("token");

// Funcao de cadastro
async function cadastrar() {
  const usuario = document.getElementById("regUsuario").value;
  const email = document.getElementById("regEmail").value;
  const senha = document.getElementById("regSenha").value;

  const result = await fetchJson("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, email, senha }),
  });

  const data = result.data || {};
  document.getElementById("regMsg").innerText = JSON.stringify(data, null, 2);
}

// Funcao de login
async function logar() {
  const usuario = document.getElementById("logUsuario").value;
  const senha = document.getElementById("logSenha").value;

  const result = await fetchJson("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, senha }),
  });

  const data = result.data || {};

  if (!data.token) {
    alert("Erro no login");
    return;
  }

  localStorage.setItem("token", data.token);

  const payload = parseTokenPayload ? parseTokenPayload(data.token) : null;
  console.log("Usuario logado:", payload);

  window.location.href = "home.html";
}

// Funcao para ver perfil
async function verPerfil() {
  if (!token) {
    document.getElementById("perfilMsg").innerText = "Voce precisa logar primeiro!";
    return;
  }

  const result = await fetchJson("/perfil", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = result.data || {};
  document.getElementById("perfilMsg").innerText = JSON.stringify(data, null, 2);
}

// Logout
function logout() {
  if (sharedLogout) {
    sharedLogout();
    return;
  }

  localStorage.removeItem("token");
  token = null;
  alert("Voce saiu da conta");
}

async function atualizarPerfil() {
  const novoUsuario = document.getElementById("novoUsuario").value;
  const novaSenha = document.getElementById("novaSenha").value;

  const result = await fetchJson("/perfil", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      usuario: novoUsuario || undefined,
      senha: novaSenha || undefined,
    }),
  });

  const data = result.data || {};
  alert(data.mensagem);
}

async function deletarPerfil() {
  const tokenAtual = localStorage.getItem("token");

  if (!tokenAtual) {
    document.getElementById("perfilMsg").innerText = "Voce precisa logar primeiro!";
    return;
  }

  const result = await fetchJson("/perfil", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${tokenAtual}`,
    },
  });

  const data = result.data || {};

  document.getElementById("perfilMsg").innerText = JSON.stringify(data, null, 2);

  if (result.ok) {
    localStorage.removeItem("token");
  }
}
