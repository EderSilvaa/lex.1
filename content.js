// Chat PJe Assistant - Versão Completa
(function() {
  'use strict';
  
  console.log('🚀 PJE ASSISTANT v3.0 - INICIANDO');
  
  // Verificar se já foi carregado
  if (window.pjeAssistantActive) {
    console.log('⚠️ PJe Assistant já ativo, cancelando duplicação');
    return;
  }
  
  window.pjeAssistantActive = true;
  console.log('✅ PJe Assistant ativado');
  
  // Variáveis globais
  let chatContainer = null;
  let chatMessages = [];
  let isTyping = false;
  
  // Verificar se é sistema PJe (simplificado - manifest já filtra)
  function isPjeSystem() {
    const url = window.location.href;
    const isPje = url.includes('.jus.br') || 
                  url.includes('teste-pje.html') ||
                  url.includes('localhost');
    
    console.log('🔍 Verificando PJe:', url, '→', isPje);
    return isPje;
  }
  
  // Criar botão do chat
  function criarBotaoChat() {
    console.log('🔧 Criando botão do chat...');
    
    const botao = document.createElement('button');
    botao.id = 'pje-assistant-btn-' + Date.now();
    botao.innerHTML = '💬';
    botao.title = 'PJe Assistant';
    
    botao.setAttribute('style', `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      width: 55px !important;
      height: 55px !important;
      background: linear-gradient(135deg, #2c5aa0, #1e3d6f) !important;
      color: white !important;
      border: none !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      font-size: 20px !important;
      z-index: 2147483647 !important;
      box-shadow: 0 4px 15px rgba(44, 90, 160, 0.4) !important;
      transition: all 0.3s ease !important;
      font-family: Arial, sans-serif !important;
    `);
    
    // Hover effects
    botao.addEventListener('mouseenter', function() {
      this.style.transform = 'scale(1.1) translateY(-2px)';
      this.style.boxShadow = '0 6px 20px rgba(44, 90, 160, 0.6)';
    });
    
    botao.addEventListener('mouseleave', function() {
      this.style.transform = 'scale(1) translateY(0)';
      this.style.boxShadow = '0 4px 15px rgba(44, 90, 160, 0.4)';
    });
    
    // Evento de clique
    botao.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('🖱️ Botão clicado!');
      abrirChat();
    });
    
    document.body.appendChild(botao);
    console.log('✅ Botão criado e adicionado');
    
    return botao;
  }
  
  // Função para abrir chat
  async function abrirChat() {
    console.log('💬 Abrindo chat...');
    
    try {
      console.log('🔍 Extraindo informações...');
      const info = await extrairInformacoes();
      console.log('📊 Informações extraídas para chat:', info);
      
      if (!chatContainer) {
        console.log('🎨 Criando nova interface do chat...');
        criarInterfaceChat(info);
      } else {
        console.log('👁️ Mostrando chat existente...');
        mostrarChat();
      }
      
    } catch (error) {
      console.error('❌ Erro ao abrir chat:', error);
      alert('🎯 PJe Assistant Ativo!\n\n✅ Extensão funcionando corretamente!\n\n🤖 Como posso ajudá-lo?');
    }
  }  
  
// Criar interface completa do chat
  function criarInterfaceChat(info) {
    console.log('🎨 Criando interface do chat...');
    console.log('📋 Info recebida:', info);
    
    // Container principal do chat
    chatContainer = document.createElement('div');
    chatContainer.id = 'pje-chat-container';
    chatContainer.innerHTML = `
      <div id="pje-chat-header">
        <div id="pje-chat-title">
          <span class="chat-icon">💬</span>
          <span>PJe Assistant</span>
        </div>
        <button id="pje-chat-minimize">−</button>
        <button id="pje-chat-close">×</button>
      </div>
      
      <div id="pje-chat-info">
        <div class="info-card">
          <div class="info-header">📋 Informações do Processo</div>
          <div class="info-content">
            ${info.numeroProcesso ? `<div class="info-item"><span class="info-label">Processo:</span> <span class="info-value">${info.numeroProcesso}</span></div>` : ''}
            ${info.documentoId ? `<div class="info-item"><span class="info-label">ID Documento:</span> <span class="info-value">${info.documentoId}</span></div>` : ''}
            ${info.nomeDocumento || info.tipoDocumento ? `<div class="info-item"><span class="info-label">Nome:</span> <span class="info-value">${info.nomeDocumento || info.tipoDocumento}</span></div>` : ''}
            ${info.tribunal ? `<div class="info-item"><span class="info-label">Tribunal:</span> <span class="info-value">${info.tribunal}</span></div>` : ''}
          </div>
        </div>
      </div>
      
      <div id="pje-chat-messages"></div>
      
      <div id="pje-chat-input-container">
        <input type="text" id="pje-chat-input" placeholder="Digite sua pergunta sobre o processo...">
        <button id="pje-chat-send">
          <span>📤</span>
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
    
    // Adicionar mensagem inicial
    adicionarMensagemInicial(info);
    
    // Mostrar chat
    mostrarChat();
    
    console.log('✅ Interface do chat criada');
  }
  
  // Aplicar estilos do chat
  function aplicarEstilosChat() {
    const styles = `
      #pje-chat-container {
        position: fixed !important;
        top: 80px !important;
        right: 20px !important;
        width: 400px !important;
        height: 600px !important;
        background: white !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2) !important;
        z-index: 2147483646 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
        display: none !important;
        flex-direction: column !important;
        border: 1px solid #e0e0e0 !important;
        overflow: hidden !important;
      }
      
      #pje-chat-container.show {
        display: flex !important;
        animation: slideIn 0.3s ease-out !important;
      }
      
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      #pje-chat-header {
        background: linear-gradient(135deg, #2c5aa0 0%, #1e3d6f 100%) !important;
        color: white !important;
        padding: 16px 20px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        border-radius: 12px 12px 0 0 !important;
      }
      
      #pje-chat-title {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        font-weight: 600 !important;
        font-size: 16px !important;
      }
      
      .chat-icon {
        font-size: 18px !important;
      }
      
      #pje-chat-minimize, #pje-chat-close {
        background: rgba(255,255,255,0.2) !important;
        border: none !important;
        color: white !important;
        width: 28px !important;
        height: 28px !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        font-size: 16px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin-left: 8px !important;
        transition: background 0.2s !important;
      }
      
      #pje-chat-minimize:hover, #pje-chat-close:hover {
        background: rgba(255,255,255,0.3) !important;
      }
      
      #pje-chat-info {
        padding: 16px !important;
        background: #f8f9fa !important;
        border-bottom: 1px solid #e0e0e0 !important;
      }
      
      .info-card {
        background: white !important;
        border-radius: 8px !important;
        overflow: hidden !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
      }
      
      .info-header {
        background: #2c5aa0 !important;
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
        color: #555 !important;
        min-width: 100px !important;
        font-size: 13px !important;
      }
      
      .info-value {
        color: #333 !important;
        font-size: 13px !important;
        word-break: break-word !important;
        flex: 1 !important;
      }
      
      #pje-chat-messages {
        flex: 1 !important;
        padding: 16px !important;
        overflow-y: auto !important;
        background: #fafafa !important;
      }
      
      #pje-chat-messages::-webkit-scrollbar {
        width: 6px !important;
      }
      
      #pje-chat-messages::-webkit-scrollbar-track {
        background: #f1f1f1 !important;
      }
      
      #pje-chat-messages::-webkit-scrollbar-thumb {
        background: #c1c1c1 !important;
        border-radius: 3px !important;
      }
      
      .chat-message {
        margin-bottom: 16px !important;
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
        max-width: 85% !important;
        padding: 12px 16px !important;
        border-radius: 18px !important;
        font-size: 14px !important;
        line-height: 1.4 !important;
        word-wrap: break-word !important;
      }
      
      .message-bubble.assistant {
        background: white !important;
        border: 1px solid #e0e0e0 !important;
        border-bottom-left-radius: 6px !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
      }
      
      .message-bubble.user {
        background: linear-gradient(135deg, #2c5aa0 0%, #1e3d6f 100%) !important;
        color: white !important;
        border-bottom-right-radius: 6px !important;
      }
      
      .message-time {
        font-size: 11px !important;
        color: #999 !important;
        margin-top: 4px !important;
        margin-left: 8px !important;
        margin-right: 8px !important;
      }
      
      #pje-chat-input-container {
        padding: 16px !important;
        background: white !important;
        border-top: 1px solid #e0e0e0 !important;
        display: flex !important;
        gap: 12px !important;
        align-items: center !important;
      }
      
      #pje-chat-input {
        flex: 1 !important;
        padding: 12px 16px !important;
        border: 1px solid #ddd !important;
        border-radius: 24px !important;
        font-size: 14px !important;
        outline: none !important;
        transition: border-color 0.2s !important;
      }
      
      #pje-chat-input:focus {
        border-color: #2c5aa0 !important;
      }
      
      #pje-chat-send {
        background: #2c5aa0 !important;
        border: none !important;
        width: 44px !important;
        height: 44px !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: background 0.2s !important;
      }
      
      #pje-chat-send:hover {
        background: #1e3d6f !important;
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
      chatContainer.classList.add('show');
      const input = document.getElementById('pje-chat-input');
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
      chatContainer.classList.remove('show');
    }
  }
  
  // Configurar eventos do chat
  function configurarEventosChat() {
    console.log('⚙️ Configurando eventos do chat...');
    
    const closeBtn = document.getElementById('pje-chat-close');
    const minimizeBtn = document.getElementById('pje-chat-minimize');
    const sendBtn = document.getElementById('pje-chat-send');
    const input = document.getElementById('pje-chat-input');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        console.log('❌ Fechando chat');
        esconderChat();
      });
    }
    
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        console.log('➖ Minimizando chat');
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
    
    const messagesContainer = document.getElementById('pje-chat-messages');
    if (!messagesContainer) {
      console.error('❌ Container de mensagens não encontrado');
      return;
    }
    
    // Mensagem de boas-vindas
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'chat-message assistant';
    welcomeMessage.innerHTML = `
      <div class="message-bubble assistant">
        Olá! Sou o PJe Assistant. 👋<br><br>
        Identifiquei automaticamente as informações do processo atual. Como posso ajudá-lo?
      </div>
      <div class="message-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    messagesContainer.appendChild(welcomeMessage);
    
    // Sugestões de comandos
    setTimeout(() => {
      const suggestionsMessage = document.createElement('div');
      suggestionsMessage.className = 'chat-message assistant';
      suggestionsMessage.innerHTML = `
        <div class="message-bubble assistant">
          💡 <strong>Comandos úteis:</strong><br><br>
          • "analisar processo" - Análise detalhada<br>
          • "prazos" - Informações sobre prazos<br>
          • "como peticionar" - Guia de peticionamento<br>
          • "ajuda" - Lista completa de comandos
        </div>
        <div class="message-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      `;
      
      messagesContainer.appendChild(suggestionsMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 1000);
    
    console.log('✅ Mensagem inicial adicionada');
  }
  
  // Enviar mensagem
  function enviarMensagem() {
    const input = document.getElementById('pje-chat-input');
    const messagesContainer = document.getElementById('pje-chat-messages');
    const texto = input.value.trim();
    
    if (!texto) return;
    
    console.log('📝 Enviando mensagem:', texto);
    
    // Adicionar mensagem do usuário
    const userMessage = document.createElement('div');
    userMessage.className = 'chat-message user';
    userMessage.innerHTML = `
      <div class="message-bubble user">${texto}</div>
      <div class="message-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
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
    const messagesContainer = document.getElementById('pje-chat-messages');
    
    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'typing-indicator';
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = `
      Digitando
      <div class="typing-dots">
        <span></span>
        <span></span>
        <span></span>
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
    const messagesContainer = document.getElementById('pje-chat-messages');
    
    const assistantMessage = document.createElement('div');
    assistantMessage.className = 'chat-message assistant';
    assistantMessage.innerHTML = `
      <div class="message-bubble assistant">${resposta}</div>
      <div class="message-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    messagesContainer.appendChild(assistantMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Gerar resposta do assistente
  async function gerarResposta(pergunta) {
    const perguntaLower = pergunta.toLowerCase();
    
    // Extrair dados atualizados do processo
    const dadosProcesso = await extrairDadosDetalhados();
    
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
    observarMudancas();
    observarCliquesBarraLateral();
    
    if (isPjeSystem()) {
      console.log('✅ Sistema PJe detectado');
      setTimeout(() => {
        criarBotaoChat();
      }, 2000);
    } else {
      console.log('ℹ️ Não é sistema PJe, mas criando botão para teste');
      setTimeout(() => {
        criarBotaoChat();
      }, 1000);
    }
  }
  
  // Executar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }
  
  // Também executar após timeout para garantir
  setTimeout(inicializar, 3000);
  
  console.log('🏁 PJe Assistant carregado');
  
})();