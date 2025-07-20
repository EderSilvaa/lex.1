document.addEventListener('DOMContentLoaded', function() {
  const toggleChatBtn = document.getElementById('toggleChatBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const status = document.getElementById('status');
  const chatStatus = document.getElementById('chatStatus');
  const currentPage = document.getElementById('currentPage');

  // Verificar status inicial
  verificarStatus();

  // Botão para toggle do chat
  toggleChatBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (!isPjeUrl(tab.url)) {
        showStatus('Esta extensão funciona apenas no sistema PJe', 'error');
        return;
      }
      
      chrome.tabs.sendMessage(tab.id, {
        action: 'toggleChat'
      }, function(response) {
        if (chrome.runtime.lastError) {
          showStatus('Erro: Recarregue a página do PJe', 'error');
        } else if (response && response.success) {
          showStatus('Chat alternado com sucesso!', 'success');
          window.close();
        }
      });
    });
  });

  // Botão para atualizar status
  refreshBtn.addEventListener('click', function() {
    verificarStatus();
    showStatus('Status atualizado', 'info');
  });

  function verificarStatus() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      // Verificar se é página do PJe
      if (isPjeUrl(tab.url)) {
        chatStatus.innerHTML = '<span class="status-active">✓ Ativo</span>';
        currentPage.innerHTML = '<span class="status-active">Sistema PJe detectado</span>';
        toggleChatBtn.disabled = false;
        toggleChatBtn.textContent = 'Abrir/Fechar Chat';
      } else {
        chatStatus.innerHTML = '<span class="status-inactive">✗ Inativo</span>';
        currentPage.innerHTML = '<span class="status-inactive">Não é uma página do PJe</span>';
        toggleChatBtn.disabled = true;
        toggleChatBtn.textContent = 'Chat Indisponível';
      }
    });
  }

  function isPjeUrl(url) {
    return url.includes('pje.jus.br') || 
           url.includes('tjsp.jus.br') || 
           url.includes('localhost'); // Para testes
  }

  function showStatus(message, type) {
    status.textContent = message;
    status.className = type;
    setTimeout(() => {
      status.textContent = '';
      status.className = '';
    }, 3000);
  }
});