// Recupera token salvo quando a página carrega
let token = localStorage.getItem('token')

// Função de cadastro
async function cadastrar() {
    const usuario = document.getElementById('regUsuario').value
    const senha = document.getElementById('regSenha').value

    const res = await fetch('http://localhost:3000/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha })
    })

    const data = await res.json()
    document.getElementById('regMsg').innerText = JSON.stringify(data, null, 2)
}

// Função de login
async function logar() {
    const usuario = document.getElementById('logUsuario').value
    const senha = document.getElementById('logSenha').value

    const res = await fetch('http://localhost:3000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha })
    })

    const data = await res.json()
    document.getElementById('logMsg').innerText = JSON.stringify(data, null, 2)

    if (data.token) {
        localStorage.setItem('token', data.token) // salva no navegador
        token = data.token
        alert("Login realizado com sucesso 🚀")
    }
}

// Função para ver perfil
async function verPerfil() {
    if (!token) {
        document.getElementById('perfilMsg').innerText = "Você precisa logar primeiro!"
        return
    }

    const res = await fetch('http://localhost:3000/perfil', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })

    const data = await res.json()
    document.getElementById('perfilMsg').innerText = JSON.stringify(data, null, 2)
}

// Logout
function logout() {
    localStorage.removeItem('token')
    token = null
    alert("Você saiu da conta 🚪")
}
async function atualizarPerfil() {
    const novoUsuario = document.getElementById('novoUsuario').value
    const novaSenha = document.getElementById('novaSenha').value

    const res = await fetch('http://localhost:3000/perfil', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            usuario: novoUsuario || undefined,
            senha: novaSenha || undefined
        })
    })

    const data = await res.json()
    alert(data.mensagem)
}

async function deletarPerfil() {
    const token = localStorage.getItem('token')

    if (!token) {
        document.getElementById('perfilMsg').innerText = "Você precisa logar primeiro!"
        return
    }

    const res = await fetch('http://localhost:3000/perfil', {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })

    const data = await res.json()

    document.getElementById('perfilMsg').innerText = JSON.stringify(data, null, 2)

    if (res.ok) {
        localStorage.removeItem('token')
    }
}

