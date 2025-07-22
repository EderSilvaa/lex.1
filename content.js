// Chat PJe Assistant - Versão Otimizada
(function() {
  'use strict';
  
  // Verificar se já foi carregado (otimizado)
  if (window.pjeAssistantActive) {
    return;
  }
  
  window.pjeAssistantActive = true;
  
  // Variáveis globais
  let chatContainer = null;
  let chatMessages = [];
  let isTyping = false;
  let botaoChat = null;
  
  // Configurações da API
  let apiConfig = {
    enabled: false,
    apiKey: null,
    model: 'gpt-3.5-turbo',
    baseURL: 'https://api.openai.com/v1/chat/completions',
    maxTokens: 500,
    temperature: 0.7
  };
  
  // Cache de elementos DOM
  const domCache = {
    body: null,
    embeds: null,
    lastUpdate: 0
  };
  
  // Inicialização ultra-otimizada
  function inicializarAssistente() {
    // Aguardar DOM estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inicializarAssistente);
      return;
    }
    
    // Usar requestIdleCallback para não bloquear o thread principal
    if (window.requestIdleCallback) {
      requestIdleCallback(() => {
        setTimeout(() => {
          if (document.body) {
            botaoChat = criarBotaoChat();
          }
        }, 3000); // 3 segundos para garantir que a página carregou
      });
    } else {
      // Fallback para navegadores sem requestIdleCallback
      setTimeout(() => {
        if (document.body) {
          botaoChat = criarBotaoChat();
        }
      }, 3000);
    }
  }

  // Otimização: Extrair informações apenas quando necessário
  async function extrairInformacoesOtimizado() {
    // Cache simples para evitar re-processamento
    if (domCache.lastUpdate && (Date.now() - domCache.lastUpdate) < 5000) {
      return domCache.info || {};
    }
    
    const info = {};
    
    // Buscar informações de forma otimizada
    try {
      const texto = document.body?.innerText || '';
      
      // 1. Buscar número do processo
      const numeroMatch = texto.match(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4})/);
      if (numeroMatch) {
        info.numeroProcesso = numeroMatch[0];
      }
      
      // 2. Detectar documento via embed/iframe (otimizado)
      const embeds = document.querySelectorAll('embed, iframe');
      for (let embed of embeds) {
        const src = embed.src || embed.getAttribute('src');
        if (src && (src.includes('documento') || src.includes('pdf'))) {
          // Extrair ID do documento
          let docId = null;
          const downloadMatch = src.match(/\/documento\/download\/(\d+)/);
          if (downloadMatch) {
            docId = downloadMatch[1];
          } else {
            const urlParams = new URLSearchParams(src.split('?')[1] || '');
            docId = urlParams.get('idDocumento') || urlParams.get('id') || urlParams.get('docId');
          }
          
          if (docId) {
            info.documentoId = docId;
            
            // Tentar extrair nome do documento
            let docName = embed.title || embed.getAttribute('title');
            if (!docName) {
              // Buscar na barra lateral por elementos selecionados
              const elementosAtivos = document.querySelectorAll('.rich-tree-node-selected, .selected, .active, .highlight');
              for (let el of elementosAtivos) {
                const textoEl = el.innerText || el.textContent || '';
                if (textoEl.includes(docId) || textoEl.length > 10) {
                  docName = textoEl.trim().split('\n')[0];
                  break;
                }
              }
            }
            
            if (docName) {
              info.nomeDocumento = docName;
            }
          }
          break;
        }
      }
      
      // 3. Identificar tipo de documento (otimizado)
      if (!info.nomeDocumento) {
        const tiposDocumento = [
          'Petição Inicial', 'Contestação', 'Sentença', 'Decisão', 'Despacho', 
          'Acórdão', 'Certidão', 'Mandado', 'Intimação', 'Recurso', 'Embargos'
        ];
        
        for (let tipo of tiposDocumento) {
          if (texto.includes(tipo)) {
            info.tipoDocumento = tipo;
            info.nomeDocumento = tipo;
            break;
          }
        }
      }
      
      // 4. Identificar tribunal
      if (window.location.href.includes('tjsp')) {
        info.tribunal = 'TJSP';
      } else if (window.location.href.includes('tjpa')) {
        info.tribunal = 'TJPA';
      } else if (window.location.href.includes('pje.jus.br')) {
        info.tribunal = 'PJe Nacional';
      }
      
      // Cache do resultado
      domCache.info = info;
      domCache.lastUpdate = Date.now();
      
      console.log('📊 Informações extraídas:', info);
      
    } catch (error) {
      console.log('⚠️ Erro na extração otimizada:', error);
    }
    
    return info;
  }
  
  // Criar botão do chat integrado na navbar
  function criarBotaoChat() {
    console.log('🔧 Criando botão integrado na navbar...');
    
    // Verificar se já existe um botão
    const botaoExistente = document.querySelector('[id^="pje-assistant-btn-"]');
    if (botaoExistente) {
      console.log('⚠️ Botão já existe, removendo duplicata');
      botaoExistente.remove();
    }
    
    // Tentar encontrar a navbar do PJe (seletores específicos baseados na estrutura real)
    const navbar = document.querySelector('ul.nav.navbar-nav:last-child') ||
                   document.querySelector('.navbar-nav:last-child') ||
                   document.querySelector('.navbar-right ul') ||
                   document.querySelector('.pull-right ul') ||
                   document.querySelector('ul.nav:last-of-type') ||
                   document.querySelector('.navbar ul:last-child') ||
                   document.querySelector('.navbar-fixed-top ul:last-child');
    
    if (navbar) {
      console.log('📍 Navbar encontrada, integrando botão');
      return criarBotaoIntegrado(navbar);
    } else {
      console.log('📍 Navbar não encontrada, criando botão flutuante');
      return criarBotaoFlutuante();
    }
  }
  
  // Criar botão integrado na navbar
  function criarBotaoIntegrado(navbar) {
    // Criar elemento <li> para integrar na lista
    const li = document.createElement('li');
    li.className = 'dropdown';
    
    // Criar o link/botão
    const botao = document.createElement('a');
    botao.id = 'pje-assistant-btn-' + Date.now();
    botao.href = '#';
    botao.innerHTML = '▲ Lex.';
    botao.title = 'Lex. - Assistente Jurídico Inteligente';
    
    // Estilo com identidade visual da Lex.
    botao.setAttribute('style', `
      color: white !important;
      text-decoration: none !important;
      padding: 12px 16px !important;
      display: block !important;
      font-size: 14px !important;
      font-family: 'Michroma', monospace !important;
      font-weight: 400 !important;
      line-height: 20px !important;
      background: linear-gradient(135deg, #2D1B69 0%, #11998E 100%) !important;
      border-radius: 6px !important;
      margin: 8px 4px !important;
      transition: all 0.3s ease !important;
      cursor: pointer !important;
      user-select: none !important;
      box-shadow: 0 2px 8px rgba(45, 27, 105, 0.3) !important;
      letter-spacing: 0.5px !important;
    `);
    
    // Hover effects com identidade visual da Lex.
    botao.addEventListener('mouseenter', function() {
      this.style.background = 'linear-gradient(135deg, #11998E 0%, #2D1B69 100%)';
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 4px 12px rgba(45, 27, 105, 0.4)';
    });
    
    botao.addEventListener('mouseleave', function() {
      this.style.background = 'linear-gradient(135deg, #2D1B69 0%, #11998E 100%)';
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 2px 8px rgba(45, 27, 105, 0.3)';
    });
    
    // Evento de clique
    botao.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('🖱️ Botão integrado clicado!');
      abrirChat();
    });
    
    // Montar estrutura
    li.appendChild(botao);
    
    // Inserir na navbar
    if (navbar.tagName === 'UL') {
      navbar.appendChild(li);
    } else {
      // Se não for UL, procurar UL dentro
      const ul = navbar.querySelector('ul');
      if (ul) {
        ul.appendChild(li);
      } else {
        // Fallback: criar wrapper
        const wrapper = document.createElement('div');
        wrapper.style.display = 'inline-block';
        wrapper.appendChild(botao);
        navbar.appendChild(wrapper);
      }
    }
    
    console.log('✅ Botão integrado criado na navbar');
    return botao;
  }
  
  // Criar botão flutuante (fallback)
  function criarBotaoFlutuante() {
    const botao = document.createElement('button');
    botao.id = 'pje-assistant-btn-' + Date.now();
    botao.innerHTML = '▲';
    botao.title = 'Lex. - Assistente Jurídico Inteligente';
    
    botao.setAttribute('style', `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      width: 50px !important;
      height: 50px !important;
      background: linear-gradient(135deg, #2D1B69 0%, #11998E 100%) !important;
      color: white !important;
      border: none !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      font-size: 18px !important;
      z-index: 2147483647 !important;
      box-shadow: 0 4px 15px rgba(45, 27, 105, 0.4) !important;
      transition: all 0.3s ease !important;
      font-family: 'Michroma', monospace !important;
      user-select: none !important;
    `);
    
    // Variáveis para controle do drag
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let buttonStartX = 0;
    let buttonStartY = 0;
    let clickStartTime = 0;
    let hasMoved = false;
    
    // Hover effects
    botao.addEventListener('mouseenter', function() {
      if (!isDragging) {
        this.style.transform = 'scale(1.1) translateY(-2px)';
        this.style.boxShadow = '0 6px 20px rgba(44, 90, 160, 0.6)';
      }
    });
    
    botao.addEventListener('mouseleave', function() {
      if (!isDragging) {
        this.style.transform = 'scale(1) translateY(0)';
        this.style.boxShadow = '0 4px 15px rgba(44, 90, 160, 0.4)';
      }
    });
    
    // Início do drag
    botao.addEventListener('mousedown', function(e) {
      e.preventDefault();
      isDragging = true;
      hasMoved = false;
      clickStartTime = Date.now();
      
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      
      const rect = botao.getBoundingClientRect();
      buttonStartX = rect.left;
      buttonStartY = rect.top;
      
      // Mudar cursor e estilo durante drag
      botao.style.cursor = 'grabbing';
      botao.style.transform = 'scale(1.05)';
      botao.style.boxShadow = '0 8px 25px rgba(44, 90, 160, 0.8)';
      botao.style.transition = 'none';
      
      console.log('🖱️ Iniciando drag do botão');
    });
    
    // Durante o drag
    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      
      e.preventDefault();
      
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;
      
      // Marcar que houve movimento se passou de um threshold
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasMoved = true;
      }
      
      const newX = buttonStartX + deltaX;
      const newY = buttonStartY + deltaY;
      
      // Limitar às bordas da tela
      const maxX = window.innerWidth - 55;
      const maxY = window.innerHeight - 55;
      
      const finalX = Math.max(0, Math.min(newX, maxX));
      const finalY = Math.max(0, Math.min(newY, maxY));
      
      botao.style.left = finalX + 'px';
      botao.style.top = finalY + 'px';
      botao.style.right = 'auto';
      botao.style.bottom = 'auto';
    });
    
    // Fim do drag
    document.addEventListener('mouseup', function(e) {
      if (!isDragging) return;
      
      isDragging = false;
      const clickDuration = Date.now() - clickStartTime;
      
      // Restaurar estilo
      botao.style.cursor = 'move';
      botao.style.transform = 'scale(1)';
      botao.style.boxShadow = '0 4px 15px rgba(44, 90, 160, 0.4)';
      botao.style.transition = 'all 0.3s ease';
      
      // Se foi um clique rápido sem movimento, abrir chat
      if (!hasMoved && clickDuration < 300) {
        console.log('🖱️ Clique detectado - abrindo chat');
        setTimeout(() => abrirChat(), 100);
      } else if (hasMoved) {
        console.log('🖱️ Botão movido para nova posição');
        
        // Salvar posição no localStorage
        const rect = botao.getBoundingClientRect();
        localStorage.setItem('pje-assistant-position', JSON.stringify({
          x: rect.left,
          y: rect.top
        }));
      }
    });
    
    // Restaurar posição salva
    const savedPosition = localStorage.getItem('pje-assistant-position');
    if (savedPosition) {
      try {
        const pos = JSON.parse(savedPosition);
        botao.style.left = pos.x + 'px';
        botao.style.top = pos.y + 'px';
        botao.style.right = 'auto';
        botao.style.bottom = 'auto';
        console.log('📍 Posição restaurada:', pos);
      } catch (e) {
        console.log('⚠️ Erro ao restaurar posição:', e);
      }
    }
    
    // Evento de clique simples para fallback
    botao.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('🖱️ Botão flutuante clicado!');
      abrirChat();
    });
    
    document.body.appendChild(botao);
    console.log('✅ Botão flutuante criado e adicionado');
    
    return botao;
  }
  
  // Função para abrir chat (otimizada)
  async function abrirChat() {
    try {
      if (!chatContainer) {
        // Usar informações básicas otimizadas
        const info = await extrairInformacoesOtimizado();
        criarInterfaceChat(info);
      } else {
        mostrarChat();
      }
    } catch (error) {
      console.error('❌ Erro ao abrir chat:', error);
      // Fallback simples
      if (!chatContainer) {
        criarInterfaceChat({});
      } else {
        mostrarChat();
      }
    }
  }  
  
// Criar interface completa do chat
  function criarInterfaceChat(info) {
    console.log('🎨 Criando interface do chat...');
    console.log('📋 Info recebida:', info);
    
    // Container principal do chat
    chatContainer = document.createElement('div');
    chatContainer.className = 'lex-chat';
    chatContainer.innerHTML = `
      <div class="lex-header">
        <div class="lex-header-top">
          <div class="lex-title-area">
            <div class="lex-title">
              <span class="lex-logo">▲</span>
              <span>Lex.</span>
            </div>
            <div class="lex-subtitle">${info.numeroProcesso || 'Assistente Jurídico'}</div>
          </div>
          <button class="lex-close" aria-label="Fechar chat">×</button>
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
            ${info.documentoId ? `<div class="lex-item"><span class="lex-label">ID Documento:</span> <span class="lex-value">${info.documentoId}</span></div>` : ''}
            ${info.nomeDocumento || info.tipoDocumento ? `<div class="lex-item"><span class="lex-label">Nome:</span> <span class="lex-value">${info.nomeDocumento || info.tipoDocumento}</span></div>` : ''}
            ${info.tribunal ? `<div class="lex-item"><span class="lex-label">Tribunal:</span> <span class="lex-value">${info.tribunal}</span></div>` : ''}
          </div>
        </div>
      </div>
      
      <div class="lex-messages"></div>
      
      <div class="lex-input-area">
        <input type="text" class="lex-input" placeholder="Digite sua pergunta sobre o processo...">
        <button class="lex-send" aria-label="Enviar mensagem">
          <span>➤</span>
        </button>
      </div>
    `;
    
    // Aplicar estilos
    aplicarEstilosChat();
    
    // Adicionar ao DOM
    document.body.appendChild(chatContainer);
    console.log('✅ Container do chat adicionado ao DOM');
    
    // Configurar eventos
    configurarEventosChat();
    
    // Adicionar mensagem inicial após garantir que o DOM foi criado
    requestAnimationFrame(() => {
      setTimeout(() => {
        adicionarMensagemInicial(info);
      }, 100);
    });
    
    // Mostrar chat
    mostrarChat();
    
    console.log('✅ Interface do chat criada');
  }
  
  // Aplicar estilos do chat
  function aplicarEstilosChat() {
    // Aplicar estilos diretamente para garantir que funcionem
    const styles = `
      /* Lex Chat - Design Moderno e Minimalista */
      .lex-chat, .lex-chat * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: Arial, sans-serif;
      }

      .lex-chat {
        position: fixed;
        right: 16px;
        bottom: 16px;
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
      }

      .lex-chat.visible {
        display: flex;
      }

      /* Header */
      .lex-header {
        background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%);
        padding: 12px 16px;
        color: white;
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

      .lex-logo {
        font-size: 14px;
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

      /* Área de informações */
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

      /* Área de mensagens */
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

      /* Área de input */
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
      
      #pje-chat-header {
        background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 50%, #1a3d3d 100%) !important;
        color: white !important;
        padding: 20px 24px !important;
        border-radius: 16px 16px 0 0 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
      }
      
      #pje-chat-header-top {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        width: 100% !important;
        margin-bottom: 12px !important;
      }
      
      #pje-chat-status {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        margin-top: 4px !important;
      }
      
      #pje-chat-status-dot {
        width: 8px !important;
        height: 8px !important;
        background: #4ade80 !important;
        border-radius: 50% !important;
        animation: pje-pulse 2s infinite !important;
      }
      
      #pje-chat-status-text {
        font-size: 12px !important;
        color: rgba(255, 255, 255, 0.8) !important;
        font-weight: 400 !important;
      }
      
      @keyframes pje-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      #pje-chat-title {
        font-weight: 700 !important;
        font-size: 18px !important;
        letter-spacing: 0.5px !important;
        margin: 0 !important;
      }
      
      #pje-chat-subtitle {
        font-size: 13px !important;
        color: rgba(255, 255, 255, 0.7) !important;
        font-weight: 400 !important;
        margin: 0 !important;
      }
      
      #pje-chat-close {
        background: rgba(255, 255, 255, 0.1) !important;
        border: none !important;
        color: white !important;
        font-size: 16px !important;
        cursor: pointer !important;
        padding: 8px !important;
        width: 32px !important;
        height: 32px !important;
        border-radius: 8px !important;
        transition: all 0.2s ease !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      
      #pje-chat-close:hover {
        background: rgba(255, 255, 255, 0.2) !important;
        transform: scale(1.05) !important;
      }
      
      #pje-chat-info {
        padding: 16px !important;
        background: #2a2a2a !important;
        border-bottom: 1px solid #333 !important;
      }
      
      .info-card {
        background: #333 !important;
        border-radius: 8px !important;
        overflow: hidden !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
      }
      
      .info-header {
        background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%) !important;
        color: white !important;
        padding: 12px 16px !important;
        font-weight: 600 !important;
        font-size: 14px !important;
      }
      
      .info-content {
        padding: 16px !important;
      }
      
      .info-item {
        display: flex !important;
        margin-bottom: 8px !important;
        align-items: flex-start !important;
      }
      
      .info-item:last-child {
        margin-bottom: 0 !important;
      }
      
      .info-label {
        font-weight: 600 !important;
        color: rgba(255, 255, 255, 0.7) !important;
        min-width: 100px !important;
        font-size: 13px !important;
      }
      
      .info-value {
        color: #e5e5e5 !important;
        font-size: 13px !important;
        word-break: break-word !important;
        flex: 1 !important;
      }
      
      #pje-chat-messages {
        flex: 1 !important;
        padding: 24px !important;
        overflow-y: auto !important;
        background: #1e1e1e !important;
        min-height: 400px !important;
      }
      
      #pje-chat-messages::-webkit-scrollbar {
        width: 4px !important;
      }
      
      #pje-chat-messages::-webkit-scrollbar-track {
        background: transparent !important;
      }
      
      #pje-chat-messages::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2) !important;
        border-radius: 2px !important;
      }
      
      #pje-chat-messages::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3) !important;
      }
      
      .chat-message {
        margin-bottom: 20px !important;
        display: flex !important;
        flex-direction: column !important;
      }
      
      .chat-message.assistant {
        align-items: flex-start !important;
      }
      
      .chat-message.user {
        align-items: flex-end !important;
      }
      
      .message-bubble {
        max-width: 80% !important;
        padding: 16px 20px !important;
        border-radius: 16px !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        word-wrap: break-word !important;
        position: relative !important;
      }
      
      .message-bubble.assistant {
        background: #2a2a2a !important;
        color: #e5e5e5 !important;
        border: 1px solid #404040 !important;
        border-bottom-left-radius: 4px !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2) !important;
        border-left: 3px solid transparent !important;
        border-image: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%) 1 !important;
      }
      
      .message-bubble.user {
        background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 50%, #1a3d3d 100%) !important;
        color: white !important;
        border-bottom-right-radius: 4px !important;
        box-shadow: 0 4px 16px rgba(74, 26, 92, 0.4) !important;
      }
      
      .message-time {
        font-size: 11px !important;
        color: rgba(255, 255, 255, 0.5) !important;
        margin-top: 8px !important;
        text-align: right !important;
      }
      
      #pje-chat-input-container {
        padding: 20px 24px !important;
        border-top: 1px solid #333 !important;
        display: flex !important;
        gap: 12px !important;
        background: #1e1e1e !important;
        align-items: flex-end !important;
      }
      
      #pje-chat-input {
        flex: 1 !important;
        padding: 14px 16px !important;
        border: 1px solid #404040 !important;
        border-radius: 12px !important;
        font-size: 14px !important;
        outline: none !important;
        transition: all 0.3s ease !important;
        background: #2a2a2a !important;
        color: #e5e5e5 !important;
        resize: none !important;
        min-height: 20px !important;
        max-height: 100px !important;
        font-family: inherit !important;
      }

      .lex-input:focus {
        border-color: #4a1a5c !important;
        box-shadow: 0 0 0 2px rgba(74, 26, 92, 0.2) !important;
        background: rgba(0, 0, 0, 0.4) !important;
      }

      .lex-input::placeholder {
        color: rgba(255, 255, 255, 0.5) !important;
      }

      .lex-send:hover {
        background: linear-gradient(135deg, #5a2a6c 0%, #3d5a5a 100%) !important;
        transform: translateY(-1px) !important;
      }

      .lex-close:hover {
        background: rgba(255, 255, 255, 0.2) !important;
        transform: scale(1.05) !important;
      }

      /* Estilos para indicador de digitação */
      .typing-dots {
        display: inline-flex !important;
        gap: 4px !important;
        margin-left: 8px !important;
      }

      .typing-dots span {
        width: 6px !important;
        height: 6px !important;
        border-radius: 50% !important;
        background-color: rgba(255, 255, 255, 0.5) !important;
        animation: typingBounce 1.4s infinite ease-in-out !important;
      }

      .typing-dots span:nth-child(1) {
        animation-delay: -0.32s !important;
      }

      .typing-dots span:nth-child(2) {
        animation-delay: -0.16s !important;
      }

      @keyframes typingBounce {
        0%, 80%, 100% {
          transform: scale(0.6) !important;
        }
        40% {
          transform: scale(1) !important;
        }
      }

      /* Scrollbar personalizada para mensagens */
      .lex-messages::-webkit-scrollbar {
        width: 4px !important;
      }

      .lex-messages::-webkit-scrollbar-track {
        background: transparent !important;
      }

      .lex-messages::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2) !important;
        border-radius: 2px !important;
      }

      .lex-messages::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3) !important;
      }

      /* Responsividade */
      @media (max-width: 480px) {
        .lex-chat {
          right: 8px !important;
          bottom: 8px !important;
          width: calc(100% - 16px) !important;
          max-width: 350px !important;
          height: 400px !important;
        }
      }

      /* Animação de entrada suave */
      @keyframes slideInUp {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .lex-chat.visible {
        animation: slideInUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
      }

      /* Efeitos de hover aprimorados */
      .lex-status-dot {
        animation: pulse 2s infinite !important;
      }

      @keyframes pulse {
        0% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.7;
          transform: scale(1.1);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }

      /* Melhorias de acessibilidade */
      .lex-close:focus,
      .lex-send:focus,
      .lex-input:focus {
        outline: 2px solid #4a1a5c !important;
        outline-offset: 2px !important;
      }

      /* Transições suaves */
      .lex-close,
      .lex-send,
      .lex-input {
        transition: all 0.2s ease !important;
      }

      /* Finalização dos estilos */
      .lex-send:active {
        transform: translateY(0) !important;
      }

      .lex-input:disabled {
        opacity: 0.5 !important;
        cursor: not-allowed !important;
      }

      /* Melhorias visuais finais */
      .lex-card-header span:first-child {
        margin-right: 4px !important;
      }

      .lex-message:last-child {
        margin-bottom: 0 !important;
      }
    `;   
      #pje-chat-input:focus {
        border-color: #4a1a5c !important;
        box-shadow: 0 0 0 2px rgba(74, 26, 92, 0.2) !important;
        background: #333 !important;
      }
      
      #pje-chat-input::placeholder {
        color: rgba(255, 255, 255, 0.5) !important;
      }
      
      #pje-chat-send {
        background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%) !important;
        color: white !important;
        border: none !important;
        padding: 12px 16px !important;
        border-radius: 12px !important;
        cursor: pointer !important;
        font-size: 16px !important;
        font-weight: 500 !important;
        transition: all 0.3s ease !important;
        box-shadow: 0 4px 16px rgba(74, 26, 92, 0.4) !important;
        min-width: 48px !important;
        height: 48px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      
      #pje-chat-send:hover {
        background: linear-gradient(135deg, #5a2a6c 0%, #3d5a5a 100%) !important;
        transform: translateY(-2px) !important;
        box-shadow: 0 6px 20px rgba(74, 26, 92, 0.5) !important;
      }
      
      #pje-chat-send:disabled {
        opacity: 0.5 !important;
        cursor: not-allowed !important;
        transform: none !important;
      }
      
      #pje-chat-send span {
        font-size: 16px !important;
      }
      
      .typing-indicator {
        display: flex !important;
        align-items: center !important;
        padding: 12px 16px !important;
        background: white !important;
        border: 1px solid #e0e0e0 !important;
        border-radius: 18px !important;
        border-bottom-left-radius: 6px !important;
        max-width: 85% !important;
        margin-bottom: 16px !important;
      }
      
      .typing-dots {
        display: flex !important;
        gap: 4px !important;
      }
      
      .typing-dots span {
        width: 6px !important;
        height: 6px !important;
        background: #999 !important;
        border-radius: 50% !important;
        animation: typing 1.4s infinite ease-in-out !important;
      }
      
      .typing-dots span:nth-child(1) { animation-delay: -0.32s !important; }
      .typing-dots span:nth-child(2) { animation-delay: -0.16s !important; }
      
      @keyframes typing {
        0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
      }
    `;
    
    // Não vamos carregar fontes externas para evitar erros 404
    
    // Adicionar estilos ao documento
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
    console.log('✅ Estilos do chat aplicados');
  }  

  // Mostrar chat
  function mostrarChat() {
    console.log('👁️ Mostrando chat...');
    if (chatContainer) {
      chatContainer.classList.add('visible');
      const input = chatContainer.querySelector('.lex-input');
      if (input) {
        setTimeout(() => input.focus(), 300);
      }
      console.log('✅ Chat mostrado');
    }
  }
  
  // Esconder chat
  function esconderChat() {
    console.log('👁️ Escondendo chat...');
    if (chatContainer) {
      chatContainer.classList.remove('visible');
    }
  }
  
  // Configurar eventos do chat
  function configurarEventosChat() {
    console.log('⚙️ Configurando eventos do chat...');
    
    const closeBtn = chatContainer.querySelector('.lex-close');
    const sendBtn = chatContainer.querySelector('.lex-send');
    const input = chatContainer.querySelector('.lex-input');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        console.log('❌ Fechando chat');
        esconderChat();
      });
    }
    

    
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        console.log('📤 Enviando mensagem');
        enviarMensagem();
      });
    }
    
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          console.log('⌨️ Enter pressionado');
          enviarMensagem();
        }
      });
    }
    
    console.log('✅ Eventos configurados');
  }
  
  // Adicionar mensagem inicial
  function adicionarMensagemInicial(info) {
    console.log('💬 Adicionando mensagem inicial...');
    
    try {
      const messagesContainer = chatContainer.querySelector('.lex-messages');
      if (!messagesContainer) {
        console.error('❌ Container de mensagens não encontrado');
        return;
      }
      
      // Mensagem de boas-vindas
      const welcomeMessage = document.createElement('div');
      welcomeMessage.className = 'lex-message assistant';
      welcomeMessage.innerHTML = `
        <div class="lex-bubble">
          Olá! Sou a Lex. ▲<br><br>
          Seu assistente jurídico inteligente. Identifiquei automaticamente as informações do processo atual. Como posso ajudá-lo?
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
      
      console.log('✅ Mensagem inicial adicionada');
    } catch (error) {
      console.error('❌ Erro ao adicionar mensagem inicial:', error);
    }
  }
    
    // Mensagem de boas-vindas
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'lex-message assistant';
    welcomeMessage.innerHTML = `
      <div class="lex-bubble">
        Olá! Sou a Lex. ▲<br><br>
        Seu assistente jurídico inteligente. Identifiquei automaticamente as informações do processo atual. Como posso ajudá-lo?
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
    
    console.log('✅ Mensagem inicial adicionada');
  }
  
  // Enviar mensagem
  function enviarMensagem() {
    const input = chatContainer.querySelector('.lex-input');
    const messagesContainer = chatContainer.querySelector('.lex-messages');
    const texto = input.value.trim();
    
    if (!texto) return;
    
    console.log('📝 Enviando mensagem:', texto);
    
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
    
    // Mostrar indicador de digitação
    mostrarIndicadorDigitacao();
    
    // Simular resposta após delay
    setTimeout(async () => {
      esconderIndicadorDigitacao();
      const resposta = await gerarResposta(texto);
      adicionarRespostaAssistente(resposta);
    }, 1500 + Math.random() * 1000);
  }
  
  // Mostrar indicador de digitação
  function mostrarIndicadorDigitacao() {
    const messagesContainer = chatContainer.querySelector('.lex-messages');
    
    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'typing-indicator';
    typingIndicator.className = 'lex-message assistant';
    typingIndicator.innerHTML = `
      <div class="lex-bubble">
        Digitando
        <div class="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
    
    messagesContainer.appendChild(typingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Esconder indicador de digitação
  function esconderIndicadorDigitacao() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }
  
  // Adicionar resposta do assistente
  function adicionarRespostaAssistente(resposta) {
    const messagesContainer = chatContainer.querySelector('.lex-messages');
    
    const assistantMessage = document.createElement('div');
    assistantMessage.className = 'lex-message assistant';
    assistantMessage.innerHTML = `
      <div class="lex-bubble">${resposta}</div>
      <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    messagesContainer.appendChild(assistantMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Configurar API da OpenAI
  function configurarAPI(apiKey, options = {}) {
    apiConfig.enabled = true;
    apiConfig.apiKey = apiKey;
    apiConfig.model = options.model || 'gpt-3.5-turbo';
    apiConfig.maxTokens = options.maxTokens || 500;
    apiConfig.temperature = options.temperature || 0.7;
    
    console.log('🔑 API da OpenAI configurada');
    
    // Salvar configuração no localStorage
    localStorage.setItem('pje-assistant-api-config', JSON.stringify({
      enabled: true,
      model: apiConfig.model,
      maxTokens: apiConfig.maxTokens,
      temperature: apiConfig.temperature
    }));
  }
  
  // Carregar configuração da API
  function carregarConfiguracaoAPI() {
    try {
      const savedConfig = localStorage.getItem('pje-assistant-api-config');
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        apiConfig.enabled = config.enabled || false;
        apiConfig.model = config.model || 'gpt-3.5-turbo';
        apiConfig.maxTokens = config.maxTokens || 500;
        apiConfig.temperature = config.temperature || 0.7;
        
        // Verificar se tem API key salva (não recomendado, mas possível)
        const savedApiKey = localStorage.getItem('pje-assistant-api-key');
        if (savedApiKey) {
          apiConfig.apiKey = savedApiKey;
        }
        
        console.log('📋 Configuração da API carregada:', config);
      }
    } catch (error) {
      console.log('⚠️ Erro ao carregar configuração da API:', error);
    }
  }
  
  // Chamar API da OpenAI
  async function chamarOpenAI(pergunta, contexto = {}) {
    if (!apiConfig.enabled || !apiConfig.apiKey) {
      throw new Error('API não configurada');
    }
    
    try {
      const mensagens = [
        {
          role: 'system',
          content: `Você é o PJe Assistant, um assistente especializado no sistema PJe (Processo Judicial Eletrônico) do Brasil. 
          
          Contexto do processo atual:
          - Número: ${contexto.numeroProcesso || 'Não identificado'}
          - Documento ID: ${contexto.documentoId || 'Não identificado'}
          - Nome do documento: ${contexto.nomeDocumento || 'Não identificado'}
          - Tribunal: ${contexto.tribunal || 'Não identificado'}
          
          Responda de forma útil, precisa e profissional sobre questões relacionadas ao PJe, processos judiciais e documentos. Use emojis quando apropriado e mantenha as respostas concisas mas informativas.`
        },
        {
          role: 'user',
          content: pergunta
        }
      ];
      
      const response = await fetch(apiConfig.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.apiKey}`
        },
        body: JSON.stringify({
          model: apiConfig.model,
          messages: mensagens,
          max_tokens: apiConfig.maxTokens,
          temperature: apiConfig.temperature
        })
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
      
    } catch (error) {
      console.error('❌ Erro na API da OpenAI:', error);
      throw error;
    }
  }
  
  // Gerar resposta do assistente (híbrido: API + simulado)
  async function gerarResposta(pergunta) {
    const perguntaLower = pergunta.toLowerCase();
    
    // Extrair dados atualizados do processo
    const dadosProcesso = await extrairInformacoesOtimizado();
    
    // Tentar usar API da OpenAI primeiro
    if (apiConfig.enabled && apiConfig.apiKey) {
      try {
        console.log('🤖 Usando API da OpenAI...');
        const respostaAPI = await chamarOpenAI(pergunta, dadosProcesso);
        return respostaAPI;
      } catch (error) {
        console.log('⚠️ Erro na API, usando respostas simuladas:', error);
        // Continuar para respostas simuladas em caso de erro
      }
    }
    
    // Perguntas sobre dados específicos do processo
    if (perguntaLower.includes('valor') && perguntaLower.includes('causa')) {
      return dadosProcesso.valorCausa ? 
        `💰 <strong>Valor da Causa:</strong> ${dadosProcesso.valorCausa}` :
        `❌ Não foi possível localizar o valor da causa neste processo.`;
    }
    
    if (perguntaLower.includes('autor') || perguntaLower.includes('requerente')) {
      return dadosProcesso.autor ? 
        `👤 <strong>Autor/Requerente:</strong> ${dadosProcesso.autor}` :
        `❌ Não foi possível identificar o autor/requerente neste processo.`;
    }
    
    if (perguntaLower.includes('réu') || perguntaLower.includes('requerido')) {
      return dadosProcesso.reu ? 
        `👤 <strong>Réu/Requerido:</strong> ${dadosProcesso.reu}` :
        `❌ Não foi possível identificar o réu/requerido neste processo.`;
    }
    
    if (perguntaLower.includes('juiz') || perguntaLower.includes('magistrado')) {
      return dadosProcesso.juiz ? 
        `⚖️ <strong>Juiz/Magistrado:</strong> ${dadosProcesso.juiz}` :
        `❌ Não foi possível identificar o juiz responsável neste processo.`;
    }
    
    if (perguntaLower.includes('vara') || perguntaLower.includes('juízo')) {
      return dadosProcesso.vara ? 
        `🏛️ <strong>Vara/Juízo:</strong> ${dadosProcesso.vara}` :
        `❌ Não foi possível identificar a vara/juízo neste processo.`;
    }
    
    if (perguntaLower.includes('tribunal')) {
      return dadosProcesso.tribunal ? 
        `🏛️ <strong>Tribunal:</strong> ${dadosProcesso.tribunal}` :
        `❌ Não foi possível identificar o tribunal neste processo.`;
    }
    
    if (perguntaLower.includes('número') && perguntaLower.includes('processo')) {
      return dadosProcesso.numeroProcesso ? 
        `📋 <strong>Número do Processo:</strong> ${dadosProcesso.numeroProcesso}` :
        `❌ Não foi possível identificar o número do processo.`;
    }
    
    if (perguntaLower.includes('assunto') || perguntaLower.includes('classe')) {
      return dadosProcesso.assunto ? 
        `📝 <strong>Assunto/Classe:</strong> ${dadosProcesso.assunto}` :
        `❌ Não foi possível identificar o assunto/classe do processo.`;
    }
    
    if (perguntaLower.includes('distribuição') || perguntaLower.includes('data') && perguntaLower.includes('distribuição')) {
      return dadosProcesso.dataDistribuicao ? 
        `📅 <strong>Data de Distribuição:</strong> ${dadosProcesso.dataDistribuicao}` :
        `❌ Não foi possível identificar a data de distribuição.`;
    }
    
    if (perguntaLower.includes('última') && perguntaLower.includes('movimentação')) {
      return dadosProcesso.ultimaMovimentacao ? 
        `📅 <strong>Última Movimentação:</strong> ${dadosProcesso.ultimaMovimentacao}` :
        `❌ Não foi possível identificar a última movimentação.`;
    }
    
    if (perguntaLower.includes('situação') || perguntaLower.includes('status')) {
      return dadosProcesso.situacao ? 
        `📊 <strong>Situação do Processo:</strong> ${dadosProcesso.situacao}` :
        `❌ Não foi possível identificar a situação atual do processo.`;
    }
    
    if (perguntaLower.includes('analisar') || perguntaLower.includes('processo atual')) {
      return gerarAnaliseCompleta(dadosProcesso);
    }
    
    if (perguntaLower.includes('prazo')) {
      return `⏰ <strong>Informações sobre Prazos</strong><br><br>
              Os prazos no PJe são contados automaticamente:<br><br>
              • <strong>Dias úteis:</strong> Não incluem sábados, domingos e feriados<br>
              • <strong>Intimações:</strong> Prazo conta a partir da ciência<br>
              • <strong>Peticionamento:</strong> Até 23h59 do último dia<br>
              • <strong>Consulta:</strong> Verifique a aba "Prazos" do processo<br><br>
              ⚠️ <strong>Importante:</strong> Sempre confirme os prazos diretamente no sistema!`;
    }
    
    if (perguntaLower.includes('peticionar') || perguntaLower.includes('petição')) {
      return `📝 <strong>Como Peticionar no PJe</strong><br><br>
              <strong>Passo a passo:</strong><br>
              1. Acesse "Peticionamento Eletrônico"<br>
              2. Selecione o processo<br>
              3. Escolha o tipo de petição<br>
              4. Redija ou anexe a petição<br>
              5. Anexe documentos (se necessário)<br>
              6. Assine digitalmente<br>
              7. Confirme o protocolo<br><br>
              💡 <strong>Dica:</strong> Sempre salve o comprovante de protocolo!`;
    }
    
    if (perguntaLower.includes('ajuda') || perguntaLower.includes('comando')) {
      return `🤖 <strong>Comandos Disponíveis</strong><br><br>
              <strong>📋 Análise:</strong><br>
              • "analisar processo" - Análise detalhada<br>
              • "informações" - Dados do processo atual<br><br>
              <strong>⏰ Prazos:</strong><br>
              • "prazos" - Informações sobre prazos<br>
              • "intimação" - Sobre intimações<br><br>
              <strong>📝 Peticionamento:</strong><br>
              • "como peticionar" - Guia completo<br>
              • "documentos" - Sobre anexos<br><br>
              <strong>🔍 Consultas:</strong><br>
              • "consultar processo" - Como consultar<br>
              • "certidões" - Sobre certidões<br><br>
              Digite qualquer pergunta sobre o PJe que tentarei ajudar! 😊`;
    }
    
    // Respostas genéricas
    const respostasGenericas = [
      `Interessante pergunta! 🤔<br><br>Posso ajudar com informações específicas sobre o PJe. Tente perguntar sobre:<br>• Prazos processuais<br>• Como peticionar<br>• Consulta de processos<br>• Análise do processo atual`,
      
      `Entendi sua dúvida! 💡<br><br>Sou especializado em ajudar com o sistema PJe. Algumas sugestões:<br>• Digite "ajuda" para ver todos os comandos<br>• "analisar processo" para análise detalhada<br>• "prazos" para informações sobre prazos`,
      
      `Boa pergunta! 👍<br><br>Como assistente do PJe, posso orientar sobre:<br>• Navegação no sistema<br>• Procedimentos processuais<br>• Peticionamento eletrônico<br>• Consultas e certidões<br><br>O que você gostaria de saber especificamente?`
    ];
    
    return respostasGenericas[Math.floor(Math.random() * respostasGenericas.length)];
  }  

  // Detectar embed/iframe e extrair metadados
  async function detectarDocumento() {
    const info = { docId: null, docName: null, urlRaw: null };
    
    const embeds = document.querySelectorAll('embed, iframe');
    for (let embed of embeds) {
      const src = embed.src || embed.getAttribute('src');
      if (src && (src.includes('documento') || src.includes('pdf'))) {
        let docId = null;
        const downloadMatch = src.match(/\/documento\/download\/(\d+)/);
        if (downloadMatch) {
          docId = downloadMatch[1];
        }
        
        if (!docId) {
          const urlParams = new URLSearchParams(src.split('?')[1] || '');
          docId = urlParams.get('idDocumento') || urlParams.get('id') || urlParams.get('docId');
        }
        
        if (!docId) {
          const numeroMatch = src.match(/(\d{8,})/);
          if (numeroMatch) {
            docId = numeroMatch[1];
          }
        }
        
        let docName = embed.title || embed.getAttribute('title');
        
        if (!docName) {
          const urlParts = src.split('/');
          const lastPart = urlParts[urlParts.length - 1];
          if (lastPart && lastPart.includes('.')) {
            docName = decodeURIComponent(lastPart);
          }
        }
        
        if (docId && !docName) {
          const elementosLaterais = document.querySelectorAll('*');
          for (let el of elementosLaterais) {
            const texto = el.innerText || el.textContent || '';
            if (texto.length > 10 && texto.length < 200) {
              const padraoMatch = texto.match(new RegExp(`${docId}\\s*-\\s*(.+?)(?:\\n|$|\\s{2,})`, 'i'));
              if (padraoMatch && padraoMatch[1]) {
                docName = padraoMatch[1].trim();
                console.log('📝 Nome extraído do DOM:', docName);
                break;
              }
            }
          }
        }
        
        info.docId = docId;
        info.docName = docName;
        info.urlRaw = src;
        
        console.log('📄 PDF detectado:', info);
        break;
      }
    }
    
    return info;
  }
  
  // Extrair informações da página
  async function extrairInformacoes() {
    const texto = document.body.innerText;
    const info = {};
    
    console.log('🔍 Analisando texto da página...');
    
    // Buscar número do processo
    const numeroMatch = texto.match(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4})/);
    if (numeroMatch) {
      info.numeroProcesso = numeroMatch[0];
      console.log('📋 Processo encontrado:', info.numeroProcesso);
    }
    
    // Detectar documento via embed/iframe
    const docInfo = await detectarDocumento();
    if (docInfo.docId) {
      console.log('📄 Documento ID extraído:', docInfo.docId);
      info.documentoId = docInfo.docId;
    }
    if (docInfo.docName) {
      console.log('📄 Nome do documento extraído:', docInfo.docName);
      info.nomeDocumento = docInfo.docName;
    }
    
    // Lista expandida de tipos de documento
    const tiposDocumento = [
      'Embargos de Declaração', 'Contestação', 'Petição Inicial', 'Sentença', 
      'Decisão', 'Despacho', 'Acórdão', 'Ato Ordinatório', 'Certidão', 
      'Mandado', 'Intimação', 'Recurso', 'Agravo', 'Apelação', 'Ofício', 'Alvará',
      'Tréplica', 'Impugnação', 'Manifestação', 'Memorial', 'Razões', 'Contrarrazões'
    ];
    
    // Buscar em elementos selecionados/ativos
    const seletoresAtivos = [
      '.rich-tree-node-selected', '.selected', '.active', '.highlight', '.current',
      '[class*="selected"]', '[class*="active"]', '[class*="current"]', '[style*="background"]'
    ];
    
    for (let seletor of seletoresAtivos) {
      const elementos = document.querySelectorAll(seletor);
      console.log(`🔍 Verificando seletor "${seletor}":`, elementos.length, 'elementos');
      
      for (let el of elementos) {
        const textoEl = el.innerText || el.textContent || '';
        if (textoEl.length > 5) {
          console.log('🎯 Texto do elemento ativo:', textoEl.substring(0, 150));
          
          for (let tipo of tiposDocumento) {
            if (textoEl.includes(tipo)) {
              info.tipoDocumento = tipo;
              console.log(`✅ ${tipo} identificado pela barra lateral`);
              break;
            }
          }
          if (info.tipoDocumento) break;
        }
      }
      if (info.tipoDocumento) break;
    }
    
    // Buscar por padrões específicos em todos os elementos
    if (!info.tipoDocumento) {
      const todosElementos = document.querySelectorAll('*');
      for (let el of todosElementos) {
        const textoEl = el.innerText || el.textContent || '';
        for (let tipo of tiposDocumento) {
          if (textoEl.match(new RegExp(`\\d+\\s*-\\s*${tipo}`, 'i'))) {
            info.tipoDocumento = tipo;
            console.log(`✅ ${tipo} encontrado no padrão:`, textoEl.trim());
            break;
          }
        }
        if (info.tipoDocumento) break;
      }
    }
    
    // Fallback no texto da página
    if (!info.tipoDocumento) {
      for (let tipo of tiposDocumento) {
        if (texto.includes(tipo.toUpperCase()) || texto.includes(tipo)) {
          info.tipoDocumento = tipo;
          console.log(`✅ ${tipo} identificado no texto`);
          break;
        }
      }
    }
    
    // Se não conseguiu nome via DOM, usar o tipo de documento identificado
    if (!info.nomeDocumento && info.tipoDocumento) {
      info.nomeDocumento = info.tipoDocumento;
      console.log('📝 Nome definido como tipo de documento:', info.nomeDocumento);
    }
    
    // Se ainda não tem nome, tentar extrair da barra lateral usando o ID
    if (!info.nomeDocumento && info.documentoId) {
      const elementosLaterais = document.querySelectorAll('*');
      for (let el of elementosLaterais) {
        const texto = el.innerText || el.textContent || '';
        if (texto.includes(info.documentoId)) {
          const padraoMatch = texto.match(new RegExp(`${info.documentoId}\\s*-\\s*(.+?)(?:\\n|$|\\s{3,})`, 'i'));
          if (padraoMatch && padraoMatch[1] && padraoMatch[1].trim().length > 2) {
            info.nomeDocumento = padraoMatch[1].trim();
            console.log('📝 Nome extraído da barra lateral:', info.nomeDocumento);
            break;
          }
        }
      }
    }
    
    // Identificar tribunal
    const tribunalMatch = texto.match(/TRIBUNAL DE JUSTIÇA[^.]*[A-Z]{2,}/i);
    if (tribunalMatch) {
      info.tribunal = tribunalMatch[0];
    }
    
    console.log('📊 Informações extraídas:', info);
    return info;
  }
  
  // Atualizar informações do chat
  async function atualizarInformacoesChat() {
    if (!chatContainer) return;
    
    console.log('🔄 Atualizando informações do chat...');
    
    try {
      const info = await extrairInformacoes();
      console.log('📊 Novas informações extraídas:', info);
      
      // Atualizar o card de informações
      const infoContent = document.querySelector('.info-content');
      if (infoContent) {
        infoContent.innerHTML = `
          ${info.numeroProcesso ? `<div class="info-item"><span class="info-label">Processo:</span> <span class="info-value">${info.numeroProcesso}</span></div>` : ''}
          ${info.documentoId ? `<div class="info-item"><span class="info-label">ID Documento:</span> <span class="info-value">${info.documentoId}</span></div>` : ''}
          ${info.nomeDocumento || info.tipoDocumento ? `<div class="info-item"><span class="info-label">Nome:</span> <span class="info-value">${info.nomeDocumento || info.tipoDocumento}</span></div>` : ''}
          ${info.tribunal ? `<div class="info-item"><span class="info-label">Tribunal:</span> <span class="info-value">${info.tribunal}</span></div>` : ''}
        `;
        
        console.log('✅ Card de informações atualizado');
        
        // Adicionar mensagem no chat sobre a mudança
        if (info.nomeDocumento || info.tipoDocumento) {
          const messagesContainer = document.getElementById('pje-chat-messages');
          if (messagesContainer) {
            const updateMessage = document.createElement('div');
            updateMessage.className = 'chat-message assistant';
            updateMessage.innerHTML = `
              <div class="message-bubble assistant">
                🔄 <strong>Documento alterado!</strong><br><br>
                Agora visualizando: <strong>${info.nomeDocumento || info.tipoDocumento}</strong>
                ${info.documentoId ? `<br>ID: ${info.documentoId}` : ''}
              </div>
              <div class="message-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            `;
            
            messagesContainer.appendChild(updateMessage);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            console.log('✅ Mensagem de atualização adicionada ao chat');
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Erro ao atualizar informações:', error);
    }
  }
  
  // MutationObserver para SPAs e mudanças de documento
  function observarMudancas() {
    if (!document.body) {
      console.log('⚠️ document.body não disponível, aguardando...');
      setTimeout(observarMudancas, 1000);
      return;
    }
    
    try {
      const observer = new MutationObserver((mutations) => {
        let documentoMudou = false;
        
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            // Verificar se novos embeds/iframes foram adicionados
            const novosEmbeds = document.querySelectorAll('embed, iframe');
            if (novosEmbeds.length > 0) {
              documentoMudou = true;
            }
            
            // Verificar se elementos da barra lateral mudaram (seleção de documento)
            const elementosAdicionados = Array.from(mutation.addedNodes);
            const elementosRemovidos = Array.from(mutation.removedNodes);
            
            const mudancasBarra = elementosAdicionados.concat(elementosRemovidos).some(node => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                return node.classList && (
                  node.classList.contains('selected') ||
                  node.classList.contains('active') ||
                  node.classList.contains('rich-tree-node-selected') ||
                  node.querySelector && (
                    node.querySelector('.selected') ||
                    node.querySelector('.active') ||
                    node.querySelector('.rich-tree-node-selected')
                  )
                );
              }
              return false;
            });
            
            if (mudancasBarra) {
              documentoMudou = true;
              console.log('🔄 Mudança detectada na seleção da barra lateral');
            }
          }
          
          // Verificar mudanças de atributos (como class="selected")
          if (mutation.type === 'attributes') {
            const target = mutation.target;
            if (target.classList && (
              target.classList.contains('selected') ||
              target.classList.contains('active') ||
              target.classList.contains('rich-tree-node-selected')
            )) {
              documentoMudou = true;
              console.log('🔄 Mudança de atributo detectada (seleção)');
            }
          }
        });
        
        // Se detectou mudança de documento, atualizar após um pequeno delay
        if (documentoMudou) {
          console.log('🔄 Mudança de documento detectada, atualizando...');
          setTimeout(() => {
            atualizarInformacoesChat();
          }, 1000); // Aguardar 1 segundo para a página carregar
        }
      });
      
      observer.observe(document.body, { 
        childList: true, 
        subtree: true, 
        attributes: true,
        attributeFilter: ['class', 'style']
      });
      console.log('✅ MutationObserver iniciado com detecção de mudanças');
      
    } catch (error) {
      console.error('❌ Erro ao iniciar MutationObserver:', error);
    }
  }
  
  // Observar cliques na barra lateral
  function observarCliquesBarraLateral() {
    // Aguardar um pouco para a página carregar
    setTimeout(() => {
      const barraLateral = document.querySelector('.rich-tree, .tree, [class*="tree"]') || 
                          document.querySelector('div[style*="overflow"]');
      
      if (barraLateral) {
        console.log('📋 Adicionando listener de cliques na barra lateral');
        
        barraLateral.addEventListener('click', function(e) {
          // Verificar se o clique foi em um item da árvore
          const target = e.target.closest('[class*="tree-node"], [class*="rich-tree"], a, span');
          if (target) {
            console.log('🖱️ Clique detectado na barra lateral:', target.innerText?.substring(0, 50));
            
            // Aguardar um pouco para o documento carregar
            setTimeout(() => {
              atualizarInformacoesChat();
            }, 1500);
          }
        });
        
        console.log('✅ Listener de cliques configurado');
      } else {
        console.log('⚠️ Barra lateral não encontrada, tentando novamente...');
        setTimeout(observarCliquesBarraLateral, 2000);
      }
    }, 1000);
  }
  
  // Inicializar
  function inicializar() {
    console.log('🚀 Inicializando PJe Assistant...');
    
    // Iniciar observadores
  }
  
  // Função para atualizar informações do chat quando mudar documento
  function atualizarInfoChat() {
    if (!chatContainer) return;
    
    // Extrair novas informações
    extrairInformacoesOtimizado().then(info => {
      const infoContent = document.querySelector('.info-content');
      if (infoContent && info) {
        infoContent.innerHTML = `
          ${info.numeroProcesso ? `<div class="info-item"><span class="info-label">Processo:</span> <span class="info-value">${info.numeroProcesso}</span></div>` : ''}
          ${info.documentoId ? `<div class="info-item"><span class="info-label">ID Documento:</span> <span class="info-value">${info.documentoId}</span></div>` : ''}
          ${info.nomeDocumento || info.tipoDocumento ? `<div class="info-item"><span class="info-label">Nome:</span> <span class="info-value">${info.nomeDocumento || info.tipoDocumento}</span></div>` : ''}
          ${info.tribunal ? `<div class="info-item"><span class="info-label">Tribunal:</span> <span class="info-value">${info.tribunal}</span></div>` : ''}
        `;
        console.log('🔄 Informações do chat atualizadas:', info);
        
        // Adicionar mensagem no chat sobre a mudança
        if (info.documentoId || info.nomeDocumento) {
          const messagesContainer = document.getElementById('pje-chat-messages');
          if (messagesContainer) {
            const updateMessage = document.createElement('div');
            updateMessage.className = 'chat-message assistant';
            updateMessage.innerHTML = `
              <div class="message-bubble assistant">
                📄 <strong>Documento atualizado!</strong><br><br>
                ${info.documentoId ? `ID: ${info.documentoId}<br>` : ''}
                ${info.nomeDocumento ? `Nome: ${info.nomeDocumento}` : ''}
              </div>
              <div class="message-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            `;
            messagesContainer.appendChild(updateMessage);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }
      }
    });
  }
  
  // Observar mudanças na página para atualizar informações (ultra-otimizado)
  function observarMudancasDocumento() {
    let ultimoDocumentoId = null;
    let ultimaURL = null;
    let verificandoMudanca = false;
    
    // Função otimizada para verificar mudanças
    function verificarMudancaDocumento() {
      if (verificandoMudanca) return;
      verificandoMudanca = true;
      
      try {
        // Buscar documento atual de forma mais eficiente
        const embeds = document.querySelectorAll('embed[src*="documento"], iframe[src*="documento"], embed[src*="pdf"], iframe[src*="pdf"]');
        let documentoAtual = null;
        let urlAtual = null;
        
        for (let embed of embeds) {
          const src = embed.src;
          if (src) {
            urlAtual = src;
            
            // Extrair ID do documento
            const downloadMatch = src.match(/\/documento\/download\/(\d+)/);
            if (downloadMatch) {
              documentoAtual = downloadMatch[1];
              break;
            }
            
            const urlParams = new URLSearchParams(src.split('?')[1] || '');
            documentoAtual = urlParams.get('idDocumento') || urlParams.get('id') || urlParams.get('docId');
            if (documentoAtual) break;
          }
        }
        
        // Verificar se houve mudança real
        const mudouDocumento = documentoAtual && documentoAtual !== ultimoDocumentoId;
        const mudouURL = urlAtual && urlAtual !== ultimaURL;
        
        if (mudouDocumento || mudouURL) {
          console.log('📄 Documento mudou:', ultimoDocumentoId, '→', documentoAtual);
          ultimoDocumentoId = documentoAtual;
          ultimaURL = urlAtual;
          
          // Limpar cache para forçar nova extração
          domCache.lastUpdate = 0;
          
          // Aguardar documento carregar e atualizar
          setTimeout(atualizarInfoChat, 800);
        }
        
      } catch (error) {
        console.log('⚠️ Erro na verificação:', error);
      } finally {
        verificandoMudanca = false;
      }
    }
    
    // 1. Observador de cliques global (mais eficiente)
    document.addEventListener('click', (e) => {
      const target = e.target;
      const texto = target.textContent || '';
      
      // Detectar cliques em elementos que podem mudar documento
      if (target.closest('.rich-tree-node') || 
          target.closest('[class*="tree"]') || 
          target.closest('[class*="node"]') ||
          target.closest('[class*="document"]') ||
          texto.match(/\d+\s*-\s*.+/) ||
          texto.includes('pdf') ||
          texto.includes('doc')) {
        
        console.log('🖱️ Clique relevante detectado');
        
        // Aguardar carregamento e verificar
        setTimeout(verificarMudancaDocumento, 1200);
      }
    });
    
    // 2. Observador de mudanças em src (específico)
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      
      for (let mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
          const target = mutation.target;
          if (target.tagName === 'EMBED' || target.tagName === 'IFRAME') {
            shouldCheck = true;
            break;
          }
        }
      }
      
      if (shouldCheck) {
        setTimeout(verificarMudancaDocumento, 300);
      }
    });
    
    // Observar apenas embeds e iframes
    const embeds = document.querySelectorAll('embed, iframe');
    embeds.forEach(embed => {
      observer.observe(embed, {
        attributes: true,
        attributeFilter: ['src']
      });
    });
    
    // 3. Verificação periódica leve (fallback)
    setInterval(() => {
      if (!verificandoMudanca) {
        verificarMudancaDocumento();
      }
    }, 5000); // A cada 5 segundos
    
    // 4. Verificação inicial
    setTimeout(verificarMudancaDocumento, 1000);
    
    console.log('👁️ Observador ultra-otimizado ativado');
  }
  
  // Função para configurar API via interface
  function mostrarPainelConfiguracao() {
    const painel = document.createElement('div');
    painel.id = 'pje-api-config-panel';
    painel.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 30px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 2147483648;
        width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      ">
        <h3 style="margin: 0 0 20px 0; color: #2c5aa0;">🔑 Configurar API OpenAI</h3>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">API Key:</label>
          <input type="password" id="api-key-input" placeholder="sk-..." style="
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
          ">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Modelo:</label>
          <select id="model-select" style="
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
          ">
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Recomendado)</option>
            <option value="gpt-4">GPT-4</option>
            <option value="gpt-4-turbo">GPT-4 Turbo</option>
          </select>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Max Tokens:</label>
          <input type="number" id="max-tokens-input" value="500" min="100" max="2000" style="
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
          ">
        </div>
        
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="cancel-config" style="
            padding: 10px 20px;
            border: 1px solid #ddd;
            background: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">Cancelar</button>
          
          <button id="save-config" style="
            padding: 10px 20px;
            border: none;
            background: #2c5aa0;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">Salvar</button>
        </div>
        
        <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 12px; color: #666;">
          💡 <strong>Dica:</strong> Sua API key será salva localmente no navegador. Para maior segurança, você pode configurar a cada sessão.
        </div>
      </div>
    `;
    
    document.body.appendChild(painel);
    
    // Eventos do painel
    document.getElementById('cancel-config').addEventListener('click', () => {
      painel.remove();
    });
    
    document.getElementById('save-config').addEventListener('click', () => {
      const apiKey = document.getElementById('api-key-input').value.trim();
      const model = document.getElementById('model-select').value;
      const maxTokens = parseInt(document.getElementById('max-tokens-input').value);
      
      if (!apiKey) {
        alert('Por favor, insira sua API key da OpenAI');
        return;
      }
      
      configurarAPI(apiKey, { model, maxTokens });
      painel.remove();
      
      // Mostrar confirmação
      const confirmacao = document.createElement('div');
      confirmacao.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: #4CAF50;
          color: white;
          padding: 15px 20px;
          border-radius: 6px;
          z-index: 2147483649;
          font-family: Arial, sans-serif;
        ">
          ✅ API configurada com sucesso!
        </div>
      `;
      document.body.appendChild(confirmacao);
      
      setTimeout(() => confirmacao.remove(), 3000);
    });
  }
  
  // Adicionar comando para configurar API
  function adicionarComandoConfiguracao() {
    // Adicionar ao chat uma mensagem sobre configuração da API
    window.pjeAssistantConfigurarAPI = mostrarPainelConfiguracao;
    
    // Adicionar atalho de teclado (Ctrl+Shift+A)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        mostrarPainelConfiguracao();
      }
    });
  }
  
  // Carregar configuração ao inicializar
  carregarConfiguracaoAPI();
  
  // Executar inicialização otimizada
  inicializarAssistente();
  
  // Ativar observador após inicialização
  setTimeout(() => {
    observarMudancasDocumento();
  }, 5000);
  
  // Adicionar comando de configuração
  adicionarComandoConfiguracao();
  
})();