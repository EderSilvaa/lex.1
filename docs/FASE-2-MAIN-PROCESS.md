# Fase 2: Main Process e Backend

**Duração estimada:** 2 dias (16 horas)
**Esforço:** Médio
**Status:** ⏳ Pendente

---

## Objetivos

✅ Portar backend Node.js para main process
✅ Implementar IPC handlers (substituir WebSocket)
✅ Integrar ActionPlanner e PJeExecutor
✅ Configurar comunicação com Supabase

---

## Pré-requisitos

- ✅ Fase 1 concluída com sucesso
- ✅ App Electron executando
- ✅ IPC básico funcionando

---

## Sub-tarefas Detalhadas

### 2.1 Copiar Código do Backend (30 min)

**Descrição:** Copiar arquivos do lex-agent-backend para o projeto Electron

**Comandos:**
```bash
cd c:\Users\EDER\lex-desktop

# Copiar arquivos do backend
xcopy /E /I c:\Users\EDER\lex-test1\lex-agent-backend\src src\backend
xcopy c:\Users\EDER\lex-test1\lex-agent-backend\.env .env
```

**Arquivos a copiar:**
```
src/backend/
├── action-planner.js      # 215 linhas - Planejamento com GPT-4
├── pje-executor.js        # 440 linhas - Automação Playwright
└── server.js              # 415 linhas - Servidor (será adaptado)
```

**Checklist:**
- [ ] Arquivos copiados
- [ ] .env copiado (com chaves Supabase)
- [ ] Estrutura verificada

---

### 2.2 Adaptar ActionPlanner (60 min)

**Descrição:** Adaptar action-planner.js para funcionar no Electron

**Arquivo:** `src/backend/action-planner.js`

**Mudanças necessárias:**

**Antes (extensão):**
```javascript
// Usava variáveis de ambiente
const dotenv = require('dotenv');
dotenv.config();

const PLANNER_URL = process.env.SUPABASE_PLANNER_URL;
```

**Depois (Electron):**
```javascript
// Continua usando .env, mas validar se funciona no Electron
const dotenv = require('dotenv');
const path = require('path');
const { app } = require('electron');

// Carregar .env do diretório do app
dotenv.config({ path: path.join(app.getAppPath(), '.env') });

const PLANNER_URL = process.env.SUPABASE_PLANNER_URL;

// Validar variável
if (!PLANNER_URL) {
  console.error('❌ SUPABASE_PLANNER_URL não configurada no .env');
}
```

**Checklist:**
- [ ] Imports atualizados
- [ ] .env carregando corretamente
- [ ] Logs de debug adicionados
- [ ] Testar chamada à Edge Function

---

### 2.3 Adaptar PJeExecutor (90 min)

**Descrição:** Adaptar pje-executor.js para Electron

**Arquivo:** `src/backend/pje-executor.js`

**Mudanças principais:**

**1. Screenshots path:**
```javascript
// Antes
const screenshotPath = './screenshots/test.png';

// Depois (Electron)
const { app } = require('electron');
const screenshotPath = path.join(app.getPath('userData'), 'screenshots', 'test.png');

// Criar diretório se não existir
const fs = require('fs');
const screenshotDir = path.join(app.getPath('userData'), 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}
```

**2. Playwright connection:**
```javascript
// Mantém conexão CDP por enquanto (Fase 4 mudará para BrowserView)
async initialize() {
  try {
    console.log('🔌 Conectando ao navegador via CDP...');
    this.browser = await playwright.chromium.connectOverCDP('http://localhost:9222');
    this.context = this.browser.contexts()[0];

    if (!this.context) {
      throw new Error('Nenhum contexto de navegação encontrado');
    }

    this.page = this.context.pages().find(p =>
      p.url().includes('pje') || p.url().includes('tjpa')
    );

    if (!this.page) {
      console.warn('⚠️ Nenhuma página do PJe encontrada');
      this.page = this.context.pages()[0];
    }

    this.connected = true;
    console.log('✅ Conectado ao navegador');
    return true;

  } catch (error) {
    console.error('❌ Erro ao conectar:', error.message);
    this.connected = false;
    return false;
  }
}
```

**Checklist:**
- [ ] Paths adaptados para app.getPath()
- [ ] Diretórios criados automaticamente
- [ ] Playwright funcionando
- [ ] Logs de debug adicionados

---

### 2.4 Criar Backend Manager (120 min)

**Descrição:** Criar módulo gerenciador do backend no main process

**Criar `src/main/backend-manager.js`:**
```javascript
const { app } = require('electron');
const ActionPlanner = require('../backend/action-planner');
const PJeExecutor = require('../backend/pje-executor');

class BackendManager {
  constructor() {
    this.actionPlanner = null;
    this.pjeExecutor = null;
    this.initialized = false;
    this.activeSessions = new Map();
  }

  async initialize() {
    try {
      console.log('🚀 Inicializando backend...');

      // Inicializar módulos
      this.actionPlanner = new ActionPlanner();
      this.pjeExecutor = new PJeExecutor();

      this.initialized = true;
      console.log('✅ Backend inicializado com sucesso');
      return true;

    } catch (error) {
      console.error('❌ Erro ao inicializar backend:', error);
      return false;
    }
  }

  // Criar nova sessão
  createSession() {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.activeSessions.set(sessionId, {
      id: sessionId,
      created: new Date(),
      context: null,
      currentTask: null
    });

    console.log(`📝 Sessão criada: ${sessionId}`);
    return sessionId;
  }

  // Obter sessão
  getSession(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  // Atualizar contexto da sessão
  updateSessionContext(sessionId, context) {
    const session = this.getSession(sessionId);
    if (session) {
      session.context = context;
      session.lastUpdated = new Date();
      console.log(`📊 Contexto atualizado [${sessionId}]`);
      return true;
    }
    return false;
  }

  // Executar comando do usuário
  async executeCommand(sessionId, command, context) {
    console.log(`🚀 Executando comando: "${command}"`);

    try {
      // Capturar screenshot (se PJe estiver conectado)
      let screenshot = null;
      if (this.pjeExecutor.connected) {
        screenshot = await this.pjeExecutor.screenshotBase64();
        console.log('👁️ Screenshot capturado para análise');
      }

      // Criar plano com ActionPlanner
      const plan = await this.actionPlanner.createPlan(command, context, screenshot);

      // Armazenar na sessão
      const session = this.getSession(sessionId);
      if (session) {
        session.currentTask = {
          command,
          plan,
          status: 'awaiting_approval',
          createdAt: new Date()
        };
      }

      return { success: true, plan };

    } catch (error) {
      console.error('❌ Erro ao executar comando:', error);
      return { success: false, error: error.message };
    }
  }

  // Executar plano aprovado
  async executePlan(sessionId) {
    const session = this.getSession(sessionId);

    if (!session || !session.currentTask) {
      throw new Error('Nenhuma tarefa pendente');
    }

    const { plan } = session.currentTask;
    session.currentTask.status = 'executing';

    console.log('🔧 Executando plano...');

    // Conectar ao navegador
    const connected = await this.pjeExecutor.initialize();
    if (!connected) {
      throw new Error('Não foi possível conectar ao navegador');
    }

    // Executar steps
    const results = [];
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      console.log(`📌 Step ${i + 1}/${plan.steps.length}: ${step.description}`);

      const result = await this.pjeExecutor.executeAction({
        type: step.type,
        selector: step.selector,
        value: step.value,
        url: step.url
      });

      results.push(result);
    }

    session.currentTask.status = 'completed';
    console.log('✅ Plano executado com sucesso');

    return { success: true, results };
  }

  // Testar conexão com navegador
  async testBrowserConnection() {
    return await this.pjeExecutor.initialize();
  }

  // Obter contexto da página
  async getPageContext() {
    if (!this.pjeExecutor.connected) {
      await this.pjeExecutor.initialize();
    }
    return await this.pjeExecutor.getPageContext();
  }

  // Tirar screenshot
  async takeScreenshot() {
    if (!this.pjeExecutor.connected) {
      await this.pjeExecutor.initialize();
    }
    return await this.pjeExecutor.screenshotBase64();
  }

  // Cleanup
  destroy() {
    console.log('🛑 Encerrando backend...');
    this.activeSessions.clear();
    this.initialized = false;
  }
}

module.exports = BackendManager;
```

**Checklist:**
- [ ] BackendManager criado
- [ ] Métodos implementados
- [ ] Gestão de sessões funcional
- [ ] Logs de debug completos

---

### 2.5 Implementar IPC Handlers (120 min)

**Descrição:** Criar handlers IPC para substituir WebSocket

**Editar `src/main/main.js` (adicionar seção de IPC):**

```javascript
const BackendManager = require('./backend-manager');

// Inicializar backend
let backendManager;

app.whenReady().then(async () => {
  console.log('🤖 LEX Desktop iniciando...');

  // Inicializar backend
  backendManager = new BackendManager();
  await backendManager.initialize();

  createMainWindow();
});

// ====================================
// IPC HANDLERS
// ====================================

// Criar sessão
ipcMain.handle('create-session', () => {
  return backendManager.createSession();
});

// Atualizar contexto
ipcMain.handle('update-context', (event, sessionId, context) => {
  return backendManager.updateSessionContext(sessionId, context);
});

// Executar comando
ipcMain.handle('execute-command', async (event, sessionId, command, context) => {
  const result = await backendManager.executeCommand(sessionId, command, context);

  // Enviar plano criado para renderer
  if (result.success) {
    event.sender.send('plan-created', sessionId, result.plan);
  }

  return result;
});

// Aprovar e executar plano
ipcMain.handle('execute-plan', async (event, sessionId) => {
  try {
    // Enviar status: executando
    event.sender.send('execution-started', sessionId);

    const result = await backendManager.executePlan(sessionId);

    // Enviar conclusão
    event.sender.send('execution-completed', sessionId, result);

    return result;

  } catch (error) {
    event.sender.send('execution-error', sessionId, error.message);
    return { success: false, error: error.message };
  }
});

// Cancelar ação
ipcMain.handle('cancel-action', (event, sessionId) => {
  const session = backendManager.getSession(sessionId);
  if (session) {
    session.currentTask = null;
    return { success: true };
  }
  return { success: false };
});

// Testar conexão com navegador
ipcMain.handle('test-browser-connection', async () => {
  try {
    const connected = await backendManager.testBrowserConnection();
    return { success: connected, connected };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Obter contexto da página PJe
ipcMain.handle('get-page-context', async () => {
  try {
    const context = await backendManager.getPageContext();
    return { success: true, context };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Tirar screenshot
ipcMain.handle('take-screenshot', async () => {
  try {
    const screenshot = await backendManager.takeScreenshot();
    return { success: true, screenshot };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Ping (para teste)
ipcMain.handle('ping', () => {
  return 'pong';
});

// Obter versão do app
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

console.log('✅ IPC Handlers registrados');
```

**Checklist:**
- [ ] IPC handlers implementados
- [ ] Substituição de WebSocket completa
- [ ] Eventos push (send) configurados
- [ ] Logs adicionados

---

### 2.6 Atualizar Preload Script (45 min)

**Descrição:** Expor novas APIs IPC no preload

**Editar `src/preload/preload.js`:**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Informações do app
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  ping: () => ipcRenderer.invoke('ping'),

  // Sessão
  createSession: () => ipcRenderer.invoke('create-session'),
  updateContext: (sessionId, context) =>
    ipcRenderer.invoke('update-context', sessionId, context),

  // Comandos e ações
  executeCommand: (sessionId, command, context) =>
    ipcRenderer.invoke('execute-command', sessionId, command, context),

  executePlan: (sessionId) =>
    ipcRenderer.invoke('execute-plan', sessionId),

  cancelAction: (sessionId) =>
    ipcRenderer.invoke('cancel-action', sessionId),

  // Navegador PJe
  testBrowserConnection: () =>
    ipcRenderer.invoke('test-browser-connection'),

  getPageContext: () =>
    ipcRenderer.invoke('get-page-context'),

  takeScreenshot: () =>
    ipcRenderer.invoke('take-screenshot'),

  // Listeners de eventos
  onPlanCreated: (callback) => {
    ipcRenderer.on('plan-created', (event, sessionId, plan) =>
      callback(sessionId, plan)
    );
  },

  onExecutionStarted: (callback) => {
    ipcRenderer.on('execution-started', (event, sessionId) =>
      callback(sessionId)
    );
  },

  onExecutionCompleted: (callback) => {
    ipcRenderer.on('execution-completed', (event, sessionId, result) =>
      callback(sessionId, result)
    );
  },

  onExecutionError: (callback) => {
    ipcRenderer.on('execution-error', (event, sessionId, error) =>
      callback(sessionId, error)
    );
  },

  // Remover listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

console.log('✅ Preload script carregado');
console.log('📡 electronAPI atualizado com backend handlers');
```

**Checklist:**
- [ ] APIs expostas
- [ ] Listeners configurados
- [ ] TypeScript types (opcional)

---

### 2.7 Criar Interface de Teste do Backend (60 min)

**Descrição:** Adicionar UI de teste na interface atual

**Editar `src/renderer/index.html` (adicionar seção de testes):**

```html
<!-- Adicionar após .test-card existente -->

<div class="test-card">
  <h2>Teste de Backend</h2>

  <div class="test-section">
    <h3>1. Testar Conexão com Navegador</h3>
    <button id="test-browser-btn">Testar Conexão PJe</button>
    <div id="browser-result" class="test-result"></div>
  </div>

  <div class="test-section">
    <h3>2. Criar Sessão</h3>
    <button id="create-session-btn">Criar Sessão</button>
    <div id="session-result" class="test-result"></div>
  </div>

  <div class="test-section">
    <h3>3. Executar Comando</h3>
    <input type="text" id="command-input" placeholder="Digite um comando (ex: ler número do processo)">
    <button id="execute-command-btn">Executar</button>
    <div id="command-result" class="test-result"></div>
  </div>

  <div class="test-section">
    <h3>4. Obter Contexto da Página</h3>
    <button id="get-context-btn">Obter Contexto</button>
    <pre id="context-result" class="test-result"></pre>
  </div>
</div>
```

**Editar `src/renderer/renderer.js` (adicionar testes):**

```javascript
let currentSessionId = null;

// Aguardar DOM carregar
document.addEventListener('DOMContentLoaded', async () => {
  await loadSystemInfo();
  setupEventListeners();
  setupBackendListeners();
});

// Configurar listeners de botões
function setupEventListeners() {
  // Testar conexão com navegador
  document.getElementById('test-browser-btn').addEventListener('click', async () => {
    const result = await window.electronAPI.testBrowserConnection();
    const resultDiv = document.getElementById('browser-result');

    if (result.success && result.connected) {
      resultDiv.textContent = '✅ Conectado ao navegador PJe com sucesso!';
      resultDiv.className = 'test-result success visible';
    } else {
      resultDiv.textContent = `❌ Falha: ${result.error || 'Navegador não conectado'}`;
      resultDiv.className = 'test-result error visible';
    }
  });

  // Criar sessão
  document.getElementById('create-session-btn').addEventListener('click', async () => {
    currentSessionId = await window.electronAPI.createSession();
    const resultDiv = document.getElementById('session-result');
    resultDiv.textContent = `✅ Sessão criada: ${currentSessionId}`;
    resultDiv.className = 'test-result success visible';
  });

  // Executar comando
  document.getElementById('execute-command-btn').addEventListener('click', async () => {
    if (!currentSessionId) {
      alert('Crie uma sessão primeiro!');
      return;
    }

    const command = document.getElementById('command-input').value;
    if (!command) {
      alert('Digite um comando!');
      return;
    }

    const resultDiv = document.getElementById('command-result');
    resultDiv.textContent = '⏳ Executando comando...';
    resultDiv.className = 'test-result visible';

    const result = await window.electronAPI.executeCommand(
      currentSessionId,
      command,
      { source: 'test-interface' }
    );

    if (result.success) {
      resultDiv.textContent = `✅ Plano criado com ${result.plan.steps.length} steps`;
      resultDiv.className = 'test-result success visible';
    } else {
      resultDiv.textContent = `❌ Erro: ${result.error}`;
      resultDiv.className = 'test-result error visible';
    }
  });

  // Obter contexto
  document.getElementById('get-context-btn').addEventListener('click', async () => {
    const result = await window.electronAPI.getPageContext();
    const resultDiv = document.getElementById('context-result');

    if (result.success) {
      resultDiv.textContent = JSON.stringify(result.context, null, 2);
      resultDiv.className = 'test-result success visible';
    } else {
      resultDiv.textContent = `❌ Erro: ${result.error}`;
      resultDiv.className = 'test-result error visible';
    }
  });
}

// Listeners de eventos do backend
function setupBackendListeners() {
  // Plano criado
  window.electronAPI.onPlanCreated((sessionId, plan) => {
    console.log('📋 Plano criado:', plan);
    alert(`Plano criado com ${plan.steps.length} steps!`);
  });

  // Execução iniciada
  window.electronAPI.onExecutionStarted((sessionId) => {
    console.log('▶️ Execução iniciada');
  });

  // Execução concluída
  window.electronAPI.onExecutionCompleted((sessionId, result) => {
    console.log('✅ Execução concluída:', result);
    alert('Execução concluída com sucesso!');
  });

  // Erro na execução
  window.electronAPI.onExecutionError((sessionId, error) => {
    console.error('❌ Erro na execução:', error);
    alert(`Erro: ${error}`);
  });
}
```

**Checklist:**
- [ ] UI de teste criada
- [ ] Botões de teste funcionais
- [ ] Listeners de eventos configurados

---

### 2.8 Configurar Variáveis de Ambiente (30 min)

**Descrição:** Garantir que .env é carregado corretamente

**Criar/Verificar `.env`:**
```env
# Supabase
SUPABASE_URL=https://nspauxzztflgmxjgevmo.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_PLANNER_URL=https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/LEX-AGENT-PLANNER
SUPABASE_OPENIA_URL=https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/OPENIA

# OpenAI (se precisar)
OPENAI_API_KEY=sk-...

# Configurações
PORT=3000
NODE_ENV=development
```

**Testar carregamento:**
```javascript
// src/main/main.js (início do arquivo)
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

console.log('🔑 Variáveis de ambiente:');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '❌');
console.log('  SUPABASE_KEY:', process.env.SUPABASE_KEY ? '✅' : '❌');
console.log('  SUPABASE_PLANNER_URL:', process.env.SUPABASE_PLANNER_URL ? '✅' : '❌');
```

**Checklist:**
- [ ] .env criado
- [ ] Variáveis configuradas
- [ ] Carregamento validado

---

### 2.9 Testar Integração Completa (120 min)

**Descrição:** Testar toda a stack integrada

**Testes a realizar:**

**1. Testar ActionPlanner:**
```bash
# No console do Electron DevTools:
const result = await window.electronAPI.executeCommand(
  currentSessionId,
  'ler número do processo',
  {}
);
console.log(result);
```

**Validar:**
- [ ] Chamada à Edge Function funciona
- [ ] Plano é retornado corretamente
- [ ] Screenshot é capturado (se navegador conectado)

**2. Testar PJeExecutor:**
```bash
# Primeiro: Abrir Chrome com CDP
chrome.exe --remote-debugging-port=9222

# Navegar para: https://pje.tjpa.jus.br

# No console do Electron:
const browserResult = await window.electronAPI.testBrowserConnection();
console.log(browserResult);  // Deve ser { success: true, connected: true }

const contextResult = await window.electronAPI.getPageContext();
console.log(contextResult);  // Deve retornar dados da página
```

**Validar:**
- [ ] Conexão CDP funciona
- [ ] Contexto da página é extraído
- [ ] Screenshot funciona

**3. Testar Fluxo Completo:**
1. Criar sessão
2. Conectar ao navegador
3. Executar comando "ler número do processo"
4. Receber plano
5. (Execução será testada na Fase 4)

**Checklist geral:**
- [ ] ActionPlanner funciona
- [ ] PJeExecutor conecta
- [ ] IPC funciona sem erros
- [ ] Logs aparecem corretamente
- [ ] Sem memory leaks

---

### 2.10 Documentar APIs IPC (30 min)

**Descrição:** Documentar todas as APIs disponíveis

**Criar `docs/API-IPC-REFERENCE.md`:**
```markdown
# Referência de APIs IPC

## Sessão

### createSession()
Cria nova sessão de trabalho.
**Returns:** `string` - ID da sessão

### updateContext(sessionId, context)
Atualiza contexto da sessão.
**Params:**
- sessionId: string
- context: object
**Returns:** `boolean`

## Comandos

### executeCommand(sessionId, command, context)
Executa comando do usuário e gera plano.
**Params:**
- sessionId: string
- command: string
- context: object
**Returns:** `{ success: boolean, plan?: object, error?: string }`

... (continuar para todas as APIs)
```

**Checklist:**
- [ ] Documentação criada
- [ ] Exemplos de uso incluídos

---

## Validação da Fase 2

### Critérios de Sucesso

✅ Backend integrado no main process
✅ IPC handlers funcionando
✅ ActionPlanner criando planos
✅ PJeExecutor conectando ao navegador
✅ Testes passando
✅ Logs claros e informativos
✅ Sem erros no console
✅ Documentação completa

### Entregáveis

1. ✅ Backend Manager funcional
2. ✅ IPC handlers implementados
3. ✅ ActionPlanner integrado
4. ✅ PJeExecutor integrado
5. ✅ Interface de teste funcional
6. ✅ Documentação de APIs

---

## Troubleshooting

### Erro: "Cannot find module '../backend/action-planner'"
- Verificar path relativo
- Verificar se arquivos foram copiados

### Erro: "fetch is not defined"
- Instalar node-fetch: `npm install node-fetch@2`
- Importar no action-planner.js

### Erro: "SUPABASE_PLANNER_URL is undefined"
- Verificar .env está no root
- Verificar dotenv.config() está correto

### Erro: "Browser not connected"
- Chrome deve estar rodando com: `chrome.exe --remote-debugging-port=9222`
- Verificar porta 9222 está aberta

---

## Próxima Fase

➡️ **[Fase 3: Renderer e Interface](FASE-3-RENDERER-UI.md)**

Portar content-simple.js e criar interface completa do chat.

---

**Status:** ⏳ Aguardando início
**Atualizado:** 2025-12-10
