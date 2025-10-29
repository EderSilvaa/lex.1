// LEX Agent Connector - Comunicação Extension ↔ Backend
// Gerencia WebSocket e sincronização de estado

(function() {
  'use strict';

  class LexAgentConnector {
    constructor() {
      this.ws = null;
      this.sessionId = null;
      this.connected = false;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 5;
      this.reconnectDelay = 3000;

      // Callbacks
      this.onConnected = null;
      this.onDisconnected = null;
      this.onPlanReceived = null;
      this.onExecutionProgress = null;
      this.onExecutionCompleted = null;
      this.onError = null;

      // Config
      this.backendUrl = 'ws://localhost:3000';

      // Armazenar último plano recebido
      this.lastPlan = null;

      // UI para interface visual
      this.ui = null; // Será inicializado depois que LexAgentUI carregar

      console.log('🔌 LexAgentConnector inicializado');
    }

    /**
     * Conecta ao backend
     */
    async connect() {
      if (this.connected) {
        console.log('⚠️ Já conectado ao backend');
        return;
      }

      console.log(`🔌 Conectando ao backend: ${this.backendUrl}`);

      try {
        this.ws = new WebSocket(this.backendUrl);

        this.ws.onopen = () => {
          console.log('✅ Conectado ao LEX Agent Backend');
          this.connected = true;
          this.reconnectAttempts = 0;

          if (this.onConnected) {
            this.onConnected();
          }

          // Enviar ping periódico para manter conexão viva
          this.startHeartbeat();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
          console.log('🔌 Conexão fechada');
          this.connected = false;
          this.sessionId = null;

          if (this.onDisconnected) {
            this.onDisconnected();
          }

          // Tentar reconectar
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('❌ Erro no WebSocket:', error);

          if (this.onError) {
            this.onError('Erro na conexão com o backend');
          }
        };

      } catch (error) {
        console.error('❌ Erro ao conectar:', error);

        if (this.onError) {
          this.onError('Não foi possível conectar ao backend. Certifique-se de que está rodando.');
        }
      }
    }

    /**
     * Desconecta do backend
     */
    disconnect() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.connected = false;
      this.sessionId = null;
    }

    /**
     * Tentativa de reconexão automática
     */
    attemptReconnect() {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('❌ Máximo de tentativas de reconexão atingido');
        return;
      }

      this.reconnectAttempts++;

      console.log(`🔄 Tentando reconectar (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
    }

    /**
     * Heartbeat para manter conexão viva
     */
    startHeartbeat() {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      this.heartbeatInterval = setInterval(() => {
        if (this.connected) {
          this.send('ping', {});
        }
      }, 30000); // A cada 30 segundos
    }

    /**
     * Handler de mensagens do backend
     */
    handleMessage(data) {
      try {
        const message = JSON.parse(data);
        const { type, payload } = message;

        console.log(`📨 Mensagem do backend: ${type}`);

        switch (type) {
          case 'connection_established':
            this.sessionId = message.sessionId;
            console.log(`🔑 Session ID: ${this.sessionId}`);

            // Sincronizar contexto inicial
            this.syncContext();
            break;

          case 'pong':
            // Heartbeat ok
            break;

          case 'context_updated':
            console.log('✅ Contexto sincronizado com backend');
            break;

          case 'status_update':
            console.log(`📊 Status: ${message.status} - ${message.message}`);
            break;

          case 'plan_created':
            this.lastPlan = message.plan; // Armazenar último plano
            console.log('📋 Plano de ação recebido:', message.plan);

            // Enviar para a página via postMessage
            window.postMessage({
              type: 'LEX_AGENT_PLAN_RECEIVED',
              plan: message.plan
            }, '*');

            // Mostrar modal de aprovação AUTOMATICAMENTE
            if (this.ui) {
              this.ui.showPlanForApproval(
                message.plan,
                () => {
                  // Callback de aprovação
                  this.approveAction('current');
                },
                () => {
                  // Callback de cancelamento
                  this.cancelAction('current');
                }
              );
            }

            if (this.onPlanReceived) {
              this.onPlanReceived(message.plan);
            }
            break;

          case 'execution_started':
            console.log('🚀 Execução iniciada');
            break;

          case 'execution_progress':
            console.log(`⏳ Progresso: ${message.percentage}% - ${message.stepDescription}`);

            // Atualizar progress bar no modal
            if (this.ui) {
              this.ui.updateProgress(
                message.currentStep,
                message.totalSteps,
                `🔄 ${message.stepDescription}`
              );
            }

            if (this.onExecutionProgress) {
              this.onExecutionProgress({
                currentStep: message.currentStep,
                totalSteps: message.totalSteps,
                description: message.stepDescription,
                percentage: message.percentage
              });
            }
            break;

          case 'execution_completed':
            console.log('✅ Execução concluída');

            // Mostrar resultado no modal
            if (this.ui) {
              this.ui.showExecutionResult({
                success: message.success !== false,
                message: message.message || 'Execução concluída!',
                details: message.details || null
              });
            }

            if (this.onExecutionCompleted) {
              this.onExecutionCompleted({
                success: message.success,
                message: message.message
              });
            }
            break;

          case 'action_cancelled':
            console.log('❌ Ação cancelada');
            break;

          case 'test_result':
            console.log('🧪 Resultado do teste:', message.result);

            // Enviar para a página
            window.postMessage({
              type: 'LEX_AGENT_TEST_RESULT',
              result: message.result
            }, '*');
            break;

          case 'error':
            console.error('❌ Erro do backend:', message.error);

            if (this.onError) {
              this.onError(message.error);
            }
            break;

          default:
            console.warn(`⚠️ Tipo de mensagem desconhecido: ${type}`);
        }

      } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
      }
    }

    /**
     * Envia mensagem para o backend
     */
    send(type, payload = {}) {
      if (!this.connected || !this.ws) {
        console.error('❌ Não conectado ao backend');
        return false;
      }

      try {
        const message = {
          type: type,
          payload: payload,
          timestamp: new Date().toISOString()
        };

        this.ws.send(JSON.stringify(message));
        return true;

      } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
        return false;
      }
    }

    /**
     * Sincroniza contexto atual com o backend
     */
    syncContext() {
      if (!window.lexSession) {
        console.warn('⚠️ Sessão LEX não disponível ainda');
        return;
      }

      const context = {
        processNumber: window.lexSession.processNumber,
        processInfo: window.lexSession.processInfo,
        documents: window.lexSession.processedDocuments?.map(doc => ({
          id: doc.document?.id,
          name: doc.document?.name,
          type: doc.document?.type,
          hasContent: !!doc.data?.content
        })),
        lastAnalysis: window.lexSession.lastAnalysis ? 'available' : null,
        timestamp: new Date().toISOString()
      };

      console.log('📤 Sincronizando contexto com backend...');
      this.send('update_context', context);
    }

    /**
     * Envia comando do usuário para execução
     */
    executeCommand(command) {
      console.log(`🚀 Enviando comando: "${command}"`);

      // Sincronizar contexto atualizado
      this.syncContext();

      // Capturar contexto RICO da página
      const richContext = this.getRichPageContext();

      console.log('📊 Contexto rico capturado:', {
        section: richContext?.section,
        processNumber: richContext?.process?.number,
        interactiveElements: richContext?.interactiveElements?.length,
        visibleTextLength: richContext?.visibleText?.length,
        formsCount: richContext?.forms?.length
      });

      // Enviar comando com contexto rico
      this.send('execute_command', {
        command: command,
        context: richContext || this.getCurrentContext()
      });
    }

    /**
     * Aprova execução de um plano
     */
    approveAction(planId) {
      console.log('✅ Aprovando execução do plano...');
      this.send('approve_action', { planId: planId });
    }

    /**
     * Cancela execução de um plano
     */
    cancelAction(planId) {
      console.log('❌ Cancelando plano...');
      this.send('cancel_action', { planId: planId });
    }

    /**
     * Obtém contexto atual da sessão
     */
    getCurrentContext() {
      if (!window.lexSession) return null;

      return {
        processNumber: window.lexSession.processNumber,
        processInfo: window.lexSession.processInfo,
        documentsCount: window.lexSession.processedDocuments?.length || 0,
        hasAnalysis: !!window.lexSession.lastAnalysis
      };
    }

    /**
     * Captura contexto RICO da página para enviar ao GPT-4
     * Inclui: URL, elementos interativos, texto visível, fase processual
     */
    getRichPageContext() {
      try {
        const context = {
          // 1. Informações básicas
          url: window.location.href,
          title: document.title,
          timestamp: new Date().toISOString(),

          // 2. Seção do PJe detectada
          section: this.detectPJeSection(),

          // 3. Processo atual (se disponível)
          process: {
            number: window.lexSession?.processNumber || this.extractProcessNumberFromPage(),
            info: window.lexSession?.processInfo || null
          },

          // 4. Elementos interativos visíveis
          interactiveElements: this.extractInteractiveElements(),

          // 5. Texto principal visível
          visibleText: this.extractVisibleText(),

          // 6. Formulários detectados
          forms: this.extractForms(),

          // 7. Breadcrumb/navegação
          breadcrumb: this.extractBreadcrumb()
        };

        return context;

      } catch (error) {
        console.error('❌ Erro ao capturar contexto rico:', error);
        return null;
      }
    }

    /**
     * Detecta em qual seção do PJe o usuário está
     */
    detectPJeSection() {
      const url = window.location.href;

      if (url.includes('painel-usuario')) return 'dashboard';
      if (url.includes('processo-consulta') || url.includes('Detalhe')) return 'process-detail';
      if (url.includes('listAutosDigitais')) return 'digital-docs';
      if (url.includes('peticaoIntermediaria')) return 'intermediate-petition';
      if (url.includes('peticionamento')) return 'petition';
      if (url.includes('ConsultaProcesso')) return 'process-search';
      if (url.includes('audiencia')) return 'hearing';
      if (url.includes('expediente')) return 'dispatch';

      return 'unknown';
    }

    /**
     * Extrai elementos interativos da página (botões, links, inputs)
     */
    extractInteractiveElements() {
      const elements = [];

      // Botões visíveis
      const buttons = Array.from(document.querySelectorAll('button:not([style*="display: none"]):not([style*="display:none"])'));
      buttons.slice(0, 20).forEach((btn, i) => {
        if (this.isElementVisible(btn)) {
          elements.push({
            type: 'button',
            text: btn.textContent?.trim().substring(0, 50) || '',
            id: btn.id || null,
            class: btn.className || null
          });
        }
      });

      // Links importantes
      const links = Array.from(document.querySelectorAll('a[href]:not([style*="display: none"])'));
      links.slice(0, 15).forEach((link) => {
        if (this.isElementVisible(link) && link.textContent?.trim()) {
          elements.push({
            type: 'link',
            text: link.textContent.trim().substring(0, 50),
            href: link.getAttribute('href')
          });
        }
      });

      // Inputs de formulário
      const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="file"], select, textarea'));
      inputs.slice(0, 10).forEach((input) => {
        if (this.isElementVisible(input)) {
          elements.push({
            type: input.tagName.toLowerCase(),
            inputType: input.type || 'text',
            name: input.name || null,
            id: input.id || null,
            placeholder: input.placeholder || null,
            label: this.findLabelForInput(input)
          });
        }
      });

      return elements;
    }

    /**
     * Extrai texto visível da página (resumido)
     */
    extractVisibleText() {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;

            // Ignorar scripts, styles, etc
            if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'NOSCRIPT') {
              return NodeFilter.FILTER_REJECT;
            }

            // Ignorar elementos invisíveis
            if (!this.isElementVisible(parent)) {
              return NodeFilter.FILTER_REJECT;
            }

            const text = node.textContent?.trim();
            return text && text.length > 3 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        }
      );

      const texts = [];
      let node;
      let totalLength = 0;
      const maxLength = 3000; // Limite de caracteres

      while ((node = walker.nextNode()) && totalLength < maxLength) {
        const text = node.textContent.trim();
        if (text) {
          texts.push(text);
          totalLength += text.length;
        }
      }

      return texts.join(' ').substring(0, maxLength);
    }

    /**
     * Extrai formulários da página
     */
    extractForms() {
      const forms = [];

      document.querySelectorAll('form').forEach((form) => {
        if (this.isElementVisible(form)) {
          const fields = Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
            type: field.type || field.tagName.toLowerCase(),
            name: field.name,
            id: field.id,
            required: field.required
          }));

          forms.push({
            id: form.id,
            action: form.action,
            method: form.method,
            fieldsCount: fields.length,
            fields: fields.slice(0, 10) // Limitar campos
          });
        }
      });

      return forms;
    }

    /**
     * Extrai breadcrumb/navegação
     */
    extractBreadcrumb() {
      const breadcrumbSelectors = [
        '.breadcrumb',
        '[class*="breadcrumb"]',
        'nav ol',
        '.navegacao'
      ];

      for (const selector of breadcrumbSelectors) {
        const breadcrumb = document.querySelector(selector);
        if (breadcrumb) {
          return breadcrumb.textContent.trim();
        }
      }

      return null;
    }

    /**
     * Extrai número do processo da página (fallback se lexSession não tiver)
     */
    extractProcessNumberFromPage() {
      // Tentar extrair da URL
      const urlMatch = window.location.href.match(/numeroProcesso[=:](\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
      if (urlMatch) return urlMatch[1];

      // Tentar extrair do título
      const titleMatch = document.title.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
      if (titleMatch) return titleMatch[1];

      // Tentar extrair do body
      const bodyMatch = document.body.textContent.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
      if (bodyMatch) return bodyMatch[1];

      return null;
    }

    /**
     * Verifica se elemento está visível
     */
    isElementVisible(el) {
      if (!el) return false;

      const style = window.getComputedStyle(el);

      return style.display !== 'none' &&
             style.visibility !== 'hidden' &&
             style.opacity !== '0' &&
             el.offsetWidth > 0 &&
             el.offsetHeight > 0;
    }

    /**
     * Encontra label associado a um input
     */
    findLabelForInput(input) {
      // Por atributo for
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) return label.textContent.trim();
      }

      // Label pai
      const parentLabel = input.closest('label');
      if (parentLabel) return parentLabel.textContent.trim();

      // Label anterior
      const prevLabel = input.previousElementSibling;
      if (prevLabel && prevLabel.tagName === 'LABEL') {
        return prevLabel.textContent.trim();
      }

      return null;
    }

    /**
     * Verifica se está conectado
     */
    isConnected() {
      return this.connected;
    }

    /**
     * Obtém status da conexão
     */
    getStatus() {
      return {
        connected: this.connected,
        sessionId: this.sessionId,
        reconnectAttempts: this.reconnectAttempts,
        backendUrl: this.backendUrl
      };
    }
  }

  // Criar instância global
  const connector = new LexAgentConnector();

  // Expor no window do content script
  window.lexAgentConnector = connector;

  console.log('🔧 Preparando injeção do LEX Agent no contexto da página...');

  // Injetar script externo para evitar problemas de CSP
  function injectPageScript() {
    if (!document.documentElement) {
      console.log('⏳ Aguardando documentElement...');
      setTimeout(injectPageScript, 100);
      return;
    }

    console.log('📝 Injetando lex-agent-page-bridge.js...');

    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('src/js/lex-agent-page-bridge.js');
      script.onload = function() {
        console.log('✅ LEX Agent Page Bridge carregado com sucesso');
        this.remove();
      };
      script.onerror = function() {
        console.error('❌ Erro ao carregar LEX Agent Page Bridge');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error('❌ Erro ao injetar page bridge:', error);
    }
  }

  injectPageScript();

  // Escutar mensagens da página
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'LEX_AGENT_COMMAND') {
      console.log('📨 Comando recebido via postMessage:', event.data.command);
      connector.executeCommand(event.data.command);
    } else if (event.data.type === 'LEX_AGENT_GET_STATUS') {
      const status = connector.getStatus();
      console.log('📊 Status:', status);
    } else if (event.data.type === 'LEX_AGENT_IS_CONNECTED') {
      console.log('🔍 Conectado?', connector.isConnected());
    } else if (event.data.type === 'LEX_AGENT_APPROVE_ACTION') {
      console.log('✅ Aprovação recebida via postMessage');
      connector.approveAction(event.data.planId);
    } else if (event.data.type === 'LEX_AGENT_TEST') {
      console.log('🧪 Comando de teste recebido:', event.data.action);
      connector.send('test_action', {
        action: event.data.action
      });
    } else if (event.data.type === 'LEX_AGENT_GET_RICH_CONTEXT') {
      console.log('📊 Solicitação de contexto rico recebida');
      const richContext = connector.getRichPageContext();

      console.log('\n' + '='.repeat(60));
      console.log('📊 CONTEXTO RICO DA PÁGINA');
      console.log('='.repeat(60));
      console.log('🎯 Seção:', richContext.section);
      console.log('📄 URL:', richContext.url);
      console.log('📋 Título:', richContext.title);
      console.log('🔢 Processo:', richContext.process.number || 'Não detectado');
      console.log('🔘 Elementos interativos:', richContext.interactiveElements.length);
      console.log('📝 Texto visível:', richContext.visibleText?.length, 'caracteres');
      console.log('📋 Formulários:', richContext.forms.length);
      if (richContext.breadcrumb) {
        console.log('🗺️ Breadcrumb:', richContext.breadcrumb);
      }
      console.log('\n📦 Elementos interativos:');
      richContext.interactiveElements.slice(0, 10).forEach((el, i) => {
        if (el.type === 'button') {
          console.log(`  ${i + 1}. [BOTÃO] "${el.text}"${el.id ? ` #${el.id}` : ''}`);
        } else if (el.type === 'link') {
          console.log(`  ${i + 1}. [LINK] "${el.text}"`);
        } else {
          console.log(`  ${i + 1}. [${el.type.toUpperCase()}] ${el.label || el.placeholder || el.name}`);
        }
      });
      console.log('='.repeat(60) + '\n');

      // Retornar objeto também
      console.log('📦 Objeto completo:', richContext);
    }
  });

  console.log('🌍 LEX Agent Connector configurado');
  console.log('📋 Use no console: lexAgent.executeCommand("seu comando")');

  // Inicializar UI após carregar recursos necessários
  function initializeUI() {
    // Verificar se classes estão disponíveis
    if (typeof window.LexModal !== 'undefined' && typeof window.LexAgentUI !== 'undefined') {
      connector.ui = new window.LexAgentUI();
      console.log('🎨 LEX Agent UI inicializada');
    } else {
      console.warn('⚠️ LexModal ou LexAgentUI não disponível. Interface visual desabilitada.');
    }
  }

  // Aguardar carregar LexModal e LexAgentUI
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initializeUI, 500);
    });
  } else {
    setTimeout(initializeUI, 500);
  }

  // Auto-conectar após 2 segundos (dar tempo para carregar)
  setTimeout(() => {
    console.log('🔌 Tentando conectar ao LEX Agent Backend...');
    connector.connect();
  }, 2000);

  console.log('✅ LexAgentConnector carregado');

})();
