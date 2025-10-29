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
    if (action.visualDescription) {
      console.log(`👁️ Descrição visual: ${action.visualDescription}`);
    }

    try {
      switch (action.type) {
        case 'navigate':
          return await this.navigate(action.url);

        case 'click':
          return await this.clickVisual(action.selector, action.visualDescription, action.description);

        case 'fill':
          return await this.fillVisual(action.selector, action.value, action.visualDescription, action.description);

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
   * Clica em um elemento (versão antiga - mantida para compatibilidade)
   */
  async click(selector) {
    console.log(`👆 Clicando em: ${selector}`);
    await this.page.click(selector);
    return { success: true, selector };
  }

  /**
   * Clica em um elemento usando múltiplas estratégias (VISUAL FIRST!)
   */
  async clickVisual(selector, visualDescription, textDescription) {
    console.log(`👆 Clicando com estratégia visual...`);

    // Estratégia 1: Tentar CSS selector se fornecido
    if (selector) {
      try {
        console.log(`  🎯 Tentando selector CSS: ${selector}`);
        await this.page.click(selector, { timeout: 5000 });
        console.log(`  ✅ Sucesso com selector CSS`);
        return { success: true, selector, strategy: 'css' };
      } catch (error) {
        console.log(`  ⚠️ Selector CSS falhou: ${error.message}`);
      }
    }

    // Estratégia 2: Tentar localizar por texto visível
    if (textDescription) {
      try {
        console.log(`  🔍 Tentando localizar por texto: "${textDescription}"`);
        const textParts = textDescription.toLowerCase().match(/["']([^"']+)["']|botão\s+(\w+)|link\s+(\w+)/i);
        if (textParts) {
          const searchText = textParts[1] || textParts[2] || textParts[3];
          console.log(`  🔍 Buscando elemento com texto: "${searchText}"`);

          // Tentar várias estratégias de texto
          const strategies = [
            `text="${searchText}"`,
            `text=${searchText}`,
            `button:has-text("${searchText}")`,
            `a:has-text("${searchText}")`,
            `[value="${searchText}"]`,
            `[title*="${searchText}" i]`,
            `[placeholder*="${searchText}" i]`
          ];

          for (const strategy of strategies) {
            try {
              await this.page.click(strategy, { timeout: 3000 });
              console.log(`  ✅ Sucesso com estratégia: ${strategy}`);
              return { success: true, strategy: 'text', locator: strategy };
            } catch (e) {
              // Continuar tentando
            }
          }
        }
      } catch (error) {
        console.log(`  ⚠️ Localização por texto falhou: ${error.message}`);
      }
    }

    // Estratégia 3: Usar descrição visual para encontrar por atributos comuns
    if (visualDescription) {
      try {
        console.log(`  👁️ Usando descrição visual: "${visualDescription}"`);

        // Extrair palavras-chave da descrição visual
        const keywords = visualDescription.toLowerCase().match(/\b(pesquis\w+|consult\w+|enviar|salvar|buscar|filtrar|abrir|fechar)\b/gi);

        if (keywords && keywords.length > 0) {
          for (const keyword of keywords) {
            const visualStrategies = [
              `button:has-text("${keyword}")`,
              `input[name*="${keyword}" i]`,
              `[id*="${keyword}" i]`,
              `[class*="${keyword}" i]`,
              `a:has-text("${keyword}")`
            ];

            for (const strategy of visualStrategies) {
              try {
                await this.page.click(strategy, { timeout: 2000 });
                console.log(`  ✅ Sucesso com palavra-chave visual: ${keyword}`);
                return { success: true, strategy: 'visual-keyword', keyword };
              } catch (e) {
                // Continuar
              }
            }
          }
        }
      } catch (error) {
        console.log(`  ⚠️ Estratégia visual falhou: ${error.message}`);
      }
    }

    // Estratégia 4: Tentar botões comuns de pesquisa/busca
    try {
      console.log(`  🔍 Tentando botões comuns de pesquisa...`);
      const searchButtonStrategies = [
        'button[type="submit"]:visible',
        'button:has-text("Pesquisar"):visible',
        'button:has-text("Buscar"):visible',
        'input[type="submit"]:visible',
        '[class*="search" i]:visible:first',
        '[class*="busca" i]:visible:first',
        '[id*="search" i]:visible:first',
        '[id*="busca" i]:visible:first'
      ];

      for (const strategy of searchButtonStrategies) {
        try {
          await this.page.click(strategy, { timeout: 2000 });
          console.log(`  ✅ Sucesso com botão de pesquisa: ${strategy}`);
          return { success: true, strategy: 'search-button' };
        } catch (e) {
          // Continuar
        }
      }
    } catch (error) {
      console.log(`  ⚠️ Botões de pesquisa falharam: ${error.message}`);
    }

    // Estratégia 5: Tentar primeiro botão visível na página
    try {
      console.log(`  🔍 Tentando primeiro botão visível...`);
      const firstButton = await this.page.locator('button:visible').first();
      await firstButton.click({ timeout: 3000 });
      console.log(`  ✅ Sucesso com primeiro botão visível`);
      return { success: true, strategy: 'first-visible-button' };
    } catch (error) {
      console.log(`  ⚠️ Primeiro botão visível falhou: ${error.message}`);
    }

    throw new Error(`Não foi possível clicar no elemento. Tentei: CSS selector, texto, descrição visual, botões de pesquisa, e primeiro botão visível.`);
  }

  /**
   * Preenche um campo de texto (versão antiga - mantida para compatibilidade)
   */
  async fill(selector, value) {
    console.log(`✍️ Preenchendo "${selector}" com: ${value}`);
    await this.page.fill(selector, value);
    return { success: true, selector, value };
  }

  /**
   * Preenche um campo usando múltiplas estratégias (VISUAL FIRST!)
   */
  async fillVisual(selector, value, visualDescription, textDescription) {
    console.log(`✍️ Preenchendo campo com estratégia visual...`);
    console.log(`   Valor: "${value}"`);

    // Estratégia 1: Tentar CSS selector se fornecido
    if (selector) {
      try {
        console.log(`  🎯 Tentando selector CSS: ${selector}`);
        await this.page.fill(selector, value, { timeout: 5000 });
        console.log(`  ✅ Sucesso com selector CSS`);
        return { success: true, selector, value, strategy: 'css' };
      } catch (error) {
        console.log(`  ⚠️ Selector CSS falhou: ${error.message}`);
      }
    }

    // Estratégia 2: Tentar localizar por placeholder
    if (textDescription) {
      try {
        const placeholderMatch = textDescription.match(/placeholder\s+["']([^"']+)["']/i);
        if (placeholderMatch) {
          const placeholder = placeholderMatch[1];
          console.log(`  🔍 Tentando por placeholder: "${placeholder}"`);
          await this.page.fill(`[placeholder*="${placeholder}" i]`, value, { timeout: 3000 });
          console.log(`  ✅ Sucesso com placeholder`);
          return { success: true, strategy: 'placeholder', value };
        }
      } catch (error) {
        console.log(`  ⚠️ Placeholder falhou: ${error.message}`);
      }
    }

    // Estratégia 3: Tentar localizar por label associado
    if (textDescription || visualDescription) {
      try {
        const description = textDescription || visualDescription;
        const labelMatch = description.match(/campo\s+["']?([^"']+)["']?|input\s+["']?([^"']+)["']?/i);

        if (labelMatch) {
          const labelText = labelMatch[1] || labelMatch[2];
          console.log(`  🏷️ Tentando localizar por label: "${labelText}"`);

          // Tentar localizar input associado ao label
          const labelStrategies = [
            `input[aria-label*="${labelText}" i]`,
            `input[title*="${labelText}" i]`,
            `input[name*="${labelText}" i]`,
            `textarea[name*="${labelText}" i]`
          ];

          for (const strategy of labelStrategies) {
            try {
              await this.page.fill(strategy, value, { timeout: 2000 });
              console.log(`  ✅ Sucesso com label: ${strategy}`);
              return { success: true, strategy: 'label', value };
            } catch (e) {
              // Continuar
            }
          }
        }
      } catch (error) {
        console.log(`  ⚠️ Label falhou: ${error.message}`);
      }
    }

    // Estratégia 4: Tentar primeiro input/textarea visível na página
    try {
      console.log(`  🔍 Tentando primeiro campo visível...`);
      const firstInput = await this.page.locator('input:visible, textarea:visible').first();
      await firstInput.fill(value, { timeout: 3000 });
      console.log(`  ✅ Sucesso com primeiro campo visível`);
      return { success: true, strategy: 'first-visible', value };
    } catch (error) {
      console.log(`  ⚠️ Primeiro campo visível falhou: ${error.message}`);
    }

    throw new Error(`Não foi possível preencher o campo. Tentei: CSS selector, placeholder, label, e primeiro campo visível.`);
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
   * Tira screenshot e retorna como base64 para enviar ao GPT-4 Vision
   */
  async screenshotBase64() {
    console.log('📸 Capturando screenshot para análise visual...');
    const screenshot = await this.page.screenshot({
      type: 'png',
      fullPage: false // Apenas viewport visível para economizar tokens
    });
    const base64 = screenshot.toString('base64');
    console.log(`✅ Screenshot capturado: ${Math.round(base64.length / 1024)}KB`);
    return base64;
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
