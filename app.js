const botao = document.getElementById('btnClick');
const mensagem = document.getElementById('mensagem');

botao.addEventListener('click', () => {
    mensagem.textContent = 'Parabens! ta funfando';
});