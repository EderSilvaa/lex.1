// Versão ultra-simples para garantir funcionamento
console.log('🚀 INICIANDO CHAT PJE ASSISTANT');

// Função para criar botão
function criarBotao() {
  console.log('📝 Criando botão...');
  
  // Verificar se já existe
  if (document.getElementById('pje-chat-btn')) {
    console.log('⚠️ Botão já existe');
    return;
  }
  
  const btn = document.createElement('button');
  btn.id = 'pje-chat-btn';
  btn.innerHTML = '💬';
  btn.title = 'Chat PJe';
  
  // Estilo inline para garantir que funcione
  btn.setAttribute('style', `
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    width: 60px !important;
    height: 60px !important;
    background: #ff4444 !important;
    color: white !important;
    border: none !important;
    border-radius: 50% !important;
    cursor: pointer !important;
    font-size: 24px !important;
    z-index: 2147483647 !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
    font-family: Arial !important;
  `);
  
  // Evento de clique
  btn.onclick = function() {
    console.log('🖱️ Botão clicado!');
    alert('✅ Chat PJe Assistant está funcionando!\n\n' + 
          '📍 URL: ' + window.location.href + '\n' +
          '📄 Título: ' + document.title);
  };
  
  // Adicionar ao body
  document.body.appendChild(btn);
  console.log('✅ Botão adicionado ao DOM');
  
  // Verificar se foi adicionado
  setTimeout(() => {
    const verificar = document.getElementById('pje-chat-btn');
    if (verificar) {
      console.log('✅ Botão confirmado no DOM');
    } else {
      console.log('❌ Botão NÃO encontrado no DOM');
    }
  }, 100);
}

// Executar múltiplas vezes para garantir
console.log('📋 Estado do documento:', document.readyState);

// Executar imediatamente
criarBotao();

// Executar quando DOM carregar
document.addEventListener('DOMContentLoaded', () => {
  console.log('📋 DOMContentLoaded disparado');
  criarBotao();
});

// Executar quando página carregar completamente
window.addEventListener('load', () => {
  console.log('📋 Window load disparado');
  criarBotao();
});

// Executar após delays
setTimeout(() => {
  console.log('⏰ Timeout 1s');
  criarBotao();
}, 1000);

setTimeout(() => {
  console.log('⏰ Timeout 3s');
  criarBotao();
}, 3000);

setTimeout(() => {
  console.log('⏰ Timeout 5s');
  criarBotao();
}, 5000);

console.log('🏁 Script carregado completamente');