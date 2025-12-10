# Fase 4: BrowserView PJe

**Duração estimada:** 2 dias (16 horas)
**Esforço:** Médio-Alto
**Status:** ⏳ Pendente

---

## Objetivos

✅ Criar BrowserView embutido para PJe
✅ Implementar gestão de cookies e sessão
✅ Integrar Playwright para automação
✅ Testar extração de dados do DOM
✅ Sincronizar com ChatController

---

## Sub-tarefas Detalhadas

### 4.1 Criar PJe Manager (3 horas)

**Criar `src/main/pje-manager.js`:**

```javascript
const { BrowserView, session } = require('electron');

class PJeManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.pjeView = null;
    this.initialized = false;
    this.currentUrl = null;
  }

  async initialize() {
    console.log('🌐 Inicializando PJe BrowserView...');

    // Criar BrowserView
    this.pjeView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        javascript: true,
        images: true,
        webSecurity: true
      }
    });

    // Adicionar à janela principal
    this.mainWindow.setBrowserView(this.pjeView);

    // Configurar bounds (metade direita da tela)
    const { width, height } = this.mainWindow.getBounds();
    this.pjeView.setBounds({
      x: Math.floor(width / 2),
      y: 60,  // Header do app
      width: Math.floor(width / 2),
      height: height - 60
    });

    // Configurar auto-resize
    this.pjeView.setAutoResize({
      width: true,
      height: true
    });

    // Listeners
    this.setupEventListeners();

    this.initialized = true;
    console.log('✅ PJe BrowserView inicializado');

    return true;
  }

  setupEventListeners() {
    const webContents = this.pjeView.webContents;

    // Navegação
    webContents.on('did-start-loading', () => {
      console.log('🔄 Carregando página...');
      this.mainWindow.webContents.send('pje-loading', true);
    });

    webContents.on('did-finish-load', () => {
      this.currentUrl = webContents.getURL();
      console.log('✅ Página carregada:', this.currentUrl);
      this.mainWindow.webContents.send('pje-loading', false);
      this.mainWindow.webContents.send('pje-url-changed', this.currentUrl);
    });

    // Erros
    webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('❌ Erro ao carregar:', errorDescription);
    });

    // Console da página (debug)
    webContents.on('console-message', (event, level, message) => {
      console.log(`[PJe Console] ${message}`);
    });
  }

  async navigateTo(url) {
    if (!this.pjeView) {
      throw new Error('PJe BrowserView não inicializado');
    }

    console.log(`🧭 Navegando para: ${url}`);
    await this.pjeView.webContents.loadURL(url);
  }

  async executeScript(script) {
    if (!this.pjeView) {
      throw new Error('PJe BrowserView não inicializado');
    }

    return await this.pjeView.webContents.executeJavaScript(script);
  }

  async getPageData() {
    // Extrair dados da página atual
    return await this.executeScript(`
      ({
        url: window.location.href,
        title: document.title,
        processNumber: document.querySelector('.processo-numero')?.textContent?.trim(),
        // Adicionar mais seletores conforme necessário
      })
    `);
  }

  async screenshot() {
    if (!this.pjeView) {
      throw new Error('PJe BrowserView não inicializado');
    }

    const image = await this.pjeView.webContents.capturePage();
    return image.toDataURL();
  }

  // Gestão de cookies
  async getCookies() {
    const cookies = await session.defaultSession.cookies.get({ url: 'https://pje.tjpa.jus.br' });
    return cookies;
  }

  async clearCookies() {
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'cachestorage']
    });
    console.log('🧹 Cookies limpos');
  }

  hide() {
    if (this.pjeView) {
      this.mainWindow.removeBrowserView(this.pjeView);
    }
  }

  show() {
    if (this.pjeView) {
      this.mainWindow.setBrowserView(this.pjeView);
    }
  }

  destroy() {
    if (this.pjeView) {
      this.pjeView.webContents.destroy();
      this.pjeView = null;
    }
    this.initialized = false;
  }
}

module.exports = PJeManager;
```

**Checklist:**
- [ ] PJeManager criado
- [ ] BrowserView funcional
- [ ] Eventos configurados

---

### 4.2 Integrar no Main Process (90 min)

**Editar `src/main/main.js`:**

```javascript
const PJeManager = require('./pje-manager');

let pjeManager;

function createMainWindow() {
  mainWindow = new BrowserWindow({ /* ... */ });

  // Inicializar PJe Manager
  pjeManager = new PJeManager(mainWindow);

  mainWindow.loadFile(/* ... */);
}

// IPC Handlers para PJe
ipcMain.handle('pje-initialize', async () => {
  return await pjeManager.initialize();
});

ipcMain.handle('pje-navigate', async (event, url) => {
  await pjeManager.navigateTo(url);
  return { success: true };
});

ipcMain.handle('pje-execute-script', async (event, script) => {
  const result = await pjeManager.executeScript(script);
  return { success: true, result };
});

ipcMain.handle('pje-get-page-data', async () => {
  const data = await pjeManager.getPageData();
  return { success: true, data };
});

ipcMain.handle('pje-screenshot', async () => {
  const screenshot = await pjeManager.screenshot();
  return { success: true, screenshot };
});

ipcMain.handle('pje-show', () => {
  pjeManager.show();
  return { success: true };
});

ipcMain.handle('pje-hide', () => {
  pjeManager.hide();
  return { success: true };
});
```

**Checklist:**
- [ ] PJeManager integrado
- [ ] IPC handlers criados
- [ ] Testado com navegação simples

---

### 4.3 Adaptar PJeExecutor para BrowserView (2 horas)

**Editar `src/backend/pje-executor.js`:**

```javascript
class PJeExecutor {
  constructor(pjeManager) {
    this.pjeManager = pjeManager;  // Receber PJeManager em vez de usar CDP
    this.connected = false;
  }

  async initialize() {
    // Não precisa mais conectar via CDP
    this.connected = this.pjeManager?.initialized || false;
    return this.connected;
  }

  async getPageContext() {
    return await this.pjeManager.getPageData();
  }

  async screenshotBase64() {
    const result = await this.pjeManager.screenshot();
    return result.replace('data:image/png;base64,', '');
  }

  async executeAction(action) {
    switch (action.type) {
      case 'navigate':
        await this.pjeManager.navigateTo(action.url);
        break;

      case 'click':
        await this.pjeManager.executeScript(`
          document.querySelector('${action.selector}').click();
        `);
        break;

      case 'fill':
        await this.pjeManager.executeScript(`
          document.querySelector('${action.selector}').value = '${action.value}';
        `);
        break;

      case 'wait':
        await this.delay(action.duration || 1000);
        break;

      default:
        console.warn(`Tipo de ação desconhecido: ${action.type}`);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PJeExecutor;
```

**Checklist:**
- [ ] PJeExecutor adaptado
- [ ] CDP removido
- [ ] BrowserView integrado

---

### 4.4 Criar UI de Controle do PJe (90 min)

**Editar `src/renderer/chat.html` (adicionar controles):**

```html
<div class="pje-controls">
  <button id="pje-init-btn">Abrir PJe</button>
  <button id="pje-hide-btn">Ocultar</button>
  <button id="pje-show-btn">Mostrar</button>
  <input type="text" id="pje-url-input" placeholder="URL do PJe">
  <button id="pje-navigate-btn">Navegar</button>
</div>
```

**Adicionar handlers em `chat-controller.js`:**

```javascript
setupPJeControls() {
  document.getElementById('pje-init-btn').addEventListener('click', async () => {
    await window.electronAPI.pjeInitialize();
    await window.electronAPI.pjeNavigate('https://pje.tjpa.jus.br');
    ModalManager.toast('PJe aberto com sucesso', 'success');
  });

  document.getElementById('pje-hide-btn').addEventListener('click', async () => {
    await window.electronAPI.pjeHide();
  });

  document.getElementById('pje-show-btn').addEventListener('click', async () => {
    await window.electronAPI.pjeShow();
  });

  document.getElementById('pje-navigate-btn').addEventListener('click', async () => {
    const url = document.getElementById('pje-url-input').value;
    await window.electronAPI.pjeNavigate(url);
  });
}
```

**Checklist:**
- [ ] Controles criados
- [ ] Navegação funcionando
- [ ] Show/Hide operacional

---

### 4.5 Testar Extração de Dados (2 horas)

**Testes:**

1. **Navegar para processo PJe**
2. **Extrair dados da página:**

```javascript
const pageData = await window.electronAPI.pjeGetPageData();
console.log('Dados extraídos:', pageData);
```

3. **Validar:**
- [ ] Número do processo extraído
- [ ] Partes identificadas
- [ ] Documentos listados

---

### 4.6 Sincronizar com Backend (90 min)

**Editar `src/main/backend-manager.js`:**

```javascript
class BackendManager {
  constructor(pjeManager) {
    this.pjeManager = pjeManager;
    this.pjeExecutor = new PJeExecutor(pjeManager);  // Passar pjeManager
    // ...
  }

  async executeCommand(sessionId, command, context) {
    // Capturar screenshot do BrowserView
    const screenshot = await this.pjeManager.screenshot();

    // Obter contexto da página
    const pageData = await this.pjeManager.getPageData();

    // Mesclar com contexto fornecido
    const fullContext = {
      ...context,
      pageData,
      url: this.pjeManager.currentUrl
    };

    // Criar plano
    const plan = await this.actionPlanner.createPlan(command, fullContext, screenshot);

    return { success: true, plan };
  }
}
```

**Checklist:**
- [ ] Backend sincronizado
- [ ] Screenshot capturado
- [ ] Contexto da página incluído

---

### 4.7 Testar Automação Completa (3 horas)

**Fluxo de teste:**

1. Abrir PJe no BrowserView
2. Fazer login manualmente
3. Navegar para um processo
4. Executar comando: "ler número do processo"
5. Validar que plano é criado
6. Executar plano
7. Validar que ação foi executada

**Checklist:**
- [ ] Navegação funciona
- [ ] Cookies persistem
- [ ] Extração de dados OK
- [ ] Automação executando
- [ ] Screenshots capturando

---

## Validação da Fase 4

### Critérios de Sucesso

✅ BrowserView integrado
✅ PJe carregando corretamente
✅ Cookies e sessão persistindo
✅ Extração de dados funcionando
✅ Automação executando ações
✅ Screenshots capturando
✅ Sincronização com backend OK

---

## Próxima Fase

➡️ **[Fase 5: Testes e Validação](FASE-5-TESTES.md)**

---

**Status:** ⏳ Aguardando início
**Atualizado:** 2025-12-10
