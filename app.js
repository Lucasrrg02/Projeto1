// Preços dos produtos
const PRECO_GAS = 135.00;
const PRECO_AGUA = 20.00;

const NUMERO_WHATSAPP = "5514996905008";

let qtdGas = 0;
let qtdAgua = 0;

// Funçao para aumentar/diminuir quantidades
function alterarQtd(produto, valor) {
    let produtoNome = "";
    if (produto === 'gas') {
        qtdGas = Math.max(0, qtdGas + valor);
        document.getElementById('qtdGas').textContent = qtdGas;
        produtoNome = "Botijão de Gás";
    } else if (produto === 'agua') {
        qtdAgua = Math.max(0, qtdAgua + valor);
        document.getElementById('qtdAgua').textcontent = qtdAgua;
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
    const pagamentoInput = document.getElementById('pagamento').value;
    const observacaoInput = document.getElementById('observacao').value.trim();

    const nome = nomeInput.value.trim();
    const endereco = enderecoInput.value.trim();
    const pagamento = pagamentoInput.value;
    const observacao = observacaoInput.value.trim();

    // Reseta estilos de erro anteriores
    nomeInput.classList.remove('campo-erro');
    enderecoInput.classList.remove('campo-erro');
    pagamentoInput.classList.remove('Campo-erro');

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
        temErro= true;
    }

    if (temErro) {
        alert("Por favor, preencha todos os campos obrigatórios (Nome, Endereço).");
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