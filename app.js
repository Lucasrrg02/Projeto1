// Preços dos produtos
const PRECO_GAS = 135.00;
const PRECO_AGUA = 20.00;

const NUMERO_WHATSAPP = "5514996905008";

let qtdGas = 0;
let qtdAgua = 0;

// Funçao para aumentar/diminuir quantidades
function alterarQtd(produto, valor) {
    if (produto === 'gas') {
        qtdGas = Math.max(0, qtdGas + valor);
        document.getElementById('qtdGas').textContent = qtdGas;
    } else if (produto === 'agua') {
        qtdAgua = Math.max(0, qtdAgua + valor);
        document.getElementById('qtdAgua').textcontent = qtdAgua;
    }

    atualizarTotal();
}

// Atualiza a exibição do total calculado
function atualizarTotal() {
    const total = (qtdGas * PRECO_GAS) + (qtdAgua * PRECO_AGUA);
    document.getElementById('totalPedido').textContent = total.toFixed(2);
}

// Funçao para montar o texto do pedido e abrir o WhatsApp
function enviarPedido() {
    const nome = document.getElementById('nome').value.trim();
    const endereco = document.getElementById('nome').value.trim();
    const pagamento = document.getElementById('pagamento').value;
    const observacao = document.getElementById('observacao').value.trim();

    //Validações básicas
    if (qtdGas === 0 && qtdAgua === 0) {
        alert("Por favor, adicione pelo menos um botijão de gás ou galão de água ao pedido.");
        return;
    }

    if (!nome || !endereco) {
        alert("Por favor, informe seu nome e endereço de entrega.");
        return;
    }

    const total = (qtdGas * PRECO_GAS) + (qtdAgua * PRECO_AGUA);

    // Montagem da mensagem formatada para o WhatsApp
    let mensagem = `*- NOVO PEDIDO DE GÁS & ÁGUA -*\n\n`;
    mensagem += `*Cliente:* ${nome}\n`;
    mensagem += `*Endereço:* ${endereco}`;
    mensagem += `*Itens do Pedido:*\n`;

    if (qtdGas > 0) {
        mensagem += `• ${qtdGas}x Botijão de Gás (R$ ${(qtdGas * PRECO_GAS).toFixed(2)})\n`;
    }
    if (qtdAgua > 0) {
        mensagem += `• ${qtdAgua}x Galão de Água 20L (R$ ${(qtdAgua * PRECO_AGUA).toFixed(2)})\n`;
    }

    mensagem += `\n *Pagamento:* ${pagamento}\n`;
    if (observacao) {
        mensagem += `*Obs:* ${observacao}\n`;
    }
    mensagem += `\n *Total:* R$ ${total.toFixed(2)}`;

    //Codifica o texto para url e redireciona
    const url = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
}