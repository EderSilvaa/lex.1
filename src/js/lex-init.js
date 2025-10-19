// LEX Initialization - Garante que DOM está pronto antes de carregar outros scripts
(function() {
  'use strict';

  console.log('🔧 LEX Init: Verificando DOM...');

  // Função para aguardar DOM estar pronto
  function waitForDOM(callback) {
    if (document.body && document.readyState !== 'loading') {
      console.log('✅ LEX Init: DOM pronto');
      callback();
    } else {
      console.log('⏳ LEX Init: Aguardando DOM...');
      document.addEventListener('DOMContentLoaded', () => {
        console.log('✅ LEX Init: DOM carregado via DOMContentLoaded');
        callback();
      });
    }
  }

  // Aguardar DOM estar pronto
  waitForDOM(() => {
    console.log('✅ LEX Init: Inicialização completa');

    // Marcar que DOM está pronto
    window.lexDOMReady = true;

    // Disparar evento customizado para outros scripts
    window.dispatchEvent(new CustomEvent('lexDOMReady'));
  });

})();

console.log('✅ LEX Init carregado');
