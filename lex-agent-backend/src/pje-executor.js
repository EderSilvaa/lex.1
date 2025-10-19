// PJE Executor - Controla ações no PJe usando Playwright
const { chromium } = require('playwright');

class PJeExecutor {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.connected = false;
    this.userDataDir = './browser-data'; // Persistir sessão do usuário
  }

  /**
   * Inicializa o navegador e conecta à sessão existente
   */
  async initialize() {
    console.log('🌐 Inicializando PJe Executor...');

    try {
      // Conectar ao navegador existente em modo debug
      // Usuário precisa abrir Chrome com: chrome.exe --remote-debugging-port=9222
      this.browser = await chromium.connectOverCDP('http://localhost:9222');

      console.log('✅ Conectado ao navegador existente');

      // Usar o contexto padrão (onde o usuário já está logado)
      const contexts = this.browser.contexts();
      this.context = contexts[0];

      // Pegar a página ativa do PJe
      const pages = this.context.pages();
      this.page = pages.find(p => p.url().includes('pje.tjpa.jus.br')) || pages[0];

      console.log(`📄 Página ativa: ${this.page.url()}`);

      this.connected = true;
      return true;

    } catch (error) {
      console.error('❌ Erro ao conectar ao navegador:', error.message);
      console.log('💡 Dica: Abra o Chrome com: chrome.exe --remote-debugging-port=9222');
      return false;
    }
  }

  /**
   * Executa uma ação no PJe
   */
  async executeAction(action) {
    if (!this.connected) {
      throw new Error('Navegador não conectado. Execute initialize() primeiro.');
    }

    console.log(`🎯 Executando ação: ${action.type}`);

    try {
      switch (action.type) {
        case 'navigate':
          return await this.navigate(action.url);

        case 'click':
          return await this.click(action.selector);

        case 'fill':
          return await this.fill(action.selector, action.value);

        case 'select':
          return await this.select(action.selector, action.value);

        case 'upload':
          return await this.upload(action.selector, action.filePath);

        case 'wait':
          return await this.wait(action.milliseconds);

        case 'waitForSelector':
          return await this.waitForSelector(action.selector);

        case 'getText':
          return await this.getText(action.selector);

        case 'screenshot':
          return await this.screenshot(action.path);

        default:
          throw new Error(`Tipo de ação desconhecido: ${action.type}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao executar ação ${action.type}:`, error.message);
      throw error;
    }
  }

  /**
   * Navega para uma URL
   */
  async navigate(url) {
    console.log(`🔗 Navegando para: ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    return { success: true, url: this.page.url() };
  }

  /**
   * Clica em um elemento
   */
  async click(selector) {
    console.log(`👆 Clicando em: ${selector}`);
    await this.page.click(selector);
    return { success: true, selector };
  }

  /**
   * Preenche um campo de texto
   */
  async fill(selector, value) {
    console.log(`✍️ Preenchendo "${selector}" com: ${value}`);
    await this.page.fill(selector, value);
    return { success: true, selector, value };
  }

  /**
   * Seleciona uma opção em um select
   */
  async select(selector, value) {
    console.log(`📋 Selecionando "${value}" em: ${selector}`);
    await this.page.selectOption(selector, value);
    return { success: true, selector, value };
  }

  /**
   * Faz upload de arquivo
   */
  async upload(selector, filePath) {
    console.log(`📤 Upload de arquivo em "${selector}": ${filePath}`);
    await this.page.setInputFiles(selector, filePath);
    return { success: true, selector, filePath };
  }

  /**
   * Aguarda um tempo
   */
  async wait(milliseconds) {
    console.log(`⏳ Aguardando ${milliseconds}ms...`);
    await this.page.waitForTimeout(milliseconds);
    return { success: true, milliseconds };
  }

  /**
   * Aguarda um elemento aparecer
   */
  async waitForSelector(selector, timeout = 30000) {
    console.log(`⏳ Aguardando elemento: ${selector}`);
    await this.page.waitForSelector(selector, { timeout });
    return { success: true, selector };
  }

  /**
   * Obtém texto de um elemento
   */
  async getText(selector) {
    console.log(`📖 Obtendo texto de: ${selector}`);
    const text = await this.page.textContent(selector);
    return { success: true, selector, text };
  }

  /**
   * Tira screenshot
   */
  async screenshot(path) {
    console.log(`📸 Screenshot: ${path}`);
    await this.page.screenshot({ path, fullPage: true });
    return { success: true, path };
  }

  /**
   * Executa JavaScript customizado na página
   */
  async evaluateScript(script) {
    console.log(`🔧 Executando script customizado...`);
    const result = await this.page.evaluate(script);
    return { success: true, result };
  }

  /**
   * Obtém contexto da página atual
   */
  async getPageContext() {
    console.log('📊 Coletando contexto da página...');

    const context = await this.page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        processNumber: window.lexSession?.processNumber || null,
        processInfo: window.lexSession?.processInfo || null,
        // Detectar em qual seção do PJe está
        section: (() => {
          if (location.href.includes('painel-usuario')) return 'dashboard';
          if (location.href.includes('processo-consulta')) return 'process-view';
          if (location.href.includes('processo-criar-novo')) return 'new-process';
          if (location.href.includes('intimacao')) return 'intimations';
          return 'unknown';
        })()
      };
    });

    return context;
  }

  /**
   * Desconecta do navegador
   */
  async disconnect() {
    console.log('👋 Desconectando do navegador...');
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.connected = false;
    }
  }
}

module.exports = PJeExecutor;
