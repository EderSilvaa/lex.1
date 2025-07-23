// Chat Lex - Versão simplificada
(function() {
  'use strict';
  
  // Verificar se já foi carregado
  if (window.lexAssistantActive) {
    return;
  }
  
  window.lexAssistantActive = true;
  
  // Variáveis globais
  let chatContainer = null;
  
  // Inicialização
  function inicializar() {
    // Aguardar DOM estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inicializar);
      return;
    }
    
    // Adicionar estilos
    adicionarEstilos();
    
    // Criar botão flutuante
    criarBotaoChat();
  }
  
  // Adicionar estilos
  function adicionarEstilos() {
    // Adicionar fonte Michroma
    const fontLink1 = document.createElement('link');
    fontLink1.rel = 'preconnect';
    fontLink1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(fontLink1);
    
    const fontLink2 = document.createElement('link');
    fontLink2.rel = 'preconnect';
    fontLink2.href = 'https://fonts.gstatic.com';
    fontLink2.crossOrigin = 'anonymous';
    document.head.appendChild(fontLink2);
    
    const fontLink3 = document.createElement('link');
    fontLink3.href = 'https://fonts.googleapis.com/css2?family=Michroma&display=swap';
    fontLink3.rel = 'stylesheet';
    document.head.appendChild(fontLink3);
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      /* Estilos simplificados para o chat Lex */
      .lex-chat {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 320px;
        height: 450px;
        background-color: #1a1a1a;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
        border: 1px solid #333;
        font-family: Arial, sans-serif;
      }
      
      .lex-chat.visible {
        display: flex;
      }
      
      .lex-header {
        background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%);
        color: white;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .lex-header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      
      .lex-title-area {
        display: flex;
        flex-direction: column;
      }
      
      .lex-title {
        font-size: 16px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .lex-title .lex-name {
        font-family: "Michroma", sans-serif;
        font-weight: 400;
        font-style: normal;
        letter-spacing: 1px;
      }
      
      .lex-subtitle {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        margin-top: 2px;
      }
      
      .lex-status {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
      }
      
      .lex-status-dot {
        width: 8px;
        height: 8px;
        background-color: #4ade80;
        border-radius: 50%;
      }
      
      .lex-status-text {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
      }
      
      .lex-close {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .lex-info {
        background-color: #2a2a2a;
        padding: 12px;
        border-bottom: 1px solid #333;
      }
      
      .lex-card {
        background-color: rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        overflow: hidden;
      }
      
      .lex-card-header {
        background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%);
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 600;
        color: white;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .lex-card-content {
        padding: 12px;
      }
      
      .lex-item {
        display: flex;
        margin-bottom: 8px;
        font-size: 12px;
      }
      
      .lex-item:last-child {
        margin-bottom: 0;
      }
      
      .lex-label {
        color: rgba(255, 255, 255, 0.7);
        font-weight: 600;
        min-width: 80px;
      }
      
      .lex-value {
        color: white;
        word-break: break-word;
      }
      
      .lex-messages {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        background-color: #1a1a1a;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      .lex-message {
        max-width: 85%;
        display: flex;
        flex-direction: column;
      }
      
      .lex-message.user {
        align-self: flex-end;
      }
      
      .lex-message.assistant {
        align-self: flex-start;
      }
      
      .lex-bubble {
        padding: 12px 14px;
        border-radius: 10px;
        font-size: 13px;
        line-height: 1.5;
        position: relative;
      }
      
      .lex-message.user .lex-bubble {
        background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%);
        color: white;
        border-bottom-right-radius: 4px;
      }
      
      .lex-message.assistant .lex-bubble {
        background-color: #2a2a2a;
        color: white;
        border-bottom-left-radius: 4px;
        border-left: 3px solid #4a1a5c;
      }
      
      .lex-time {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 4px;
        align-self: flex-end;
      }
      
      .lex-input-area {
        padding: 12px 16px;
        background-color: #2a2a2a;
        border-top: 1px solid #333;
        display: flex;
        gap: 10px;
        align-items: center;
      }
      
      .lex-input {
        flex: 1;
        background-color: rgba(0, 0, 0, 0.2);
        border: 1px solid #444;
        border-radius: 8px;
        padding: 10px 12px;
        color: white;
        font-size: 13px;
        min-height: 40px;
        outline: none;
      }
      
      .lex-send {
        background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%);
        color: white;
        border: none;
        width: 40px;
        height: 40px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .lex-button {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%);
        color: white;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        z-index: 999998;
      }
    `;
    document.head.appendChild(styleSheet);
  }
  
  // Criar botão do chat
  function criarBotaoChat() {
    const botao = document.createElement('button');
    botao.className = 'lex-button';
    botao.innerHTML = '▲';
    botao.title = 'Lex. - Assistente Jurídico Inteligente';
    
    botao.addEventListener('click', function() {
      abrirChat();
    });
    
    document.body.appendChild(botao);
  }
  
  // Abrir chat
  function abrirChat() {
    if (!chatContainer) {
      criarInterfaceChat();
    } else {
      chatContainer.classList.add('visible');
    }
  }
  
  // Criar interface do chat
  function criarInterfaceChat() {
    // Extrair informações básicas
    const info = {
      numeroProcesso: extrairNumeroProcesso(),
      tribunal: extrairTribunal()
    };
    
    // Criar container
    chatContainer = document.createElement('div');
    chatContainer.className = 'lex-chat';
    
    // Criar estrutura HTML
    chatContainer.innerHTML = `
      <div class="lex-header">
        <div class="lex-header-top">
          <div class="lex-title-area">
            <div class="lex-title">
              <span class="lex-logo">▲</span>
              <span class="lex-name">Lex.</span>
            </div>
            <div class="lex-subtitle">${info.numeroProcesso || 'Assistente Jurídico'}</div>
          </div>
          <button class="lex-close">×</button>
        </div>
        <div class="lex-status">
          <div class="lex-status-dot"></div>
          <div class="lex-status-text">Processo ativo</div>
        </div>
      </div>
      
      <div class="lex-info">
        <div class="lex-card">
          <div class="lex-card-header">
            <span>📋</span>
            <span>Informações do Processo</span>
          </div>
          <div class="lex-card-content">
            ${info.numeroProcesso ? `<div class="lex-item"><span class="lex-label">Processo:</span> <span class="lex-value">${info.numeroProcesso}</span></div>` : ''}
            ${info.tribunal ? `<div class="lex-item"><span class="lex-label">Tribunal:</span> <span class="lex-value">${info.tribunal}</span></div>` : ''}
          </div>
        </div>
      </div>
      
      <div class="lex-messages"></div>
      
      <div class="lex-input-area">
        <input type="text" class="lex-input" placeholder="Digite sua pergunta sobre o processo...">
        <button class="lex-send">➤</button>
      </div>
    `;
    
    // Adicionar ao DOM
    document.body.appendChild(chatContainer);
    
    // Configurar eventos
    configurarEventos();
    
    // Adicionar mensagem inicial
    adicionarMensagemInicial();
    
    // Mostrar chat
    chatContainer.classList.add('visible');
  }
  
  // Configurar eventos
  function configurarEventos() {
    // Botão fechar
    const closeButton = chatContainer.querySelector('.lex-close');
    if (closeButton) {
      closeButton.addEventListener('click', function() {
        chatContainer.classList.remove('visible');
      });
    }
    
    // Botão enviar
    const sendButton = chatContainer.querySelector('.lex-send');
    const input = chatContainer.querySelector('.lex-input');
    
    if (sendButton && input) {
      // Enviar ao clicar no botão
      sendButton.addEventListener('click', function() {
        enviarMensagem(input.value);
      });
      
      // Enviar ao pressionar Enter
      input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          enviarMensagem(input.value);
        }
      });
    }
  }
  
  // Adicionar mensagem inicial
  function adicionarMensagemInicial() {
    const messagesContainer = chatContainer.querySelector('.lex-messages');
    if (!messagesContainer) return;
    
    // Mensagem de boas-vindas
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'lex-message assistant';
    welcomeMessage.innerHTML = `
      <div class="lex-bubble">
        Olá! Sou a Lex. ▲<br><br>
        Seu assistente jurídico inteligente. Como posso ajudá-lo?
      </div>
      <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    messagesContainer.appendChild(welcomeMessage);
    
    // Sugestões de comandos
    setTimeout(() => {
      const suggestionsMessage = document.createElement('div');
      suggestionsMessage.className = 'lex-message assistant';
      suggestionsMessage.innerHTML = `
        <div class="lex-bubble">
          💡 <strong>Comandos úteis:</strong><br><br>
          • "analisar processo" - Análise detalhada<br>
          • "prazos" - Informações sobre prazos<br>
          • "como peticionar" - Guia de peticionamento<br>
          • "ajuda" - Lista completa de comandos
        </div>
        <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      `;
      
      messagesContainer.appendChild(suggestionsMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 1000);
  }
  
  // Enviar mensagem
  function enviarMensagem(texto) {
    texto = texto.trim();
    if (!texto) return;
    
    const messagesContainer = chatContainer.querySelector('.lex-messages');
    const input = chatContainer.querySelector('.lex-input');
    
    if (!messagesContainer || !input) return;
    
    // Adicionar mensagem do usuário
    const userMessage = document.createElement('div');
    userMessage.className = 'lex-message user';
    userMessage.innerHTML = `
      <div class="lex-bubble">${texto}</div>
      <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    messagesContainer.appendChild(userMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Limpar input
    input.value = '';
    
    // Simular resposta
    setTimeout(() => {
      const respostas = [
        "Estou analisando sua solicitação...",
        "Vou verificar isso para você.",
        "Entendi sua pergunta. Deixe-me buscar essa informação.",
        "Estou processando sua solicitação.",
        "Vou pesquisar isso nos autos do processo."
      ];
      
      const resposta = respostas[Math.floor(Math.random() * respostas.length)];
      
      const assistantMessage = document.createElement('div');
      assistantMessage.className = 'lex-message assistant';
      assistantMessage.innerHTML = `
        <div class="lex-bubble">${resposta}</div>
        <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      `;
      
      messagesContainer.appendChild(assistantMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 1000);
  }
  
  // Extrair número do processo
  function extrairNumeroProcesso() {
    const texto = document.body.innerText || '';
    const match = texto.match(/\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}/);
    return match ? match[0] : '';
  }
  
  // Extrair tribunal
  function extrairTribunal() {
    const url = window.location.href;
    if (url.includes('tjsp')) return 'TJSP';
    if (url.includes('tjpa')) return 'TJPA';
    if (url.includes('pje.jus.br')) return 'PJe Nacional';
    return '';
  }
  
  // Iniciar
  inicializar();
})();