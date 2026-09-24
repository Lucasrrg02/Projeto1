// URL da API hospedada no Render
const API_URL = "https://disk-gas-api.onrender.com";

// 1. Identifica o slug da distribuidora via parâmetro URL (?loja=slug)
const urlParams = new URLSearchParams(window.location.search);
const DISTRIBUIDORA_SLUG = urlParams.get('loja') || 'padrao';


// Preços dos produtos
let PRECO_GAS = 135.00;
let PRECO_AGUA = 20.00;
let NUMERO_WHATSAPP = "5514996905008";

let qtdGas = 0;
let qtdAgua = 0;

// 2. Carrega preços e dados da distribuidora atual da API
async function carregarPrecosDoBanco() {
    try {
        const response = await fetch(`${API_URL}/api/${DISTRIBUIDORA_SLUG}/precos`);

        if (response.ok) {
            const data = await response.json();

            PRECO_GAS = parseFloat(data.preco_gas);
            PRECO_AGUA = parseFloat(data.preco_agua);
            NUMERO_WHATSAPP = data.whatsapp; // Atualiza o WhatsApp dinamicamente

            // Atualiza os elementos na tela
            const elGas = document.getElementById('precoGas');
            const elAgua = document.getElementById('precoAgua');
            const elNomeLoja = document.getElementById('nomeLoja'); // Opcional: elemento no topo da tela
            const elImgLogo = document.getElementById('imgLogo');

            if (elGas) elGas.textContent = PRECO_GAS.toFixed(2);
            if (elAgua) elAgua.textContent = PRECO_AGUA.toFixed(2);
            if (elNomeLoja && data.nome) elNomeLoja.textContent = data.nome;

            // Logica para exibir/ocultar a Logo
            if (elImgLogo) {
                if (data.logo_url && data.logo_url.trim() !== '') {
                    elImgLogo.src = data.logo_url;
                    elImgLogo.style.display = 'block';
                } else {
                    elImgLogo.style.display = 'none';
                }
            }

            atualizarTotal();
        } else {
            console.error("Distribuidora não encontrada na API.");
        }
    } catch (error) {
        console.error("Erro ao conectar à API:", error);
    }
}


// 3. Atualiza os preços no banco via modal de Admin
async function salvarNovosPrecos() {
    const senhaInput = document.getElementById('senhaAdmin');
    const gasInput = document.getElementById('novoPrecoGas');
    const aguaInput = document.getElementById('novoPrecoAgua');

    const senha = senhaInput ? senhaInput.value : '';
    const novoGas = parseFloat(gasInput ? gasInput.value : 0);
    const novoAgua = parseFloat(aguaInput ? aguaInput.value : 0);

    if (!senha) {
        alert("Digite a senha de administrador.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/${DISTRIBUIDORA_SLUG}/admin/precos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senha: senha, gas: novoGas, agua: novoAgua })
        });

        const resultado = await response.json();

        if (response.ok) {
            alert("Preços atualizados com sucesso!");
            if (typeof fecharModalAdmin === 'function') fecharModalAdmin();
            carregarPrecosDoBanco();
        } else {
            alert(resultado.error || "Erro ao atualizar preços.");
        }
    } catch (error) {
        alert("Falha de conexão com o servidor.");
    }
}

// Funçao para aumentar/diminuir quantidades
function alterarQtd(produto, valor) {
    let produtoNome = "";
    if (produto === 'gas') {
        qtdGas = Math.max(0, qtdGas + valor);
        document.getElementById('qtdGas').textContent = qtdGas;
        produtoNome = "Botijão de Gás";
    } else if (produto === 'agua') {
        qtdAgua = Math.max(0, qtdAgua + valor);
        document.getElementById('qtdAgua').textContent = qtdAgua;
        produtoNome = "Galão de Água";
    }

    // Só mostra a notificação se estiver adicionando (valor > 0)
    if (valor > 0) {
        mostrarToast(`${produtoNome} adicionado!`);
    }

    atualizarTotal();
}

// Nova função para controlar o toast
function mostrarToast(mensagem) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return; // Proteção caso a div do toast não exista no HTML ainda
    toast.textContent = mensagem;
    toast.classList.remove('hidden');

    // Pequeno delay para a animação de entrada funcionar
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Remove a notificação após 3 segundos
    setTimeout (() => {
        toast.classList.remove('show');
        // Espera a animaçao de saída terminar para esconder o elemento
        setTimeout (() => {
            toast.classList.add('hidden');
        }, 300);
    }, 3000);
}

// Atualiza a exibição do total calculado
function atualizarTotal() {
    const total = (qtdGas * PRECO_GAS) + (qtdAgua * PRECO_AGUA);
    document.getElementById('totalPedido').textContent = total.toFixed(2);
}

// Funçao para montar o texto do pedido e abrir o WhatsApp
function enviarPedido() {
    const nomeInput = document.getElementById('nome');
    const enderecoInput = document.getElementById('endereco');
    const pagamentoInput = document.getElementById('pagamento');
    const observacaoInput = document.getElementById('observacao');

    const nome = nomeInput.value.trim();
    const endereco = enderecoInput.value.trim();
    const pagamento = pagamentoInput.value;
    const observacao = observacaoInput.value.trim();

    localStorage.setItem('cliente_nome', nome);
    localStorage.setItem('cliente_endereco', endereco);

    // Reseta estilos de erro anteriores
    nomeInput.classList.remove('campo-erro');
    enderecoInput.classList.remove('campo-erro');
    pagamentoInput.classList.remove('campo-erro');

    let temErro = false;

    //Validações básicas
    if (qtdGas === 0 && qtdAgua === 0) {
        alert("Por favor, adicione pelo menos um botijão de gás ou galão de água ao pedido.");
        return;
    }

    if (!nome) {
        nomeInput.classList.add('campo-erro');
        alert("Por favor, preencha o seu nome.");
        if (nomeInput) nomeInput.focus();
        return;
    }

    if (!endereco) {
        enderecoInput.classList.add('campo-erro');
        alert("Por favor, preencha o seu endereço de entrega.");
        if (enderecoInput)enderecoInput.focus();
        return; 
    }

    if (!pagamento) {
        pagamentoInput.classList.add('campo-erro');
        alert("Por favor, seleciona a forma de pagamento.");
        return;
    }

    const total = (qtdGas * PRECO_GAS) + (qtdAgua * PRECO_AGUA);

    // Montagem da mensagem formatada para o WhatsApp
    let mensagem = `*- NOVO PEDIDO DE GÁS & ÁGUA -*\n\n`;
    mensagem += `*Cliente:* ${nome}\n`;
    mensagem += `*Endereço:* ${endereco}\n\n`;
    mensagem += `*Itens do Pedido:*\n`;

    if (qtdGas > 0) {
        mensagem += `• ${qtdGas}x Botijão de Gás (R$ ${(qtdGas * PRECO_GAS).toFixed(2)})\n`;
    }
    if (qtdAgua > 0) {
        mensagem += `• ${qtdAgua}x Galão de Água 20L (R$ ${(qtdAgua * PRECO_AGUA).toFixed(2)})\n`;
    }

    if (observacao) {
        mensagem += `*Obs:* ${observacao}\n`;
    }

    mensagem += `\n *Pagamento:* ${pagamento}\n`;
    
    mensagem += `\n *Total:* R$ ${total.toFixed(2)}`;

    //Codifica o texto para url e redireciona
    const url = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
}

// Salva Endereço e nome
window.addEventListener('DOMContentLoaded', () => {
    const nomeSalvo = localStorage.getItem('cliente_nome');
    const enderecoSalvo = localStorage.getItem('cliente_endereco');

    if (nomeSalvo) document.getElementById('nome').value = nomeSalvo;
    if (enderecoSalvo) document.getElementById('endereco').value = enderecoSalvo;

    carregarPrecosDoBanco();
});

function abrirModalAdmin() {
    const modal = document.getElementById('modalAdmin');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('novoPrecoGas').value = PRECO_GAS;
        document.getElementById('novoPrecoAgua').value = PRECO_AGUA;
    }
}

function fecharModalAdmin() {
    const modal = document.getElementById('modalAdmin');
    if (modal) {
        modal.style.display = 'none';
        const senhaInput = document.getElementById('senhaAdmin');
        if (senhaInput) senhaInput.value = '';
    }
}