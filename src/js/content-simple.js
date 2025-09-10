// Chat Lex - Versão Completa com Design Moderno
(function() {
  'use strict';
  
  // Verificar se já foi carregado
  if (window.lexAssistantActive) {
    return;
  }
  
  window.lexAssistantActive = true;
  console.log('🚀 LEX: Extensão iniciada');
  
  // Carregar CSS do chat
  function carregarCSS() {
    // Verificar se o CSS já foi carregado
    if (document.querySelector('link[href*="chat-styles.css"]')) {
      console.log('✅ LEX: CSS já carregado');
      return Promise.resolve();
    }
    
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = chrome.runtime.getURL('styles/chat-styles.css');
      
      link.onload = () => {
        console.log('✅ LEX: CSS carregado com sucesso');
        // Aguardar um pouco mais para garantir que a fonte Michroma carregue
        setTimeout(resolve, 100);
      };
      
      link.onerror = () => {
        console.error('❌ LEX: Erro ao carregar CSS');
        resolve();
      };
      
      document.head.appendChild(link);
    });
  }
  
  // Carregar CSS imediatamente e aguardar
  carregarCSS().then(() => {
    console.log('✅ LEX: CSS e fontes prontos');
  });

  // Variáveis globais
  let chatContainer = null;
  
  // Cache de elementos DOM para otimização
  const domCache = {
    info: null,
    lastUpdate: 0
  };

  // Sistema de atalhos de teclado
  function inicializarAtalhosTeclado() {
    console.log('⌨️ LEX: Inicializando atalhos de teclado...');
    
    document.addEventListener('keydown', function(e) {
      // Ctrl + M: Abrir/fechar LEX
      if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        e.stopPropagation();
        const isVisible = chatContainer && chatContainer.classList.contains('visible');
        toggleLex();
        mostrarNotificacaoAtalho(isVisible ? 'LEX fechada' : 'LEX aberta');
        console.log('⌨️ LEX: Atalho Ctrl+M ativado');
        return false;
      }
      
      // Ctrl + ; (ponto e vírgula): Abrir LEX e analisar documento automaticamente
      if (e.ctrlKey && e.key === ';') {
        e.preventDefault();
        e.stopPropagation();
        abrirLexComAnaliseAutomatica();
        mostrarNotificacaoAtalho('LEX: Análise automática iniciada');
        console.log('⌨️ LEX: Atalho Ctrl+; ativado - análise automática');
        return false;
      }
      
      // Alternativa: Ctrl + , (vírgula) caso ; não funcione
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        e.stopPropagation();
        abrirLexComFoco();
        mostrarNotificacaoAtalho('LEX ativada com foco');
        console.log('⌨️ LEX: Atalho Ctrl+, ativado');
        return false;
      }
      
      // ESC: Fechar LEX (se estiver aberta)
      if (e.key === 'Escape' && chatContainer && chatContainer.classList.contains('visible')) {
        e.preventDefault();
        fecharLex();
        mostrarNotificacaoAtalho('LEX fechada');
        console.log('⌨️ LEX: Atalho ESC ativado');
        return false;
      }
    }, true); // Use capture para garantir precedência
    
    console.log('✅ LEX: Atalhos configurados:', {
      'Ctrl+M': 'Abrir/fechar LEX',
      'Ctrl+;': 'Análise automática do documento',
      'Ctrl+,': 'Abrir LEX com foco no input',
      'ESC': 'Fechar LEX'
    });
  }

  // Funções para controle da LEX via atalhos
  function toggleLex() {
    if (!chatContainer) {
      criarInterfaceChat();
      return;
    }
    
    if (chatContainer.classList.contains('visible')) {
      fecharLex();
    } else {
      abrirLex();
    }
  }

  function abrirLex() {
    if (!chatContainer) {
      criarInterfaceChat();
    } else {
      chatContainer.classList.add('visible');
    }
  }

  function fecharLex() {
    if (chatContainer) {
      chatContainer.classList.remove('visible');
    }
  }

  function abrirLexComFoco() {
    abrirLex();
    // Aguardar um pouco para garantir que a interface esteja visível
    setTimeout(() => {
      const input = chatContainer?.querySelector('.lex-input');
      if (input) {
        input.focus();
        input.placeholder = '✨ LEX ativada via atalho! Digite sua pergunta...';
        console.log('✅ LEX: Input focado via atalho');
        
        // Restaurar placeholder depois de 3 segundos
        setTimeout(() => {
          input.placeholder = 'Digite sua pergunta sobre o processo...';
        }, 3000);
      }
    }, 100);
  }

  function abrirLexComAnaliseAutomatica() {
    abrirLex();
    console.log('🔍 LEX: Iniciando análise automática via atalho...');
    
    // Aguardar interface carregar e disparar análise
    setTimeout(() => {
      const input = chatContainer?.querySelector('.lex-input');
      if (input) {
        // Simular digitação de comando de análise
        input.value = 'Analisar este documento automaticamente';
        input.placeholder = '🤖 Analisando documento automaticamente...';
        
        // Disparar análise automaticamente
        enviarMensagem('Analisar este documento automaticamente');
        console.log('🚀 LEX: Análise automática iniciada');
      }
    }, 200); // Delay maior para garantir que tudo carregou
  }

  // Mostrar notificação de atalho ativado
  function mostrarNotificacaoAtalho(mensagem) {
    // Criar notificação temporária
    const notificacao = document.createElement('div');
    notificacao.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 999999;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    notificacao.textContent = `⌨️ ${mensagem}`;
    
    document.body.appendChild(notificacao);
    
    // Animar entrada
    setTimeout(() => {
      notificacao.style.transform = 'translateX(0)';
    }, 10);
    
    // Remover após 2 segundos
    setTimeout(() => {
      notificacao.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notificacao.parentNode) {
          notificacao.parentNode.removeChild(notificacao);
        }
      }, 300);
    }, 2000);
  }
  
  // Criar OpenAI Client diretamente (solução robusta)
  function criarOpenAIClient() {
    if (window.openaiClient) {
      console.log('✅ LEX: OpenAI Client já existe');
      return;
    }
    
    console.log('🔧 LEX: Criando OpenAI Client integrado...');
    
    // 🚀 USANDO SUPABASE EDGE FUNCTION - SEM API KEY EXPOSTA!
    class OpenAIClient {
      constructor() {
        this.baseUrl = 'https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/OPENIA';
        this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcGF1eHp6dGZsZ214amdldm1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MTI4ODUsImV4cCI6MjA3MDE4ODg4NX0.XXJf6alnb6me4PeMCA80UmfJVUZo8VxA0BFDdFCtN1A'; // Chave pública do Supabase
        console.log('✅ LEX: OpenAI Client via Supabase criado');
      }

      async analisarDocumento(contextoProcesso, perguntaUsuario) {
        console.log('🤖 LEX: Iniciando análise com IA integrada');
        
        try {
          const prompt = this.criarPromptJuridico(contextoProcesso, perguntaUsuario);
          const response = await this.fazerRequisicao(prompt);
          console.log('✅ LEX: Resposta da OpenAI recebida');
          return response;
        } catch (error) {
          console.error('❌ LEX: Erro na análise OpenAI:', error);
          return this.respostaFallback(perguntaUsuario);
        }
      }

      criarPromptJuridico(contexto, pergunta) {
        const tipoConversa = this.detectarTipoConversa(pergunta);
        const promptBase = this.obterPromptBase(tipoConversa);
        
        const systemPrompt = `${promptBase}

CONTEXTO DO PROCESSO:
${this.formatarContexto(contexto)}

PERGUNTA: ${pergunta}

${this.obterInstrucoesEspecificas(tipoConversa)}`;

        return systemPrompt;
      }

      detectarTipoConversa(pergunta) {
        const perguntaLower = pergunta.toLowerCase();
        
        // Conversa casual/cumprimento
        if (/^(oi|olá|e aí|tudo bem|como vai)/i.test(pergunta)) {
          return 'cumprimento';
        }
        
        // Análise técnica de documento
        if (perguntaLower.includes('analisar') || perguntaLower.includes('análise')) {
          return 'analise_tecnica';
        }
        
        // Dúvida sobre prazos
        if (perguntaLower.includes('prazo') || perguntaLower.includes('quando')) {
          return 'prazos';
        }
        
        // Explicação de conceitos jurídicos
        if (perguntaLower.includes('o que é') || perguntaLower.includes('explique')) {
          return 'explicacao';
        }
        
        // Estratégia/próximos passos
        if (perguntaLower.includes('próximos passos') || perguntaLower.includes('estratégia') || perguntaLower.includes('como proceder')) {
          return 'estrategia';
        }
        
        // Conversa geral jurídica
        return 'conversa_geral';
      }

      obterPromptBase(tipo) {
        const prompts = {
          cumprimento: `Você é Lex, uma assistente jurídica amigável e acessível. Responda de forma calorosa e natural, como uma colega experiente.`,
          
          analise_tecnica: `Você é Lex, especialista em análise processual. Faça uma análise técnica mas acessível, como se estivesse explicando para um colega.`,
          
          prazos: `Você é Lex, especialista em prazos processuais. Seja precisa com datas e artigos de lei, mas mantenha um tom acessível e prático.`,
          
          explicacao: `Você é Lex, educadora jurídica. Explique conceitos de forma didática, usando exemplos práticos quando possível.`,
          
          estrategia: `Você é Lex, consultora estratégica. Apresente opções e recomendações como uma mentora experiente daria conselhos.`,
          
          conversa_geral: `Você é Lex, assistente jurídica conversacional. Responda de forma natural e útil, adaptando seu tom ao contexto da pergunta.`
        };
        
        return prompts[tipo];
      }

      obterInstrucoesEspecificas(tipo) {
        const instrucoes = {
          cumprimento: `Responda de forma amigável e pergunte como posso ajudar com o processo. Máximo 2-3 linhas.`,
          
          analise_tecnica: `Estruture sua resposta em:
• <strong>Análise:</strong> O que identifiquei no documento
• <strong>Próximos passos:</strong> O que precisa ser feito
• <strong>Observações:</strong> Pontos de atenção
Máximo 300 palavras, use HTML simples.`,
          
          prazos: `Seja específica com:
• <strong>Prazo:</strong> Data/período exato
• <strong>Fundamento:</strong> Artigo de lei aplicável  
• <strong>Consequência:</strong> O que acontece se não cumprir
• <strong>Dica:</strong> Como se organizar
Use HTML simples, máximo 250 palavras.`,
          
          explicacao: `Explique de forma didática:
• <strong>Conceito:</strong> O que significa
• <strong>Na prática:</strong> Como funciona no dia a dia
• <strong>Exemplo:</strong> Situação concreta (se aplicável)
Use linguagem acessível, máximo 300 palavras.`,
          
          estrategia: `Apresente opções estruturadas:
• <strong>Cenário atual:</strong> Situação identificada
• <strong>Opções:</strong> Caminhos possíveis
• <strong>Recomendação:</strong> Sua sugestão e por quê
Tom consultivo, máximo 300 palavras.`,
          
          conversa_geral: `Responda de forma natural e conversacional. Adapte o tom à pergunta:
- Se for dúvida: seja didática
- Se for urgente: seja direta e prática  
- Se for complexa: quebre em partes
Use HTML simples, máximo 300 palavras.`
        };
        
        return instrucoes[tipo];
      }

      formatarContexto(info) {
        let contexto = '';
        
        if (info.numeroProcesso) contexto += `Processo: ${info.numeroProcesso}\n`;
        if (info.classeProcessual) contexto += `Classe: ${info.classeProcessual}\n`;
        if (info.assunto) contexto += `Assunto: ${info.assunto}\n`;
        if (info.autor) contexto += `Autor: ${info.autor}\n`;
        if (info.reu) contexto += `Réu: ${info.reu}\n`;
        if (info.faseProcessual) contexto += `Fase: ${info.faseProcessual}\n`;
        if (info.tribunal) contexto += `Tribunal: ${info.tribunal}\n`;
        if (info.nomeDocumento) contexto += `Documento: ${info.nomeDocumento}\n`;
        if (info.tipoDocumento) contexto += `Tipo: ${info.tipoDocumento}\n`;
        if (info.dataJuntada) contexto += `Data: ${info.dataJuntada}\n`;

        if (info.conteudoDocumento) {
          contexto += `\n--- CONTEÚDO DO DOCUMENTO ---\n`;
          contexto += `Tipo de arquivo: ${info.tipoDocumento || 'Não identificado'}\n`;
          contexto += `URL: ${info.urlDocumento || 'N/A'}\n`;
          contexto += `Conteúdo:\n${info.conteudoDocumento}\n`;
          contexto += `--- FIM DO CONTEÚDO ---\n`;
        }

        return contexto || 'Informações do processo não disponíveis';
      }

      async fazerRequisicao(prompt) {
        console.log('📤 LEX: Enviando requisição para Supabase Edge Function...');

        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.supabaseKey}`,
            'apikey': this.supabaseKey
          },
          body: JSON.stringify({
            pergunta: prompt,
            contexto: 'Processo judicial via extensão Lex'
          })
        });

        console.log('📥 LEX: Status da resposta:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ LEX: Erro da Edge Function:', errorText);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.resposta) {
          return this.limparResposta(data.resposta);
        } else if (data.fallback) {
          return this.limparResposta(data.fallback);
        } else {
          throw new Error('Resposta inválida da Edge Function');
        }
      }

      limparResposta(resposta) {
        if (!resposta) return resposta;
        
        // Remove markdown malformado
        let cleaned = resposta
          .replace(/```html\s*/gi, '') 
          .replace(/```\s*/g, '')      
          .replace(/#{1,6}\s*/g, '')   
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
          .replace(/\*(.*?)\*/g, '<em>$1</em>')             
          .trim();
        
        // Melhora formatação
        cleaned = cleaned
          .replace(/\n{3,}/g, '<br><br>')    // Múltiplas quebras → 2 <br>
          .replace(/\n{2}/g, '<br><br>')     // Dupla quebra → 2 <br>
          .replace(/\n/g, '<br>')            // Quebra simples → <br>
          .replace(/<br>\s*<br>\s*<br>/g, '<br><br>') // Max 2 <br> seguidos
          .trim();
        
        return cleaned;
      }

      respostaFallback(pergunta) {
        const perguntaLower = pergunta.toLowerCase();
        
        if (perguntaLower.includes('prazo')) {
          return `⚠️ <strong>Serviço de IA temporariamente indisponível</strong><br><br>
            📅 <strong>Prazos Processuais Comuns:</strong><br>
            • Contestação: 15 dias<br>
            • Recurso de Apelação: 15 dias<br>
            • Embargos de Declaração: 5 dias<br><br>
            <em>Consulte sempre o CPC para prazos específicos.</em>`;
        }
        
        return `⚠️ <strong>Serviço de IA temporariamente indisponível</strong><br><br>
          🤖 Estou com dificuldades para processar sua pergunta no momento.<br><br>
          <em>Tente novamente em alguns instantes.</em>`;
      }

      isConfigured() {
        console.log('🔑 LEX: Verificando configuração do Supabase...');
        const configured = this.baseUrl && this.supabaseKey;
        console.log('- LEX: Resultado final:', configured);
        return configured;
      }
    }
    
    // Criar instância global
    window.openaiClient = new OpenAIClient();
    console.log('✅ LEX: OpenAI Client disponível em window.openaiClient');
  }

  // Inicialização
  function inicializar() {
    console.log('🚀 LEX: Iniciando inicialização...');
    console.log('📄 LEX: DOM readyState:', document.readyState);
    console.log('🌐 LEX: URL atual:', window.location.href);
    
    // Aguardar DOM estar pronto
    if (document.readyState === 'loading') {
      console.log('⏳ LEX: DOM ainda carregando, aguardando...');
      document.addEventListener('DOMContentLoaded', inicializar);
      return;
    }
    
    console.log('✅ LEX: DOM pronto, continuando inicialização...');
    
    // Adicionar estilos
    console.log('🎨 LEX: Adicionando estilos...');
    adicionarEstilos();
    
    // Criar OpenAI Client integrado
    console.log('🤖 LEX: Criando OpenAI Client...');
    criarOpenAIClient();
    
    // Inicializar atalhos de teclado
    inicializarAtalhosTeclado();
    
    // Aguardar um pouco para garantir que o body existe
    setTimeout(() => {
      if (document.body) {
        console.log('🔘 LEX: Criando botão do chat...');
        criarBotaoChat();
        console.log('✅ LEX: Inicialização completa!');
      } else {
        console.error('❌ LEX: document.body não existe!');
        // Tentar novamente após mais tempo
        setTimeout(() => {
          if (document.body) {
            criarBotaoChat();
          }
        }, 2000);
      }
    }, 500);
  }
  
  // Adicionar estilos
  function adicionarEstilos() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      /* Estilos completos para o chat Lex */
      .lex-chat {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 380px;
        height: 550px;
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
    console.log('🔘 LEX: Iniciando criação do botão...');
    
    // Verificar se já existe um botão
    const botaoExistente = document.querySelector('.lex-button');
    if (botaoExistente) {
      console.log('⚠️ LEX: Botão já existe, removendo...');
      botaoExistente.remove();
    }
    
    // Verificar se document.body existe
    if (!document.body) {
      console.error('❌ LEX: document.body não existe! Tentando novamente...');
      setTimeout(criarBotaoChat, 1000);
      return;
    }
    
    console.log('✅ LEX: document.body existe, criando botão...');
    
    const botao = document.createElement('button');
    botao.className = 'lex-button';
    botao.innerHTML = '▲';
    botao.title = 'Lex. - Assistente Jurídico Inteligente';
    botao.id = 'lex-chat-button';
    
    // Aplicar estilos inline para garantir visibilidade
    botao.style.cssText = `
      position: fixed !important;
      right: 20px !important;
      bottom: 20px !important;
      width: 50px !important;
      height: 50px !important;
      border-radius: 50% !important;
      background: linear-gradient(135deg, #4a1a5c 0%, #2d4a4a 100%) !important;
      color: white !important;
      border: none !important;
      cursor: pointer !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 20px !important;
      z-index: 999999 !important;
      font-family: Arial, sans-serif !important;
    `;
    
    botao.addEventListener('click', function() {
      console.log('🖱️ LEX: Botão clicado!');
      abrirChat();
    });
    
    try {
      document.body.appendChild(botao);
      console.log('✅ LEX: Botão adicionado ao DOM com sucesso!');
      console.log('📍 LEX: Posição do botão:', botao.getBoundingClientRect());
      
      // Verificar se o botão está visível
      const computedStyle = window.getComputedStyle(botao);
      console.log('👁️ LEX: Visibilidade do botão:', {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        opacity: computedStyle.opacity,
        zIndex: computedStyle.zIndex
      });
      
    } catch (error) {
      console.error('❌ LEX: Erro ao adicionar botão ao DOM:', error);
    }
    
  }
  
  // Abrir chat
  function abrirChat() {
    console.log('💬 LEX: Abrindo chat...');
    if (!chatContainer) {
      criarInterfaceChat();
    } else {
      chatContainer.classList.add('visible');
    }
  }
  
  // Criar interface do chat
  function criarInterfaceChat() {
    console.log('🎨 LEX: Criando interface do chat...');
    
    // Extrair informações completas
    const info = extrairInformacoesCompletas();
    
    // Criar container
    chatContainer = document.createElement('div');
    chatContainer.className = 'lex-chat';
    
    // Criar estrutura HTML
    chatContainer.innerHTML = `
      <div class="lex-header">
        <div class="lex-header-top">
          <div class="lex-title-area">
            <div class="lex-title">
              <span class="lex-name" style="font-family: 'Michroma', 'Courier New', monospace !important; letter-spacing: 0.5px !important;">Lex.</span>
            </div>
          </div>
          <button class="lex-close">×</button>
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
    
    // Adicionar informações discretas do processo
    adicionarInfoDiscreta(info);
    
    // Mostrar chat
    chatContainer.classList.add('visible');
    
    // Atualizar status da IA
    atualizarStatusIA();
    
    console.log('✅ LEX: Interface do chat criada com sucesso!');
  }
  
  // Atualizar status da IA no cabeçalho
  function atualizarStatusIA() {
    const statusDot = document.getElementById('lex-ia-status-dot');
    const statusText = document.getElementById('lex-ia-status-text');
    
    if (!statusDot || !statusText) return;
    
    if (window.openaiClient) {
      if (window.openaiClient.isConfigured && window.openaiClient.isConfigured()) {
        statusDot.style.backgroundColor = '#4ade80'; // Verde
        statusText.textContent = 'IA ativa';
      } else {
        statusDot.style.backgroundColor = '#fbbf24'; // Amarelo
        statusText.textContent = 'IA não configurada';
      }
    } else {
      statusDot.style.backgroundColor = '#ef4444'; // Vermelho
      statusText.textContent = 'IA não carregada';
    }
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

  // Adicionar informações do processo de forma discreta
  function adicionarInfoDiscreta(info) {
    const messagesContainer = chatContainer.querySelector('.lex-messages');
    if (!messagesContainer) return;
    
    // Criar elemento de informações discretas
    const infoElement = document.createElement('div');
    infoElement.className = 'lex-process-context';
    
    let contextInfo = '';
    if (info.numeroProcesso) {
      contextInfo += `<span class="lex-context-process">${info.numeroProcesso}</span>`;
    }
    if (info.documentoId) {
      contextInfo += `<span class="lex-context-doc">Documento ${info.documentoId}</span>`;
    }
    
    if (contextInfo) {
      infoElement.innerHTML = contextInfo;
      messagesContainer.appendChild(infoElement);
    }
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
    
    // Mostrar indicador de "pensando"
    const thinkingMessage = document.createElement('div');
    thinkingMessage.className = 'lex-message assistant';
    thinkingMessage.innerHTML = `
      <div class="lex-bubble">🤔 Analisando...</div>
    `;
    messagesContainer.appendChild(thinkingMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Gerar resposta com IA
    gerarRespostaIA(texto).then(resposta => {
      // Remover indicador de "pensando"
      messagesContainer.removeChild(thinkingMessage);
      
      // Adicionar resposta da IA
      const assistantMessage = document.createElement('div');
      assistantMessage.className = 'lex-message assistant';
      assistantMessage.innerHTML = `
        <div class="lex-bubble">${resposta}</div>
        <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      `;
      
      messagesContainer.appendChild(assistantMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }).catch(error => {
      // Remover indicador de "pensando"
      messagesContainer.removeChild(thinkingMessage);
      
      // Mostrar erro
      const errorMessage = document.createElement('div');
      errorMessage.className = 'lex-message assistant';
      errorMessage.innerHTML = `
        <div class="lex-bubble">❌ Erro ao processar sua pergunta. Tente novamente.</div>
        <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      `;
      
      messagesContainer.appendChild(errorMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  }

  // Extrair conteúdo do documento via iframe - VERSÃO MELHORADA com PDF support
  async function extrairConteudoDocumento() {
    console.log('📄 LEX: Iniciando extração melhorada de conteúdo do documento');
    
    try {
      // 1. Detectar iframe do documento
      const iframe = document.querySelector('iframe[src*="/documento/download/"], iframe[src*="/documento/"], embed[src*="/documento/"], object[data*="/documento/"]');
      
      if (!iframe) {
        console.log('⚠️ Nenhum iframe de documento encontrado');
        return null;
      }
      
      // 2. Extrair URL do documento
      const documentUrl = iframe.src || iframe.getAttribute('src') || iframe.data;
      console.log('🔗 URL do documento encontrada:', documentUrl);
      
      if (!documentUrl) {
        console.log('⚠️ URL do documento não encontrada');
        return null;
      }
      
      // 3. Detectar tipo de documento usando DocumentDetector
      console.log('🔍 LEX: Detectando tipo de documento...');
      const contentType = await DocumentDetector.getContentType(documentUrl);
      const documentType = DocumentDetector.detectDocumentType(documentUrl, contentType);
      
      console.log('📋 LEX: Tipo detectado:', documentType, '| Content-Type:', contentType);
      
      // 4. Processar baseado no tipo detectado
      switch (documentType) {
        case 'PDF':
          return await processarDocumentoPDF(documentUrl, contentType);
        
        case 'IMAGE':
          console.log('🖼️ LEX: Imagem detectada - OCR será implementado em breve');
          return await processarDocumentoImagem(documentUrl, contentType);
        
        default:
          console.log('📄 LEX: HTML/Texto - usando método atual');
          return await processarDocumentoHTML(documentUrl, contentType);
      }
      
    } catch (error) {
      console.error('❌ LEX: Erro na extração melhorada de documento:', error);
      return null;
    }
  }
  
  // Processar documento PDF usando PDFProcessor
  async function processarDocumentoPDF(url, contentType) {
    console.log('📄 LEX: Processando documento PDF...');
    
    try {
      // Verificar se PDFProcessor está disponível
      if (typeof PDFProcessor === 'undefined') {
        console.warn('⚠️ LEX: PDFProcessor não disponível, usando fallback');
        return await processarDocumentoHTML(url, contentType);
      }
      
      // Inicializar PDFProcessor
      const processor = new PDFProcessor();
      await processor.initialize();
      
      console.log('📥 LEX: Baixando PDF...');
      const pdfBlob = await DocumentDetector.getDocumentBlob(url);
      
      // Verificar se PDF está protegido por senha
      const isProtected = await processor.isPasswordProtected(pdfBlob);
      if (isProtected) {
        console.warn('🔒 LEX: PDF protegido por senha');
        return {
          url: url,
          tipo: 'PDF',
          conteudo: '[PDF protegido por senha - não foi possível extrair texto]',
          tamanho: pdfBlob.size,
          erro: 'password_protected'
        };
      }
      
      console.log('📄 LEX: Extraindo texto do PDF com OCR híbrido...');
      
      // Usar extração híbrida (PDF.js + OCR para documentos escaneados)
      const result = await processor.extractTextHybrid(pdfBlob, {
        includeMetadata: true,
        includePageNumbers: true,
        maxPages: 20, // Limitar para evitar PDFs muito grandes (OCR é mais lento)
        // Configurações OCR
        ocrFallback: true,
        minTextThreshold: 50,
        ocrQuality: 2, // Balanceado
        progressCallback: (progress) => {
          const method = progress.method || 'pdf';
          const methodLabel = method === 'ocr' ? '🖼️ OCR' : '📄 PDF';
          console.log(`📊 LEX: ${methodLabel} - ${Math.round(progress.progress)}% (página ${progress.currentPage}/${progress.totalPages})`);
        }
      });
      
      console.log('✅ LEX: PDF processado com sucesso');
      console.log('- Método usado:', result.extractionMethod || 'N/A');
      console.log('- OCR utilizado:', result.ocrUsed ? 'Sim' : 'Não');
      if (result.scannedPdfDetected) {
        console.log('- PDF escaneado detectado:', result.scannedPdfDetected);
      }
      if (result.ocrUsed && result.stats?.averageConfidence) {
        console.log('- Confiança OCR:', Math.round(result.stats.averageConfidence) + '%');
      }
      console.log('- Páginas processadas:', result.stats?.processedPages || 'N/A');
      console.log('- Caracteres extraídos:', result.stats?.totalCharacters || result.text.length);
      console.log('- Tempo de processamento:', result.stats?.processingTime || 'N/A', 'ms');
      
      // Preparar resultado
      const resultado = {
        url: url,
        tipo: 'PDF',
        conteudo: result.text,
        tamanho: pdfBlob.size,
        metadata: result.metadata || null,
        stats: result.stats || null
      };
      
      // Adicionar informações de fallback se usado
      if (result.fallback) {
        resultado.fallback = true;
        resultado.fallbackStrategy = result.fallbackStrategy;
        resultado.warning = result.warning;
        console.warn('⚠️ LEX: PDF processado com fallback:', result.fallbackStrategy);
      }
      
      return resultado;
      
    } catch (error) {
      console.error('❌ LEX: Erro ao processar PDF:', error);
      
      // Fallback para método HTML se PDF falhar completamente
      console.log('🔄 LEX: Tentando fallback para método HTML...');
      try {
        const htmlResult = await processarDocumentoHTML(url, contentType);
        if (htmlResult) {
          htmlResult.warning = 'PDF não pôde ser processado, usando conteúdo HTML alternativo';
          return htmlResult;
        }
      } catch (htmlError) {
        console.error('❌ LEX: Fallback HTML também falhou:', htmlError);
      }
      
      return {
        url: url,
        tipo: 'PDF',
        conteudo: '[Erro ao processar PDF - documento não pôde ser lido]',
        tamanho: 0,
        erro: error.message
      };
    }
  }
  
  // Processar documento de imagem (placeholder para OCR futuro)
  async function processarDocumentoImagem(url, contentType) {
    console.log('🖼️ LEX: Processando documento de imagem...');
    
    try {
      const imageBlob = await DocumentDetector.getDocumentBlob(url);
      
      // TODO: Implementar OCR com Tesseract.js na próxima fase
      console.log('📋 LEX: OCR será implementado em breve');
      
      return {
        url: url,
        tipo: 'IMAGE',
        conteudo: '[Imagem detectada - OCR será implementado em breve]\n\nTipo: ' + contentType + '\nTamanho: ' + DocumentDetector.formatFileSize(imageBlob.size),
        tamanho: imageBlob.size,
        pendente: 'ocr_implementation'
      };
      
    } catch (error) {
      console.error('❌ LEX: Erro ao processar imagem:', error);
      return {
        url: url,
        tipo: 'IMAGE',
        conteudo: '[Erro ao processar imagem]',
        tamanho: 0,
        erro: error.message
      };
    }
  }
  
  // Processar documento HTML (método atual mantido)
  async function processarDocumentoHTML(url, contentType) {
    console.log('📄 LEX: Processando documento HTML (método atual)...');
    
    try {
      // 3. Fazer requisição autenticada (método atual mantido)
      console.log('🌐 LEX: Fazendo requisição autenticada para o documento...');
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain,*/*',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        console.error('❌ LEX: Erro na requisição:', response.status, response.statusText);
        return null;
      }
      
      // 4. Obter conteúdo (método atual mantido)
      const finalContentType = response.headers.get('content-type') || contentType || '';
      console.log('📋 LEX: Tipo de conteúdo final:', finalContentType);
      
      let conteudo = '';
      
      if (finalContentType.includes('text/html') || finalContentType.includes('application/xhtml')) {
        // Documento HTML/XHTML
        const htmlContent = await response.text();
        conteudo = extrairTextoDeHTML(htmlContent);
        console.log('✅ LEX: Conteúdo HTML extraído:', conteudo.substring(0, 200) + '...');
      } else if (finalContentType.includes('text/plain')) {
        // Documento de texto
        conteudo = await response.text();
        console.log('✅ LEX: Conteúdo de texto extraído:', conteudo.substring(0, 200) + '...');
      } else {
        console.log('⚠️ LEX: Tipo de documento não suportado:', finalContentType);
        conteudo = '[Tipo de documento não suportado para extração de texto]';
      }
      
      return {
        url: url,
        tipo: 'HTML',
        conteudo: conteudo,
        tamanho: conteudo.length
      };
      
    } catch (error) {
      console.error('❌ LEX: Erro ao processar HTML:', error);
      return {
        url: url,
        tipo: 'HTML',
        conteudo: '[Erro ao processar documento HTML]',
        tamanho: 0,
        erro: error.message
      };
    }
  }
  
  // Extrair texto limpo de HTML
  function extrairTextoDeHTML(html) {
    try {
      // Criar um elemento temporário para parsing
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      
      // Remover scripts e styles
      const scripts = tempDiv.querySelectorAll('script, style, noscript');
      scripts.forEach(el => el.remove());
      
      // Extrair texto
      let texto = tempDiv.innerText || tempDiv.textContent || '';
      
      // Limpar texto
      texto = texto
        .replace(/\s+/g, ' ') // Múltiplos espaços em um
        .replace(/\n\s*\n/g, '\n') // Múltiplas quebras de linha
        .trim();
      
      return texto;
    } catch (error) {
      console.error('Erro ao extrair texto de HTML:', error);
      return html.replace(/<[^>]*>/g, ''); // Fallback: remover tags
    }
  }

  // Gerar resposta com IA
  async function gerarRespostaIA(pergunta) {
    console.log('🚀 LEX: Iniciando geração de resposta');
    console.log('❓ Pergunta recebida:', pergunta);
    
    try {
      // Extrair contexto do processo atual
      const contexto = extrairInformacoesCompletas();
      console.log('📄 Contexto extraído:', contexto);
      
      // Extrair conteúdo do documento atual
      console.log('📄 Tentando extrair conteúdo do documento...');
      const conteudoDocumento = await extrairConteudoDocumento();
      
      if (conteudoDocumento) {
        console.log('✅ Conteúdo do documento extraído com sucesso');
        console.log('📊 Tipo de documento:', conteudoDocumento.tipo);
        console.log('📊 Tamanho do conteúdo:', conteudoDocumento.tamanho, 'caracteres');
        
        // Adicionar conteúdo do documento ao contexto
        contexto.conteudoDocumento = conteudoDocumento.conteudo;
        contexto.tipoDocumento = conteudoDocumento.tipo;
        contexto.urlDocumento = conteudoDocumento.url;
        
        // Adicionar informações específicas do tipo de documento
        if (conteudoDocumento.tipo === 'PDF') {
          if (conteudoDocumento.metadata) {
            contexto.metadataDocumento = conteudoDocumento.metadata;
          }
          if (conteudoDocumento.stats) {
            contexto.statsProcessamento = conteudoDocumento.stats;
          }
          if (conteudoDocumento.fallback) {
            contexto.avisoFallback = conteudoDocumento.warning;
            console.warn('⚠️ LEX: PDF processado com fallback:', conteudoDocumento.fallbackStrategy);
          }
        }
        
        // Log adicional para diferentes tipos
        if (conteudoDocumento.tipo === 'PDF') {
          console.log('📄 LEX: PDF processado - páginas:', conteudoDocumento.stats?.processedPages || 'N/A');
        } else if (conteudoDocumento.tipo === 'IMAGE') {
          console.log('🖼️ LEX: Imagem detectada - OCR pendente');
        } else {
          console.log('📄 LEX: Documento HTML/texto processado');
        }
        
      } else {
        console.log('⚠️ Não foi possível extrair conteúdo do documento');
      }
      
      // Verificar se o cliente OpenAI está disponível e configurado
      console.log('🔍 Verificando cliente OpenAI...');
      console.log('- window.openaiClient existe:', !!window.openaiClient);
      console.log('- isConfigured():', window.openaiClient ? window.openaiClient.isConfigured() : 'N/A');
      
      if (window.openaiClient && window.openaiClient.isConfigured()) {
        console.log('✅ Usando IA para gerar resposta');
        // Usar IA para gerar resposta
        const resposta = await window.openaiClient.analisarDocumento(contexto, pergunta);
        console.log('🎯 Resposta final da IA:', resposta.substring(0, 100) + '...');
        return resposta;
      } else {
        console.log('⚠️ Cliente OpenAI não configurado, usando fallback');
        // Fallback para respostas estáticas
        return gerarRespostaFallback(pergunta);
      }
    } catch (error) {
      console.error('❌ LEX ERRO ao gerar resposta:', error);
      console.log('🔄 Usando fallback devido ao erro');
      return gerarRespostaFallback(pergunta);
    }
  }

  // Gerar resposta de fallback (versão estática)
  function gerarRespostaFallback(pergunta) {
    const perguntaLower = pergunta.toLowerCase();
    
    // Verificar status do OpenAI Client para dar feedback específico
    let statusMessage = '';
    if (!window.openaiClient) {
      statusMessage = '⚠️ <strong>IA não carregada:</strong> O sistema de inteligência artificial não foi carregado.<br>';
    } else if (!window.openaiClient.isConfigured()) {
      statusMessage = '⚠️ <strong>IA não configurada:</strong> A chave da API OpenAI não foi configurada.<br>';
    } else {
      statusMessage = '⚠️ <strong>IA temporariamente indisponível:</strong> Usando respostas de fallback.<br>';
    }
    
    if (perguntaLower.includes('analisar') || perguntaLower.includes('análise')) {
      const info = extrairInformacoesCompletas();
      return `${statusMessage}<br>🔍 <strong>Análise do Processo:</strong><br><br>
        ${info.numeroProcesso ? `<strong>Processo:</strong> ${info.numeroProcesso}<br>` : ''}
        ${info.classeProcessual ? `<strong>Classe:</strong> ${info.classeProcessual}<br>` : ''}
        ${info.assunto ? `<strong>Assunto:</strong> ${info.assunto}<br>` : ''}
        ${info.autor ? `<strong>Autor:</strong> ${info.autor}<br>` : ''}
        ${info.reu ? `<strong>Réu:</strong> ${info.reu}<br>` : ''}
        ${info.faseProcessual ? `<strong>Fase:</strong> ${info.faseProcessual}<br>` : ''}
        ${info.tribunal ? `<strong>Tribunal:</strong> ${info.tribunal}<br>` : ''}<br>
        Para análise mais detalhada, verifique as movimentações recentes e documentos juntados.`;
    }
    
    if (perguntaLower.includes('documento')) {
      const info = extrairInformacoesCompletas();
      return `📄 <strong>Documento Atual:</strong><br><br>
        ${info.documentoId ? `<strong>ID:</strong> ${info.documentoId}<br>` : ''}
        ${info.nomeDocumento ? `<strong>Nome:</strong> ${info.nomeDocumento}<br>` : ''}
        ${info.tipoDocumento ? `<strong>Tipo:</strong> ${info.tipoDocumento}<br>` : ''}
        ${info.dataJuntada ? `<strong>Data de Juntada:</strong> ${info.dataJuntada}<br>` : ''}
        ${info.autorDocumento ? `<strong>Autor:</strong> ${info.autorDocumento}<br>` : ''}<br>
        <em>Informações extraídas automaticamente do sistema.</em>`;
    }
    
    if (perguntaLower.includes('prazo')) {
      return `📅 <strong>Informações sobre Prazos:</strong><br><br>
        Os prazos processuais são fundamentais no direito brasileiro:<br><br>
        • <strong>Contestação:</strong> 15 dias (procedimento comum)<br>
        • <strong>Recurso de Apelação:</strong> 15 dias<br>
        • <strong>Embargos de Declaração:</strong> 5 dias<br>
        • <strong>Cumprimento de Sentença:</strong> 15 dias para pagamento<br><br>
        ⚠️ <em>Consulte sempre o CPC e verifique prazos específicos no processo.</em>`;
    }
    
    if (perguntaLower.includes('peticionar') || perguntaLower.includes('petição')) {
      return `📝 <strong>Guia de Peticionamento:</strong><br><br>
        <strong>Elementos essenciais de uma petição:</strong><br>
        • Endereçamento ao juízo competente<br>
        • Qualificação das partes<br>
        • Exposição dos fatos<br>
        • Fundamentação jurídica<br>
        • Pedidos claros e específicos<br>
        • Data e assinatura<br><br>
        <strong>Dicas importantes:</strong><br>
        • Use linguagem clara e objetiva<br>
        • Cite a legislação aplicável<br>
        • Junte documentos comprobatórios<br>
        • Observe os prazos processuais`;
    }
    
    if (perguntaLower.includes('ajuda') || perguntaLower.includes('comandos')) {
      return `💡 <strong>Comandos Disponíveis:</strong><br><br>
        • <strong>"analisar processo"</strong> - Análise completa do processo<br>
        • <strong>"documento atual"</strong> - Informações do documento em visualização<br>
        • <strong>"prazos"</strong> - Informações sobre prazos processuais<br>
        • <strong>"como peticionar"</strong> - Guia para elaboração de petições<br>
        • <strong>"recurso"</strong> - Informações sobre recursos<br><br>
        🤖 <em>Estou aqui para ajudar com questões jurídicas e processuais!</em>`;
    }
    
    // Resposta padrão
    return `🤖 <strong>Assistente Lex</strong><br><br>
      Olá! Não entendi sua pergunta, mas posso ajudar com:<br><br>
      <strong>Comandos disponíveis:</strong><br>
      • "analisar processo" - Análise do processo atual<br>
      • "documento atual" - Informações do documento<br>
      • "prazos" - Informações sobre prazos<br>
      • "ajuda" - Lista completa de comandos<br><br>
      <em>Digite um dos comandos acima para começar!</em>`;
  }
  
  // Extrair informações completas do processo
  function extrairInformacoesCompletas() {
    // Usar cache se disponível e recente
    if (domCache.info && domCache.lastUpdate && (Date.now() - domCache.lastUpdate) < 30000) {
      return domCache.info;
    }
    
    const info = {};
    
    try {
      const texto = document.body.innerText;
      
      // 1. Extrair número do processo
      const numeroMatch = texto.match(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4})/);
      if (numeroMatch) {
        info.numeroProcesso = numeroMatch[0];
      }
      
      // 2. Extrair classe processual
      const classeMatch = texto.match(/Classe:\s*([^\n]+)/i) ||
                         texto.match(/Classe Judicial:\s*([^\n]+)/i);
      if (classeMatch) {
        info.classeProcessual = classeMatch[1].trim();
      }
      
      // 3. Extrair partes
      const autorMatch = texto.match(/Autor:\s*([^\n]+)/i) ||
                        texto.match(/Requerente:\s*([^\n]+)/i);
      if (autorMatch) {
        info.autor = autorMatch[1].trim();
      }
      
      const reuMatch = texto.match(/Réu:\s*([^\n]+)/i) ||
                      texto.match(/Requerido:\s*([^\n]+)/i);
      if (reuMatch) {
        info.reu = reuMatch[1].trim();
      }
      
      // 4. Extrair ID do documento
      const embeds = document.querySelectorAll('embed, iframe');
      for (let embed of embeds) {
        const src = embed.src || embed.getAttribute('src');
        if (src && src.includes('documento')) {
          const docIdMatch = src.match(/\/documento\/download\/(\d+)/);
          if (docIdMatch) {
            info.documentoId = docIdMatch[1];
            break;
          }
        }
      }
      
      // 5. Extrair assunto
      const assuntoMatch = texto.match(/Assunto:\s*([^\n]+)/i);
      if (assuntoMatch) {
        info.assunto = assuntoMatch[1].trim();
      }
      
      // 6. Identificar tribunal
      const url = window.location.href;
      if (url.includes('tjsp')) {
        info.tribunal = 'TJSP';
      } else if (url.includes('tjpa')) {
        info.tribunal = 'TJPA';
      } else if (url.includes('pje.jus.br')) {
        info.tribunal = 'PJe Nacional';
      }
      
      // Atualizar cache
      domCache.info = info;
      domCache.lastUpdate = Date.now();
      
    } catch (error) {
      console.log('Erro na extração de informações:', error);
    }
    
    return info;
  }
  
  
  // Iniciar
  inicializar();
  
})();