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
        toggleLex();
        console.log('⌨️ LEX: Atalho Ctrl+M ativado');
        return false;
      }
      
      // Ctrl + ; (ponto e vírgula): Abrir LEX e analisar documento automaticamente
      if (e.ctrlKey && e.key === ';') {
        e.preventDefault();
        e.stopPropagation();
        abrirLexComAnaliseAutomatica();
        console.log('⌨️ LEX: Atalho Ctrl+; ativado - análise automática');
        return false;
      }
      
      // Alternativa: Ctrl + , (vírgula) caso ; não funcione
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        e.stopPropagation();
        abrirLexComFoco();
        console.log('⌨️ LEX: Atalho Ctrl+, ativado');
        return false;
      }
      
      // ESC: Fechar LEX (se estiver aberta)
      if (e.key === 'Escape' && chatContainer && chatContainer.classList.contains('visible')) {
        e.preventDefault();
        fecharLex();
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
      const messagesContainer = chatContainer?.querySelector('.lex-messages');
      const input = chatContainer?.querySelector('.lex-input');
      
      if (messagesContainer && input) {
        // Expandir chat para análise automática
        expandirChat();
        
        // Ir direto para mensagem de análise sem mostrar mensagem do usuário
        input.placeholder = 'Analisando documento automaticamente...';
        
        // Adicionar mensagem de análise simples
        const thinkingMessage = document.createElement('div');
        thinkingMessage.className = 'lex-message assistant';
        thinkingMessage.innerHTML = `
          <div class="lex-bubble">Analisando...</div>
        `;
        messagesContainer.appendChild(thinkingMessage);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Processar análise diretamente sem enviar mensagem visível
        processarAnaliseAutomatica(thinkingMessage);
        console.log('🚀 LEX: Análise automática iniciada');
      }
    }, 200); // Delay maior para garantir que tudo carregou
  }

  // Função para processar análise automática (versão simplificada)
  function processarAnaliseAutomatica(thinkingMessage) {
    console.log('🔍 LEX: Análise automática - usando sistema de chat existente');
    console.log('🧪 LEX: Verificando se extrairInformacoesCompletas existe:', typeof extrairInformacoesCompletas);
    
    // Simular envio da mensagem "analisar processo" usando o sistema existente
    const perguntaAnalise = 'analisar processo';
    
    // Esconder a mensagem temporária
    if (thinkingMessage) {
      thinkingMessage.style.display = 'none';
    }
    
    // Usar o sistema de envio existente que já funciona perfeitamente
    setTimeout(() => {
      enviarMensagem(perguntaAnalise, true); // true = isAutomatico (não mostrar mensagem do usuário)
      console.log('✅ LEX: Análise automática delegada para sistema de chat padrão');
    }, 100);
  }

  // Função de notificação removida - popups desabilitados
  
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
    // Função removida - usando CSS externo para melhor performance
    // Os estilos agora vêm do arquivo chat-styles.css
    console.log('✅ LEX: Usando CSS externo - estilos inline desabilitados');
    return;
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
    
    // Usar classe CSS em vez de estilos inline
    botao.className = 'lex-toggle';
    
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
          <div class="lex-control-dots">
            <button class="lex-dot lex-dot-close" title="Personalização" data-action="personalization"></button>
            <button class="lex-dot lex-dot-minimize" title="Dashboard de Métricas" data-action="dashboard"></button>
            <button class="lex-dot lex-dot-maximize" title="Avançado" data-action="advanced"></button>
          </div>
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
        <button class="lex-analyze-full" title="Analisar processo completo">🔍</button>
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
    
    // Mostrar chat no estado compacto inicial
    chatContainer.classList.add('visible', 'compact');
    
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

    // Control dots
    const controlDots = chatContainer.querySelectorAll('.lex-dot');
    controlDots.forEach(dot => {
      dot.addEventListener('click', function(e) {
        e.stopPropagation();
        const action = this.dataset.action;
        handleDotAction(action);
      });
    });

    // Botão análise completa
    const analyzeButton = chatContainer.querySelector('.lex-analyze-full');
    if (analyzeButton) {
      analyzeButton.addEventListener('click', function() {
        iniciarAnaliseCompleta();
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

  // Handle dot actions
  function handleDotAction(action) {
    switch(action) {
      case 'personalization':
        openPersonalizationModal();
        break;
      case 'dashboard':
        openDashboardModal();
        break;
      case 'settings':
        adicionarMensagemAssistente('⚙️ Configurações em desenvolvimento...');
        break;
      case 'advanced':
        adicionarMensagemAssistente('🔧 Configurações avançadas em desenvolvimento...');
        break;
    }
  }

  // Open personalization modal
  function openPersonalizationModal() {
    console.log('🔴 LEX: Abrindo modal de personalização...');
    const startTime = performance.now();

    // Check if modal already exists
    let modal = document.getElementById('lex-personalization-modal');
    if (modal) {
      console.log('✅ LEX: Modal já existe, apenas mostrando');
      modal.style.display = 'flex';
      return;
    }

    console.log('🔨 LEX: Criando modal pela primeira vez...');

    // Create modal
    modal = document.createElement('div');
    modal.id = 'lex-personalization-modal';
    modal.className = 'lex-modal';

    // Show modal immediately (even before content is ready)
    modal.style.display = 'flex';
    document.body.appendChild(modal);

    modal.innerHTML = `
      <div class="lex-modal-content">
        <div class="lex-modal-header">
          <h3>Personalização</h3>
          <button class="lex-modal-close">×</button>
        </div>
        <div class="lex-modal-body">
          <div class="lex-personalization-section">
            <h4>Documentos de Exemplo</h4>
            <p class="lex-help-text">Adicione documentos para o Lex aprender com seus exemplos</p>
            <div class="lex-file-upload-area">
              <input type="file" id="lex-example-docs" multiple accept=".pdf,.doc,.docx,.txt" style="display: none;">
              <button class="lex-upload-btn" onclick="document.getElementById('lex-example-docs').click()">
                📄 Adicionar Documentos
              </button>
              <div id="lex-uploaded-files" class="lex-uploaded-files"></div>
            </div>
          </div>

          <div class="lex-personalization-section">
            <h4>Modo de Tratamento</h4>
            <p class="lex-help-text">Escolha como o Lex deve se comunicar com você</p>
            <div class="lex-treatment-modes">
              <label class="lex-radio-option">
                <input type="radio" name="treatment-mode" value="formal" checked>
                <span>Formal (você)</span>
              </label>
              <label class="lex-radio-option">
                <input type="radio" name="treatment-mode" value="informal">
                <span>Informal (tu/você amigável)</span>
              </label>
              <label class="lex-radio-option">
                <input type="radio" name="treatment-mode" value="technical">
                <span>Técnico (linguagem jurídica)</span>
              </label>
            </div>
          </div>
        </div>
        <div class="lex-modal-footer">
          <button class="lex-btn-secondary lex-modal-cancel">Cancelar</button>
          <button class="lex-btn-primary lex-modal-save">Salvar</button>
        </div>
      </div>
    `;

    // Event listeners
    const closeBtn = modal.querySelector('.lex-modal-close');
    const cancelBtn = modal.querySelector('.lex-modal-cancel');
    const saveBtn = modal.querySelector('.lex-modal-save');
    const fileInput = modal.querySelector('#lex-example-docs');

    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    cancelBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    saveBtn.addEventListener('click', () => {
      savePersonalizationSettings();
      modal.style.display = 'none';
      adicionarMensagemAssistente('✅ Configurações de personalização salvas!');
    });

    // File upload handling
    fileInput.addEventListener('change', (e) => {
      handleFileUpload(e.target.files);
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    // Load saved settings
    loadPersonalizationSettings();

    const endTime = performance.now();
    console.log(`✅ LEX: Modal criado em ${(endTime - startTime).toFixed(2)}ms`);
  }

  // Save personalization settings
  function savePersonalizationSettings() {
    const treatmentMode = document.querySelector('input[name="treatment-mode"]:checked')?.value || 'formal';

    const settings = {
      treatmentMode,
      savedAt: new Date().toISOString()
    };

    localStorage.setItem('lex_personalization', JSON.stringify(settings));
    console.log('✅ LEX: Configurações salvas:', settings);
  }

  // Load personalization settings
  function loadPersonalizationSettings() {
    const saved = localStorage.getItem('lex_personalization');
    if (!saved) return;

    try {
      const settings = JSON.parse(saved);

      // Load treatment mode
      if (settings.treatmentMode) {
        const radio = document.querySelector(`input[name="treatment-mode"][value="${settings.treatmentMode}"]`);
        if (radio) radio.checked = true;
      }
    } catch (e) {
      console.error('❌ LEX: Erro ao carregar configurações:', e);
    }
  }

  // Open dashboard modal
  function openDashboardModal() {
    console.log('📊 LEX: Abrindo dashboard de métricas...');

    // Check if modal already exists
    let modal = document.getElementById('lex-dashboard-modal');
    if (modal) {
      modal.style.display = 'flex';
      atualizarDashboard(); // Atualizar dados
      return;
    }

    // Create modal
    modal = document.createElement('div');
    modal.id = 'lex-dashboard-modal';
    modal.className = 'lex-modal';
    modal.style.display = 'flex';
    document.body.appendChild(modal);

    // Coletar estatísticas
    const stats = coletarEstatisticas();

    modal.innerHTML = `
      <div class="lex-modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
        <div class="lex-modal-header">
          <h3>📊 Dashboard de Métricas</h3>
          <button class="lex-modal-close">×</button>
        </div>
        <div class="lex-modal-body" id="lex-dashboard-body">
          ${gerarHTMLDashboard(stats)}
        </div>
      </div>
    `;

    // Close button
    const closeBtn = modal.querySelector('.lex-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }

  // Coletar estatísticas do sistema
  function coletarEstatisticas() {
    const session = window.lexSession;
    const stats = {
      // Sessão
      sessionActive: session && session.isActive(),
      processNumber: session?.processNumber || 'N/A',
      sessionAge: session?.createdAt ? Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000 / 60) : 0,

      // Documentos
      totalDocs: session?.documents?.length || 0,
      processedDocs: session?.processedDocuments?.length || 0,

      // Contexto
      hasAnalysis: !!session?.lastAnalysis,
      conversationLength: session?.conversationHistory?.length || 0,

      // Memória
      cacheSize: 0,
      modelCacheSize: 0
    };

    // Calcular tamanho do contexto
    if (session && session.processedDocuments) {
      let totalChars = 0;
      session.processedDocuments.forEach(doc => {
        if (doc.data && doc.data.texto) {
          totalChars += doc.data.texto.length;
        }
      });
      stats.totalContextChars = totalChars;
      stats.totalContextTokens = Math.ceil(totalChars / 4);
    } else {
      stats.totalContextChars = 0;
      stats.totalContextTokens = 0;
    }

    // Calcular tamanho do localStorage
    try {
      const lexSession = localStorage.getItem('lex_session');
      stats.cacheSize = lexSession ? (lexSession.length / 1024).toFixed(2) : 0;

      const modelCache = localStorage.getItem('lex_pje_models');
      stats.modelCacheSize = modelCache ? (modelCache.length / 1024).toFixed(2) : 0;
    } catch (e) {
      console.error('Erro ao calcular cache:', e);
    }

    return stats;
  }

  // Gerar HTML do dashboard
  function gerarHTMLDashboard(stats) {
    const percentTokens = ((stats.totalContextTokens / 128000) * 100).toFixed(1);
    const statusColor = stats.sessionActive ? '#4ade80' : '#ef4444';
    const statusText = stats.sessionActive ? 'Ativa' : 'Inativa';

    return `
      <div class="lex-dashboard">
        <!-- Status Geral -->
        <div class="lex-dash-section">
          <h4>🎯 Status da Sessão</h4>
          <div class="lex-dash-cards">
            <div class="lex-dash-card">
              <div class="lex-dash-label">Status</div>
              <div class="lex-dash-value" style="color: ${statusColor};">${statusText}</div>
            </div>
            <div class="lex-dash-card">
              <div class="lex-dash-label">Processo</div>
              <div class="lex-dash-value" style="font-size: 12px;">${stats.processNumber}</div>
            </div>
            <div class="lex-dash-card">
              <div class="lex-dash-label">Tempo Ativo</div>
              <div class="lex-dash-value">${stats.sessionAge} min</div>
            </div>
          </div>
        </div>

        <!-- Documentos -->
        <div class="lex-dash-section">
          <h4>📄 Documentos</h4>
          <div class="lex-dash-cards">
            <div class="lex-dash-card">
              <div class="lex-dash-label">Descobertos</div>
              <div class="lex-dash-value">${stats.totalDocs}</div>
            </div>
            <div class="lex-dash-card">
              <div class="lex-dash-label">Processados</div>
              <div class="lex-dash-value" style="color: #4ade80;">${stats.processedDocs}</div>
            </div>
            <div class="lex-dash-card">
              <div class="lex-dash-label">Taxa de Processamento</div>
              <div class="lex-dash-value">${stats.totalDocs > 0 ? Math.round((stats.processedDocs / stats.totalDocs) * 100) : 0}%</div>
            </div>
          </div>
        </div>

        <!-- Contexto & IA -->
        <div class="lex-dash-section">
          <h4>🧠 Contexto & Inteligência</h4>
          <div class="lex-dash-cards">
            <div class="lex-dash-card">
              <div class="lex-dash-label">Caracteres Armazenados</div>
              <div class="lex-dash-value">${stats.totalContextChars.toLocaleString()}</div>
            </div>
            <div class="lex-dash-card">
              <div class="lex-dash-label">Tokens Estimados</div>
              <div class="lex-dash-value">${stats.totalContextTokens.toLocaleString()}</div>
            </div>
            <div class="lex-dash-card">
              <div class="lex-dash-label">Uso GPT-4o (128K)</div>
              <div class="lex-dash-value">${percentTokens}%</div>
            </div>
          </div>

          <div class="lex-dash-progress">
            <div class="lex-dash-progress-bar" style="width: ${Math.min(percentTokens, 100)}%; background: ${percentTokens > 80 ? '#fbbf24' : '#4ade80'};"></div>
          </div>
          <div class="lex-dash-hint">Capacidade: ${stats.totalContextTokens.toLocaleString()} / 128.000 tokens</div>
        </div>

        <!-- Conversação -->
        <div class="lex-dash-section">
          <h4>💬 Histórico de Conversação</h4>
          <div class="lex-dash-cards">
            <div class="lex-dash-card">
              <div class="lex-dash-label">Mensagens</div>
              <div class="lex-dash-value">${stats.conversationLength}</div>
            </div>
            <div class="lex-dash-card">
              <div class="lex-dash-label">Análise Completa</div>
              <div class="lex-dash-value" style="color: ${stats.hasAnalysis ? '#4ade80' : '#ef4444'};">${stats.hasAnalysis ? 'Sim' : 'Não'}</div>
            </div>
          </div>
        </div>

        <!-- Armazenamento -->
        <div class="lex-dash-section">
          <h4>💾 Armazenamento Local</h4>
          <div class="lex-dash-cards">
            <div class="lex-dash-card">
              <div class="lex-dash-label">Sessão (lex_session)</div>
              <div class="lex-dash-value">${stats.cacheSize} KB</div>
            </div>
            <div class="lex-dash-card">
              <div class="lex-dash-label">Modelos (lex_pje_models)</div>
              <div class="lex-dash-value">${stats.modelCacheSize} KB</div>
            </div>
            <div class="lex-dash-card">
              <div class="lex-dash-label">Total</div>
              <div class="lex-dash-value">${(parseFloat(stats.cacheSize) + parseFloat(stats.modelCacheSize)).toFixed(2)} KB</div>
            </div>
          </div>
          <div class="lex-dash-hint">Limite do localStorage: ~5-10 MB por domínio</div>
        </div>

        <!-- Ações -->
        <div class="lex-dash-section">
          <h4>⚙️ Ações Rápidas</h4>
          <div class="lex-dash-actions">
            <button class="lex-dash-btn" onclick="window.lexSession && window.lexSession.clear(); location.reload();">
              🗑️ Limpar Sessão
            </button>
            <button class="lex-dash-btn" onclick="window.ModelCache && window.ModelCache.limparTudo(); location.reload();">
              🗑️ Limpar Modelos
            </button>
            <button class="lex-dash-btn" onclick="console.log('Sessão:', window.lexSession); console.log('Stats:', window.lexSession?.getStats());">
              🔍 Debug Console
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Atualizar dashboard
  function atualizarDashboard() {
    const dashBody = document.getElementById('lex-dashboard-body');
    if (dashBody) {
      const stats = coletarEstatisticas();
      dashBody.innerHTML = gerarHTMLDashboard(stats);
    }
  }

  // Handle file upload
  function handleFileUpload(files) {
    const filesContainer = document.getElementById('lex-uploaded-files');
    if (!filesContainer) return;

    Array.from(files).forEach(file => {
      const fileItem = document.createElement('div');
      fileItem.className = 'lex-file-item';
      fileItem.innerHTML = `
        <span class="lex-file-name">📄 ${file.name}</span>
        <span class="lex-file-size">(${(file.size / 1024).toFixed(1)} KB)</span>
        <button class="lex-file-remove" data-filename="${file.name}">×</button>
      `;

      filesContainer.appendChild(fileItem);

      // Remove button
      fileItem.querySelector('.lex-file-remove').addEventListener('click', (e) => {
        fileItem.remove();
      });
    });

    // TODO: Actually process and store the files
    console.log('📄 LEX: Arquivos adicionados:', Array.from(files).map(f => f.name));
  }

  // Adicionar informações do processo de forma discreta
  function adicionarInfoDiscreta(info) {
    const messagesContainer = chatContainer.querySelector('.lex-messages');
    const header = chatContainer.querySelector('.lex-header');
    
    if (!messagesContainer || !header) return;
    
    // Criar elemento de informações discretas para área de mensagens (expandido)
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
    
    // Criar elemento de informações compactas para o header (compacto)
    const compactInfoElement = document.createElement('div');
    compactInfoElement.className = 'lex-compact-info';
    
    let compactInfo = '';
    if (info.numeroProcesso) {
      compactInfo += `<div class="lex-compact-process">${info.numeroProcesso}</div>`;
    }
    if (info.documentoId) {
      compactInfo += `<div class="lex-compact-doc">Doc ${info.documentoId}</div>`;
    }
    
    if (compactInfo) {
      compactInfoElement.innerHTML = compactInfo;
      header.appendChild(compactInfoElement);
    }
  }

  // Expandir chat para mostrar área de mensagens
  function expandirChat() {
    if (chatContainer.classList.contains('compact')) {
      console.log('🔄 LEX: Expandindo chat para modo completo');
      chatContainer.classList.remove('compact');
      chatContainer.classList.add('expanded');
    }
  }

  // Analisar documento detalhado com IA
  async function analisarDocumentoDetalhado(documento) {
    const messagesContainer = chatContainer.querySelector('.lex-messages');

    try {
      // Obter texto completo do documento
      const textoCompleto = await window.lexSession.getDocumentText(documento.id);

      if (!textoCompleto || textoCompleto.length < 50) {
        adicionarMensagemAssistente('⚠️ Documento sem conteúdo extraído ou muito curto para análise.');
        return;
      }

      // Criar prompt para análise detalhada
      const promptDetalhado = `Analise detalhadamente este documento:

**Nome:** ${documento.name}
**ID:** ${documento.id}
**Tipo:** ${documento.type}

**Conteúdo:**
${textoCompleto.substring(0, 10000)} ${textoCompleto.length > 10000 ? '...[truncado]' : ''}

Forneça uma análise estruturada:
1. **Tipo de documento** (petição, decisão, despacho, etc)
2. **Resumo** (2-3 frases do conteúdo principal)
3. **Pontos-chave** (bullets com informações importantes)
4. **Datas mencionadas** (se houver)
5. **Valores monetários** (se houver)
6. **Conclusão ou pedido** (1 frase)`;

      // Enviar para IA
      const resposta = await gerarRespostaIA(promptDetalhado);

      // Adicionar resposta formatada
      adicionarMensagemAssistente(`📄 <strong>Análise Detalhada: ${documento.name}</strong><br><br>${resposta}`);

    } catch (error) {
      console.error('❌ Erro ao analisar documento:', error);
      adicionarMensagemAssistente('❌ Erro ao analisar documento. Tente novamente.');
    }
  }

  // Adicionar mensagem do assistente ao chat
  function adicionarMensagemAssistente(html) {
    const messagesContainer = chatContainer.querySelector('.lex-messages');

    const assistantMessage = document.createElement('div');
    assistantMessage.className = 'lex-message assistant';
    assistantMessage.innerHTML = `
      <div class="lex-bubble">${html}</div>
      <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
    `;

    messagesContainer.appendChild(assistantMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Anexar event listeners aos botões de ação dos documentos
  function anexarEventListenersDocumentos() {
    const botoes = document.querySelectorAll('.lex-doc-action');

    botoes.forEach(botao => {
      // Evitar múltiplos listeners
      if (botao.dataset.listenerAdded) return;
      botao.dataset.listenerAdded = 'true';

      botao.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const action = botao.dataset.action;
        const docId = botao.dataset.id;

        console.log(`🔘 LEX: Ação ${action} no documento ${docId}`);

        if (action === 'analisar') {
          // Buscar documento
          const documento = window.lexSession.getDocument(docId);

          if (documento) {
            // Mostrar mensagem de "analisando"
            adicionarMensagemAssistente(`🔍 <strong>Analisando documento...</strong><br><br>📄 ${documento.name}<br><br><em>Aguarde, consultando IA...</em>`);

            // Executar análise
            await analisarDocumentoDetalhado(documento);
          } else {
            adicionarMensagemAssistente(`❌ Documento ${docId} não encontrado na sessão.`);
          }
        }
      });
    });
  }

  // Processar comandos especiais
  function processarComando(texto) {
    const textoLower = texto.toLowerCase().trim();

    // Comando: /capturar ou "capturar modelo"
    if (textoLower.startsWith('/capturar')) {
      if (!window.PjeModelDetector) {
        return '⚠️ Detector de modelos não carregado. Recarregue a página.';
      }

      // Verificar se é comando específico: /capturar [número]
      const partes = texto.trim().split(' ');
      if (partes.length > 1) {
        const indice = parseInt(partes[1]) - 1; // -1 porque usuário vê 1-indexed

        const todosSelects = document.querySelectorAll('select');
        if (indice >= 0 && indice < todosSelects.length) {
          const selectEscolhido = todosSelects[indice];

          // Forçar monitoramento desse select específico
          window.PjeModelDetector.monitorarSelecaoModelo(selectEscolhido);

          return `✅ <strong>Monitorando select #${indice + 1}</strong><br><br>
📋 <strong>Select:</strong> ${selectEscolhido.name || selectEscolhido.id || 'sem nome'}<br>
📊 <strong>Opções:</strong> ${selectEscolhido.options.length}<br><br>
<strong>Próximo passo:</strong><br>
Selecione uma opção nesse dropdown que eu vou capturar automaticamente!<br><br>
💡 Aguarde 2 segundos após selecionar.`;
        } else {
          return `⚠️ Índice inválido. Use <code>/capturar [1-${todosSelects.length}]</code>`;
        }
      }

      // Forçar detecção automática
      const detectado = window.PjeModelDetector.verificarTelaPeticao();

      if (detectado) {
        return `✅ <strong>Tela de petição detectada!</strong><br><br>
Agora selecione um modelo no dropdown para que eu capture automaticamente.<br><br>
💡 Aguarde 2 segundos após selecionar.`;
      } else {
        // Debug manual - mostrar selects disponíveis
        const todosSelects = document.querySelectorAll('select');

        let debugHTML = `⚠️ <strong>Não detectei automaticamente</strong><br><br>`;
        debugHTML += `📋 <strong>Selects encontrados:</strong> ${todosSelects.length}<br><br>`;

        if (todosSelects.length > 0) {
          debugHTML += `<strong>Qual é o dropdown de modelos/tipos de documento?</strong><br><br>`;

          Array.from(todosSelects).forEach((select, i) => {
            if (select.options.length > 1) {
              const nome = select.name || select.id || 'sem nome';
              debugHTML += `${i+1}. <strong>${nome}</strong> (${select.options.length} opções)<br>`;
            }
          });

          debugHTML += `<br>💡 Digite <code>/capturar [número]</code> para monitorar um específico.<br>`;
          debugHTML += `Exemplo: <code>/capturar 1</code> para monitorar o primeiro.`;
        } else {
          debugHTML += `<em>Nenhum dropdown encontrado.<br>Navegue até "Minutar" ou "Peticionar" e tente novamente.</em>`;
        }

        return debugHTML;
      }
    }

    // Comando: /modelos ou "listar modelos"
    if (textoLower.startsWith('/modelos') || textoLower.includes('listar modelos')) {
      if (!window.ModelCache) {
        return '⚠️ Cache de modelos não carregado.';
      }

      const modelos = window.ModelCache.listarModelos();

      if (modelos.length === 0) {
        return `📋 <strong>Nenhum modelo capturado ainda</strong><br><br>
Para capturar modelos:<br><br>
1. Vá até "Nova Petição" no PJe<br>
2. Digite <code>/capturar</code> para verificar se estou detectando<br>
3. Selecione um modelo no dropdown<br>
4. Aguarde 2 segundos<br><br>
💡 Vou capturar automaticamente!`;
      }

      let html = `📚 <strong>Modelos Capturados (${modelos.length})</strong><br><br>`;

      modelos.forEach((modelo, i) => {
        html += `${i+1}. <strong>${modelo.nome}</strong><br>`;
        html += `   ID: ${modelo.id}<br>`;
        html += `   Tribunal: ${modelo.tribunal || 'N/A'}<br>`;
        html += `   Campos: ${modelo.campos?.length || 0}<br>`;
        html += `   Capturado: ${new Date(modelo.extraidoEm).toLocaleDateString()}<br><br>`;
      });

      html += `<em>💡 Use "Minuta [tipo]" para gerar uma minuta com esses modelos</em>`;

      return html;
    }

    // Comando: Minuta ou "minuta uma/de..."
    if (textoLower.startsWith('minuta') || textoLower.includes('gerar minuta') || textoLower.includes('minutar')) {
      if (!window.MinutaGenerator) {
        return '⚠️ Módulo de minutas não carregado. Recarregue a página e tente novamente.';
      }

      if (!window.lexSession || !window.lexSession.isActive()) {
        return `⚠️ <strong>Nenhum processo em contexto</strong><br><br>
Para gerar uma minuta, você precisa:<br><br>
1. <strong>Analisar um processo primeiro</strong> (Ctrl+; ou "Análise Completa")<br>
2. Depois peça: "Minuta uma contestação"<br><br>
💡 Preciso dos dados do processo para preencher a minuta!`;
      }

      // Iniciar geração assíncrona
      gerarMinutaAssistente(texto);

      return `✍️ <strong>Gerando minuta...</strong><br><br>
📋 Comando: "${texto}"<br>
🔍 Buscando modelo apropriado...<br><br>
<em>Aguarde alguns instantes...</em>`;
    }

    // Comando: /documentos ou "listar documentos"
    if (textoLower.startsWith('/documentos') || textoLower.includes('listar documentos') || textoLower.includes('quais documentos')) {
      if (!window.lexSession || !window.lexSession.isActive()) {
        return '⚠️ Nenhuma sessão ativa. Execute a "análise completa" primeiro para carregar os documentos.';
      }

      const docs = window.lexSession.processedDocuments;
      if (docs.length === 0) {
        return '📄 Nenhum documento processado ainda.';
      }

      let html = `📚 <strong>Documentos Disponíveis (${docs.length})</strong><br><br>`;
      docs.forEach((doc, i) => {
        html += `${i + 1}. <strong>${doc.name}</strong><br>`;
        html += `   ID: ${doc.id} | Páginas: ${doc.data.paginas || 'N/A'}<br>`;
        html += `   <button class="lex-doc-action" data-action="analisar" data-id="${doc.id}">🔍 Analisar</button>`;
        html += `<br><br>`;
      });

      html += '<em>💡 Clique em "🔍 Analisar" ou use /buscar [termo]</em>';

      // Adicionar event listeners após renderização
      setTimeout(() => anexarEventListenersDocumentos(), 100);

      return html;
    }

    // Comando: /analisar [ID ou nome]
    if (textoLower.startsWith('/analisar ')) {
      const identificador = texto.substring(10).trim();

      if (!window.lexSession || !window.lexSession.isActive()) {
        return '⚠️ Nenhuma sessão ativa. Execute a "análise completa" primeiro.';
      }

      // Buscar documento por ID ou nome
      let documento = window.lexSession.getDocument(identificador);

      if (!documento) {
        // Tentar buscar por nome parcial
        const resultados = window.lexSession.searchDocuments(identificador);
        if (resultados.length === 1) {
          documento = resultados[0];
        } else if (resultados.length > 1) {
          let html = `🔍 Encontrados ${resultados.length} documentos com "${identificador}":<br><br>`;
          resultados.forEach((doc, i) => {
            html += `${i + 1}. ${doc.name} (ID: ${doc.id})<br>`;
          });
          html += '<br><em>Use /analisar [ID] para especificar qual analisar</em>';
          return html;
        } else {
          return `❌ Documento não encontrado: "${identificador}"<br><br><em>Use /documentos para ver a lista completa</em>`;
        }
      }

      // Iniciar análise detalhada (assíncrona)
      analisarDocumentoDetalhado(documento);

      return `🔍 <strong>Analisando documento...</strong><br><br>📄 ${documento.name}<br>ID: ${documento.id}<br><br><em>Aguarde, consultando IA...</em>`;
    }

    // Comando: /buscar [termo] ou /buscar conteudo:"termo"
    if (textoLower.startsWith('/buscar ')) {
      const termo = texto.substring(8).trim();

      if (!window.lexSession || !window.lexSession.isActive()) {
        return '⚠️ Nenhuma sessão ativa. Execute a "análise completa" primeiro.';
      }

      // Verificar se é busca no conteúdo: conteudo:"termo" ou content:"term"
      const conteudoMatch = termo.match(/(?:conteudo|content):"([^"]+)"/i);

      if (conteudoMatch) {
        // BUSCA SEMÂNTICA NO CONTEÚDO
        const termoBusca = conteudoMatch[1].toLowerCase();
        const resultados = [];

        window.lexSession.processedDocuments.forEach(doc => {
          if (doc.data.texto && doc.data.texto.toLowerCase().includes(termoBusca)) {
            // Encontrar contexto ao redor do termo
            const texto = doc.data.texto.toLowerCase();
            const index = texto.indexOf(termoBusca);
            const inicio = Math.max(0, index - 100);
            const fim = Math.min(texto.length, index + termoBusca.length + 100);
            const contexto = doc.data.texto.substring(inicio, fim);

            resultados.push({
              id: doc.id,
              name: doc.name,
              contexto: contexto,
              posicao: index
            });
          }
        });

        if (resultados.length === 0) {
          return `🔍 Nenhum documento contém "<strong>${termoBusca}</strong>" no conteúdo<br><br><em>💡 Tente termos mais simples ou use /buscar [nome] para buscar por nome de arquivo</em>`;
        }

        let html = `🔍 <strong>Busca no conteúdo: "${termoBusca}"</strong><br><br>`;
        html += `📄 Encontrado em ${resultados.length} documento(s):<br><br>`;

        resultados.forEach((resultado, i) => {
          html += `${i + 1}. <strong>${resultado.name}</strong><br>`;
          html += `   <em>...${resultado.contexto}...</em><br>`;
          html += `   <button class="lex-doc-action" data-action="analisar" data-id="${resultado.id}">🔍 Analisar</button><br><br>`;
        });

        html += '<em>💡 Clique em "🔍 Analisar" para ver documento completo</em>';

        // Anexar event listeners
        setTimeout(() => anexarEventListenersDocumentos(), 100);

        return html;
      } else {
        // BUSCA POR NOME (comportamento padrão)
        const resultados = window.lexSession.searchDocuments(termo);

        if (resultados.length === 0) {
          return `🔍 Nenhum documento encontrado com o termo "<strong>${termo}</strong>"<br><br><em>💡 Use /buscar conteudo:"termo" para buscar no conteúdo dos documentos</em>`;
        }

        let html = `🔍 <strong>Resultados para "${termo}"</strong> (${resultados.length})<br><br>`;
        resultados.forEach((doc, i) => {
          html += `${i + 1}. <strong>${doc.name}</strong> (ID: ${doc.id})<br>`;
        });

        html += '<br><em>💡 Use "/analisar [ID]" para análise detalhada ou /buscar conteudo:"termo" para buscar no conteúdo</em>';

        return html;
      }
    }

    // Comando: /sessao ou "status da sessão"
    if (textoLower.startsWith('/sessao') || textoLower.includes('status') && textoLower.includes('sessao')) {
      if (!window.lexSession || !window.lexSession.isActive()) {
        return '⚠️ <strong>Nenhuma sessão ativa</strong><br><br>Execute a "análise completa" para iniciar uma sessão com documentos.';
      }

      const stats = window.lexSession.getStats();

      return `📊 <strong>Status da Sessão</strong><br><br>
        <strong>Processo:</strong> ${stats.processNumber}<br>
        <strong>Documentos processados:</strong> ${stats.processedDocuments}/${stats.totalDocuments}<br>
        <strong>Mensagens:</strong> ${stats.conversationMessages}<br>
        <strong>Análise inicial:</strong> ${stats.hasAnalysis ? '✅ Concluída' : '⏳ Pendente'}<br><br>
        <em>💡 Use "/documentos" para ver a lista completa</em>`;
    }

    // Comando: /processo ou "informações do processo"
    if (textoLower.startsWith('/processo') || textoLower.includes('informações do processo') || textoLower.includes('dados do processo')) {
      if (!window.lexSession || !window.lexSession.isActive()) {
        return '⚠️ Nenhuma sessão ativa. Execute a "análise completa" primeiro.';
      }

      const info = window.lexSession.processInfo;

      if (!info) {
        return '⚠️ Informações do processo não disponíveis.';
      }

      return `⚖️ <strong>Informações do Processo</strong><br><br>
        <strong>Número:</strong> ${info.numeroProcesso || 'N/A'}<br>
        <strong>Tribunal:</strong> ${info.tribunal || 'N/A'}<br>
        <strong>Classe Processual:</strong> ${info.classeProcessual || 'N/A'}<br>
        <strong>Assunto:</strong> ${info.assunto || 'N/A'}<br><br>
        <strong>Partes:</strong><br>
        • Autor/Requerente: ${info.autor || 'N/A'}<br>
        • Réu/Requerido: ${info.reu || 'N/A'}<br><br>
        ${info.documentoId ? `<strong>Documento Atual:</strong> ${info.documentoId}<br><br>` : ''}
        <em>💡 Use "/documentos" para ver os documentos processados</em>`;
    }

    // Comando: /timeline - Visualização cronológica dos documentos
    if (textoLower.startsWith('/timeline') || textoLower.includes('linha do tempo')) {
      if (!window.lexSession || !window.lexSession.isActive()) {
        return '⚠️ Nenhuma sessão ativa. Execute a "análise completa" primeiro.';
      }

      const docs = window.lexSession.processedDocuments;

      if (docs.length === 0) {
        return '⚠️ Nenhum documento processado ainda.';
      }

      // Ordenar por data de processamento (proxy para data do documento)
      const docsSorted = [...docs].sort((a, b) => {
        return new Date(a.processedAt) - new Date(b.processedAt);
      });

      let html = `📅 <strong>Timeline dos Documentos</strong> (${docs.length} total)<br><br>`;

      docsSorted.forEach((doc, i) => {
        const dataProcessamento = new Date(doc.processedAt).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });

        const horaProcessamento = new Date(doc.processedAt).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        });

        // Ícone baseado no tipo de documento
        let icone = '📄';
        const nameLower = doc.name.toLowerCase();
        if (nameLower.includes('petição') || nameLower.includes('inicial')) icone = '📝';
        else if (nameLower.includes('sentença') || nameLower.includes('decisão')) icone = '⚖️';
        else if (nameLower.includes('despacho')) icone = '📋';
        else if (nameLower.includes('recurso') || nameLower.includes('apelação')) icone = '📑';
        else if (nameLower.includes('contestação')) icone = '🛡️';

        html += `<div style="border-left: 3px solid #00d4ff; padding-left: 12px; margin-bottom: 16px;">`;
        html += `  <div style="color: #888; font-size: 11px;">${dataProcessamento} ${horaProcessamento}</div>`;
        html += `  <div style="margin-top: 4px;">${icone} <strong>${doc.name}</strong></div>`;
        html += `  <div style="font-size: 11px; color: #aaa; margin-top: 4px;">`;
        html += `    ${doc.data.paginas ? doc.data.paginas + ' págs' : ''} ${doc.data.tamanho || ''}`;
        html += `  </div>`;
        html += `  <button class="lex-doc-action" data-action="analisar" data-id="${doc.id}" style="margin-top: 8px;">🔍 Analisar</button>`;
        html += `</div>`;
      });

      html += '<br><em>💡 Clique em "🔍 Analisar" para análise detalhada de cada documento</em>';

      // Anexar event listeners
      setTimeout(() => anexarEventListenersDocumentos(), 100);

      return html;
    }

    // Comando: /ajuda ou /comandos
    if (textoLower.startsWith('/ajuda') || textoLower.startsWith('/comandos') || textoLower === 'ajuda') {
      return `💡 <strong>Comandos Disponíveis</strong><br><br>
        <strong>/processo</strong> - Informações do processo (partes, classe, assunto)<br>
        <strong>/documentos</strong> - Lista todos os documentos processados<br>
        <strong>/analisar [ID]</strong> - Análise detalhada de um documento específico<br>
        <strong>/buscar [termo]</strong> - Busca documentos por nome ou ID<br>
        <strong>/buscar conteudo:"termo"</strong> - Busca no conteúdo dos documentos<br>
        <strong>/timeline</strong> - Visualização cronológica dos documentos<br>
        <strong>/sessao</strong> - Mostra status da sessão atual<br>
        <strong>/ajuda</strong> - Mostra esta mensagem<br><br>
        <strong>Perguntas em linguagem natural:</strong><br>
        • "Quem são as partes do processo?"<br>
        • "Qual a classe processual?"<br>
        • "Me mostre a petição inicial"<br>
        • "O que diz o documento X sobre Y?"<br><br>
        <em>🤖 Faça perguntas sobre o processo e documentos!</em>`;
    }

    // Não é um comando, retornar null para processar normalmente
    return null;
  }

  // Gerar resposta com contexto da sessão (se disponível)
  async function gerarRespostaComContexto(pergunta) {
    // Se há sessão ativa, incluir contexto dos documentos
    if (window.lexSession && window.lexSession.isActive()) {
      console.log('💬 LEX: Gerando resposta com contexto da sessão');

      // Adicionar pergunta ao histórico
      window.lexSession.addToHistory('user', pergunta);

      // Verificar se a pergunta menciona documentos específicos
      const perguntaLower = pergunta.toLowerCase();

      // Buscar documentos mencionados na pergunta
      const docsEncontrados = window.lexSession.searchDocuments(pergunta);

      if (docsEncontrados.length > 0) {
        console.log(`📄 LEX: ${docsEncontrados.length} documentos relevantes encontrados`);
      }

      // Gerar contexto EXPANDIDO para enviar à IA (aproveitando GPT-4o 128K tokens)
      const contextoConciso = window.lexSession.generateContextSummary({
        maxDocuments: 10,           // ✅ Dobrar documentos (vs 5 anterior)
        includeFullText: true,      // ✅ TEXTO COMPLETO dos documentos
        maxCharsPerDoc: 10000,      // ✅ 10K chars por doc (vs 500 preview)
        includeHistory: true,       // Incluir últimas 3 mensagens
        includeLastAnalysis: true,  // ✅ AGORA SIM incluir análise (5K chars)
        maxAnalysisChars: 5000      // ✅ 5K chars da análise (vs 500 anterior)
      });

      // 📊 Log de métricas de contexto
      const contextoChars = contextoConciso.length;
      const contextoTokensEstimado = Math.ceil(contextoChars / 4); // ~4 chars por token
      console.log(`📊 LEX: Contexto gerado - ${contextoChars} chars (~${contextoTokensEstimado} tokens)`);
      console.log(`📊 LEX: Uso estimado: ${(contextoTokensEstimado / 128000 * 100).toFixed(1)}% da janela GPT-4o`);

      // Montar prompt com contexto ESTRUTURADO
      const promptComContexto = `${contextoConciso}

---

**Pergunta do usuário:** ${pergunta}

**Instruções:**
- Responda de forma objetiva e direta
- Cite os documentos relevantes (nome e ID)
- Use as informações do processo (partes, classe, etc) quando pertinente
- Se a pergunta for sobre um documento específico, foque nele`;

      // Enviar para IA com contexto
      return await gerarRespostaIA(promptComContexto);
    }

    // Sem sessão, processar normalmente
    return await gerarRespostaIA(pergunta);
  }

  // Enviar mensagem
  function enviarMensagem(texto, isAutomatico = false) {
    texto = texto.trim();
    if (!texto) return;

    // Expandir chat na primeira mensagem
    expandirChat();

    const messagesContainer = chatContainer.querySelector('.lex-messages');
    const input = chatContainer.querySelector('.lex-input');

    if (!messagesContainer || !input) return;

    // Adicionar mensagem do usuário (apenas se não for automático)
    if (!isAutomatico) {
      const userMessage = document.createElement('div');
      userMessage.className = 'lex-message user';
      userMessage.innerHTML = `
        <div class="lex-bubble">${texto}</div>
        <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      `;

      messagesContainer.appendChild(userMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Limpar input
    input.value = '';

    // DETECTAR COMANDOS ESPECIAIS
    const comandoResult = processarComando(texto);
    if (comandoResult) {
      const comandoMessage = document.createElement('div');
      comandoMessage.className = 'lex-message assistant';
      comandoMessage.innerHTML = `
        <div class="lex-bubble">${comandoResult}</div>
        <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      `;
      messagesContainer.appendChild(comandoMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return;
    }

    // Mostrar indicador de "pensando"
    const thinkingMessage = document.createElement('div');
    thinkingMessage.className = 'lex-message assistant';
    thinkingMessage.innerHTML = `
      <div class="lex-bubble">Analisando...</div>
    `;
    messagesContainer.appendChild(thinkingMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Gerar resposta com IA (com contexto da sessão se disponível)
    gerarRespostaComContexto(texto).then(resposta => {
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
    console.log('📄 LEX: Iniciando processamento de PDF...');

    try {
      // Verificar se PDFProcessor está disponível
      if (!window.PDFProcessor) {
        console.warn('⚠️ LEX: PDFProcessor não disponível, usando fallback HTML');
        return await processarDocumentoHTML(url, contentType);
      }

      // Baixar PDF como blob
      console.log('📥 LEX: Baixando PDF do iframe...');
      const pdfBlob = await DocumentDetector.getDocumentBlob(url);
      console.log('✅ LEX: PDF baixado:', DocumentDetector.formatFileSize(pdfBlob.size));

      // Processar PDF com PDFProcessor
      const processor = new window.PDFProcessor();
      const resultado = await processor.extractTextFromPDF(pdfBlob, {
        maxPages: undefined, // processar todas as páginas
        combineTextItems: true,
        normalizeWhitespace: true
      });

      console.log('✅ LEX: PDF processado com sucesso');
      console.log('📊 Páginas processadas:', resultado.stats.totalPages);
      console.log('📊 Conteúdo extraído:', resultado.text.length, 'caracteres');

      return {
        url: url,
        tipo: 'PDF',
        conteudo: resultado.text,
        tamanho: resultado.text.length,
        metadata: resultado.metadata || {
          paginas: resultado.stats.totalPages,
          processedPages: resultado.stats.processedPages,
          tamanhoArquivo: pdfBlob.size
        },
        stats: {
          totalPages: resultado.stats.totalPages,
          processedPages: resultado.stats.processedPages,
          charactersExtracted: resultado.text.length,
          processingTime: resultado.stats.processingTime
        }
      };

    } catch (error) {
      console.error('❌ LEX: Erro ao processar PDF:', error);
      console.log('🔄 LEX: Tentando fallback HTML...');
      return await processarDocumentoHTML(url, contentType);
    }
  }
  
  // Processar documento de imagem com OCR
  async function processarDocumentoImagem(url, contentType) {
    console.log('🖼️ LEX: Processando documento de imagem com OCR...');

    try {
      // Verificar se Tesseract está disponível
      if (!window.Tesseract) {
        console.warn('⚠️ LEX: Tesseract.js não disponível');
        const imageBlob = await DocumentDetector.getDocumentBlob(url);
        return {
          url: url,
          tipo: 'IMAGE',
          conteudo: '[Imagem detectada - OCR não disponível]\n\nTipo: ' + contentType + '\nTamanho: ' + DocumentDetector.formatFileSize(imageBlob.size),
          tamanho: imageBlob.size,
          erro: 'tesseract_not_loaded'
        };
      }

      // Baixar imagem
      console.log('📥 LEX: Baixando imagem...');
      const imageBlob = await DocumentDetector.getDocumentBlob(url);
      console.log('✅ LEX: Imagem baixada:', DocumentDetector.formatFileSize(imageBlob.size));

      // Processar com Tesseract.js
      console.log('🔍 LEX: Iniciando OCR...');
      const { data: { text } } = await Tesseract.recognize(
        imageBlob,
        'por', // Português
        {
          logger: info => {
            if (info.status === 'recognizing text') {
              console.log(`📊 OCR Progress: ${Math.round(info.progress * 100)}%`);
            }
          }
        }
      );

      console.log('✅ LEX: OCR concluído:', text.length, 'caracteres extraídos');

      return {
        url: url,
        tipo: 'IMAGE',
        conteudo: text,
        tamanho: text.length,
        metadata: {
          tamanhoArquivo: imageBlob.size,
          contentType: contentType,
          metodoExtracao: 'tesseract_ocr'
        }
      };

    } catch (error) {
      console.error('❌ LEX: Erro ao processar imagem:', error);
      return {
        url: url,
        tipo: 'IMAGE',
        conteudo: '[Erro ao processar imagem com OCR: ' + error.message + ']',
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

  // ========== ANÁLISE COMPLETA DO PROCESSO ==========

  /**
   * Inicia análise completa do processo
   */
  async function iniciarAnaliseCompleta() {
    console.log('🔍 LEX: Iniciando análise completa do processo...');

    // Expandir chat
    expandirChat();

    const messagesContainer = chatContainer.querySelector('.lex-messages');

    // Criar modal de progresso
    const progressModal = criarModalProgresso();
    messagesContainer.appendChild(progressModal);

    // Scroll para o modal
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
      // Verificar dependências
      if (!window.ProcessAnalyzer) {
        throw new Error('ProcessAnalyzer não carregado');
      }

      // Extrair informações do processo do DOM
      const processInfo = extrairInformacoesCompletas();

      // Criar analyzer
      const analyzer = new window.ProcessAnalyzer();

      // Passar informações do processo para o analyzer (será usado no SessionContext)
      analyzer.processInfo = processInfo;

      // Registrar callbacks de progresso
      analyzer.on('progress', (progress) => {
        atualizarModalProgresso(progressModal, progress);
      });

      analyzer.on('complete', (result) => {
        finalizarModalProgresso(progressModal, result);
      });

      analyzer.on('error', (error) => {
        mostrarErroModalProgresso(progressModal, error);
      });

      // Iniciar análise
      console.log('🔍 DEBUG iniciarAnaliseCompleta: Chamando analyzer.analyze()...');
      const result = await analyzer.analyze({
        useCache: true,
        processPDFs: true,
        processImages: false,
        maxConcurrent: 3,
        batchSize: 5
      });

      console.log('🔍 DEBUG iniciarAnaliseCompleta: result recebido:', result);
      console.log('✅ LEX: Análise completa finalizada:', result);

    } catch (error) {
      console.error('❌ LEX: Erro na análise completa:', error);
      mostrarErroModalProgresso(progressModal, { error: error.message });
    }
  }

  /**
   * Cria modal de progresso
   * @returns {HTMLElement} Elemento do modal
   */
  function criarModalProgresso() {
    const modal = document.createElement('div');
    modal.className = 'lex-progress-modal';
    modal.innerHTML = `
      <div class="lex-progress-header">
        <span class="lex-progress-icon">🔄</span>
        <span class="lex-progress-title">Análise Completa do Processo</span>
      </div>
      <div class="lex-progress-body">
        <div class="lex-progress-message">Inicializando...</div>
        <div class="lex-progress-bar-container">
          <div class="lex-progress-bar" style="width: 0%"></div>
        </div>
        <div class="lex-progress-stats">
          <span class="lex-progress-current">0</span> / <span class="lex-progress-total">0</span> documentos
        </div>
      </div>
    `;

    return modal;
  }

  /**
   * Atualiza modal de progresso
   * @param {HTMLElement} modal - Elemento do modal
   * @param {Object} progress - Dados de progresso
   */
  function atualizarModalProgresso(modal, progress) {
    const messageEl = modal.querySelector('.lex-progress-message');
    const barEl = modal.querySelector('.lex-progress-bar');
    const currentEl = modal.querySelector('.lex-progress-current');
    const totalEl = modal.querySelector('.lex-progress-total');

    if (messageEl) messageEl.textContent = progress.message || 'Processando...';
    if (barEl) barEl.style.width = `${progress.percentage || 0}%`;
    if (currentEl) currentEl.textContent = progress.current || 0;
    if (totalEl) totalEl.textContent = progress.total || 0;
  }

  /**
   * Finaliza modal de progresso com resultado
   * @param {HTMLElement} modal - Elemento do modal
   * @param {Object} result - Resultado da análise
   */
  function finalizarModalProgresso(modal, result) {
    console.log('🔍 DEBUG finalizarModalProgresso: Recebeu result:', result);

    const iconEl = modal.querySelector('.lex-progress-icon');
    const messageEl = modal.querySelector('.lex-progress-message');
    const barEl = modal.querySelector('.lex-progress-bar');

    if (iconEl) iconEl.textContent = '✅';
    if (messageEl) messageEl.textContent = 'Análise concluída com sucesso!';
    if (barEl) {
      barEl.style.width = '100%';
      barEl.style.backgroundColor = '#4ade80';
    }

    // Adicionar resultado da análise
    setTimeout(() => {
      const messagesContainer = chatContainer.querySelector('.lex-messages');

      // Extrair o texto da análise (pode vir em diferentes formatos)
      console.log('🔍 DEBUG finalizarModalProgresso: result.analysis:', result.analysis);
      let analiseTexto = '';
      if (result.analysis) {
        analiseTexto = result.analysis.resumo || result.analysis.analise ||
                       result.analysis.resposta || JSON.stringify(result.analysis);
      }
      console.log('🔍 DEBUG finalizarModalProgresso: analiseTexto extraído:', analiseTexto);

      if (analiseTexto) {
        const resultMessage = document.createElement('div');
        resultMessage.className = 'lex-message assistant';
        resultMessage.innerHTML = `
          <div class="lex-bubble">
            <strong>📊 Análise Completa do Processo</strong><br><br>
            ${analiseTexto}
            <br><br>
            <em>✅ ${result.statistics.processedDocuments} documentos analisados</em>
          </div>
          <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        `;

        messagesContainer.appendChild(resultMessage);
      } else {
        // Se não houver análise, mostrar mensagem genérica
        const resultMessage = document.createElement('div');
        resultMessage.className = 'lex-message assistant';
        resultMessage.innerHTML = `
          <div class="lex-bubble">
            <strong>📊 Análise Completa do Processo</strong><br><br>
            <em>✅ ${result.statistics.processedDocuments} documentos analisados</em>
          </div>
          <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        `;

        messagesContainer.appendChild(resultMessage);
      }

      // Remover modal após 2 segundos
      setTimeout(() => {
        modal.remove();
      }, 2000);

    }, 1000);
  }

  /**
   * Mostra erro no modal de progresso
   * @param {HTMLElement} modal - Elemento do modal
   * @param {Object} errorResult - Dados do erro
   */
  function mostrarErroModalProgresso(modal, errorResult) {
    const iconEl = modal.querySelector('.lex-progress-icon');
    const messageEl = modal.querySelector('.lex-progress-message');
    const barEl = modal.querySelector('.lex-progress-bar');

    if (iconEl) iconEl.textContent = '❌';
    if (messageEl) messageEl.textContent = `Erro: ${errorResult.error || 'Erro desconhecido'}`;
    if (barEl) barEl.style.backgroundColor = '#ef4444';

    // Remover modal após 5 segundos
    setTimeout(() => {
      modal.remove();
    }, 5000);
  }

  /**
   * Gera minuta usando MinutaGenerator
   */
  async function gerarMinutaAssistente(comando) {
    try {
      console.log('✍️ LEX: Gerando minuta para:', comando);

      // Chamar MinutaGenerator
      const resultado = await window.MinutaGenerator.gerarMinuta(comando);

      if (!resultado.sucesso) {
        // Erro ou modelo não encontrado
        adicionarMensagemAssistente(resultado.mensagem);
        return;
      }

      // Sucesso - mostrar minuta
      const { minuta, modelo, metadados } = resultado;

      // Debug: Verificar se ainda tem HTML
      const temHTML = /<[^>]+>/.test(minuta);
      if (temHTML) {
        console.warn('⚠️ LEX: Minuta ainda contém HTML! Primeiros 200 chars:', minuta.substring(0, 200));
      } else {
        console.log('✅ LEX: Minuta limpa, sem HTML');
      }

      // ID único para esta minuta
      const minutaId = `minuta-${Date.now()}`;

      // Minuta minimalista
      let mensagemHTML = `<div id="${minutaId}" class="lex-minuta-content" style="background: #1a1a1a; padding: 15px; border-radius: 8px; border: 1px solid #333; max-height: 400px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; line-height: 1.6; color: #e0e0e0;">`;
      mensagemHTML += minuta.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      mensagemHTML += `</div>`;

      // Botão copiar minimalista
      mensagemHTML += `<div style="display: flex; justify-content: flex-end; margin-top: 8px;">`;
      mensagemHTML += `  <button class="lex-btn-copiar-minuta" data-minuta-id="${minutaId}">
        <span class="btn-text">copiar</span>
      </button>`;
      mensagemHTML += `</div>`;

      console.log('📝 LEX: Adicionando minuta com ID:', minutaId);

      adicionarMensagemAssistente(mensagemHTML);

      // Adicionar event listener ao botão após renderização
      setTimeout(() => {
        console.log('🔍 LEX: Procurando botão copiar...');
        const btnCopiar = document.querySelector(`[data-minuta-id="${minutaId}"]`);
        console.log('🔍 LEX: Botão encontrado?', !!btnCopiar);

        if (btnCopiar) {
          console.log('✅ LEX: Event listener adicionado ao botão copiar');
          btnCopiar.addEventListener('click', async function() {
            const minutaElement = document.getElementById(minutaId);
            const textoMinuta = minutaElement.innerText;

            try {
              await navigator.clipboard.writeText(textoMinuta);

              // Feedback visual discreto
              const btnText = this.querySelector('.btn-text');
              const originalText = btnText.textContent;
              btnText.textContent = 'copiado';
              this.style.color = 'rgba(16, 185, 129, 0.9)';
              this.style.borderColor = 'rgba(16, 185, 129, 0.5)';

              setTimeout(() => {
                btnText.textContent = originalText;
                this.style.color = '';
                this.style.borderColor = '';
              }, 1500);

              console.log('✅ Minuta copiada para área de transferência');
            } catch (erro) {
              console.error('❌ Erro ao copiar:', erro);
              alert('❌ Erro ao copiar. Tente selecionar e copiar manualmente (Ctrl+C)');
            }
          });
        }
      }, 100);

      console.log('✅ LEX: Minuta exibida com sucesso');

    } catch (erro) {
      console.error('❌ LEX: Erro ao gerar minuta:', erro);
      adicionarMensagemAssistente(`❌ <strong>Erro ao gerar minuta</strong><br><br>${erro.message || erro}`);
    }
  }


  // Iniciar
  inicializar();
  
})();