// Service Worker para Chat PJe Assistant
console.log('Chat PJe Assistant iniciado');

// Executar quando a extensão é instalada
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('Chat PJe Assistant:', details.reason);
  
  if (details.reason === 'install') {
    console.log('Chat PJe Assistant instalado pela primeira vez');
    // Configurações iniciais
    chrome.storage.local.set({
      chatEnabled: true,
      chatHistory: [],
      userPreferences: {
        theme: 'light',
        notifications: true
      }
    });
  } else if (details.reason === 'update') {
    console.log('Chat PJe Assistant atualizado');
  }
});

// Funções utilitárias para armazenamento
function salvarHistoricoChat(mensagens) {
  chrome.storage.local.set({chatHistory: mensagens}, function() {
    console.log('Histórico do chat salvo');
  });
}

function obterHistoricoChat(callback) {
  chrome.storage.local.get(['chatHistory'], function(result) {
    callback(result.chatHistory || []);
  });
}

function salvarPreferencias(prefs) {
  chrome.storage.local.set({userPreferences: prefs}, function() {
    console.log('Preferências salvas');
  });
}

// Escutar mensagens de outros scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  
  if (request.action === 'salvarHistorico') {
    salvarHistoricoChat(request.mensagens);
    sendResponse({success: true});
  }
  
  if (request.action === 'obterHistorico') {
    obterHistoricoChat(function(historico) {
      sendResponse({historico: historico});
    });
  }
  
  if (request.action === 'salvarPreferencias') {
    salvarPreferencias(request.preferencias);
    sendResponse({success: true});
  }
  
  if (request.action === 'verificarPje') {
    // Verificar se a aba atual é do PJe
    const isPje = sender.tab.url.includes('pje.jus.br') || 
                  sender.tab.url.includes('tjsp.jus.br') ||
                  sender.tab.url.includes('localhost');
    sendResponse({isPje: isPje});
  }
  
  return true;
});

// Monitorar mudanças de aba para detectar PJe
chrome.tabs.onActivated.addListener(function(activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    if (tab.url && (tab.url.includes('pje.jus.br') || tab.url.includes('tjsp.jus.br'))) {
      console.log('Aba do PJe ativada:', tab.url);
    }
  });
});

// Escutar atualizações de aba
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('pje.jus.br') || tab.url.includes('tjsp.jus.br')) {
      console.log('Página do PJe carregada:', tab.url);
    }
  }
});