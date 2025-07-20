// Script de debug para testar a extensão
console.log('=== DEBUG EXTENSÃO PJE CHAT ===');

// Verificar se a extensão carregou
setTimeout(() => {
  console.log('1. Verificando se extensão carregou...');
  
  // Verificar se o botão existe
  const botao = document.getElementById('pje-chat-toggle');
  if (botao) {
    console.log('✅ Botão do chat encontrado:', botao);
    console.log('   Posição:', botao.getBoundingClientRect());
    console.log('   Estilo:', window.getComputedStyle(botao).display);
  } else {
    console.log('❌ Botão do chat NÃO encontrado');
  }
  
  // Verificar se o container do chat existe
  const container = document.getElementById('pje-chat-container');
  if (container) {
    console.log('✅ Container do chat encontrado:', container);
  } else {
    console.log('❌ Container do chat NÃO encontrado');
  }
  
  // Verificar se encontrou a barra de ferramentas
  const barras = document.querySelectorAll('div[style*="background"]');
  console.log('2. Barras com background encontradas:', barras.length);
  
  barras.forEach((barra, index) => {
    const style = window.getComputedStyle(barra);
    const rect = barra.getBoundingClientRect();
    console.log(`   Barra ${index}:`, {
      background: style.backgroundColor,
      posição: rect,
      elemento: barra
    });
  });
  
  // Verificar se conseguiu extrair informações do processo
  console.log('3. Testando extração de informações...');
  const texto = document.body.innerText;
  const numeroMatch = texto.match(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4})/g);
  console.log('   Números de processo encontrados:', numeroMatch);
  
  const certidaoMatch = texto.includes('CERTIDÃO');
  console.log('   Contém CERTIDÃO:', certidaoMatch);
  
  const tribunalMatch = texto.match(/TRIBUNAL DE JUSTIÇA/i);
  console.log('   Tribunal encontrado:', tribunalMatch);
  
}, 5000);

// Função para forçar criação do botão (para debug)
window.forcarCriacaoBotao = function() {
  console.log('Forçando criação do botão...');
  
  const botao = document.createElement('button');
  botao.id = 'pje-chat-toggle-debug';
  botao.innerHTML = '💬 DEBUG';
  botao.style.cssText = `
    position: fixed !important;
    top: 10px !important;
    right: 10px !important;
    background: red !important;
    color: white !important;
    padding: 10px !important;
    border: none !important;
    border-radius: 5px !important;
    cursor: pointer !important;
    z-index: 999999 !important;
  `;
  
  botao.onclick = function() {
    alert('Botão de debug funcionando!');
  };
  
  document.body.appendChild(botao);
  console.log('Botão de debug criado!');
};

console.log('Para forçar criação do botão, digite: forcarCriacaoBotao()');