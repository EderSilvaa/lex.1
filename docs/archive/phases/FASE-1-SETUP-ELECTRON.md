# Fase 1: Setup Electron

**Duração estimada:** 1 dia (8 horas)
**Esforço:** Baixo
**Status:** ⏳ Pendente

---

## Objetivos

✅ Criar estrutura base do projeto Electron
✅ Configurar dependências e ferramentas
✅ Criar arquivos principais (main, preload, renderer)
✅ Validar primeiro build e execução

---

## Sub-tarefas Detalhadas

### 1.1 Criar Estrutura de Diretórios (30 min)

**Descrição:** Criar a estrutura de pastas do projeto Electron

**Comandos:**
```bash
cd c:\Users\EDER\
mkdir lex-desktop
cd lex-desktop

# Criar estrutura
mkdir src
mkdir src\main
mkdir src\renderer
mkdir src\preload
mkdir src\backend
mkdir assets
mkdir assets\icons
mkdir build
```

**Estrutura esperada:**
```
lex-desktop/
├── src/
│   ├── main/           # Main process (Node.js)
│   ├── renderer/       # UI (HTML/CSS/JS)
│   ├── preload/        # Bridge de segurança
│   └── backend/        # Backend integrado
├── assets/
│   └── icons/          # Ícones da aplicação
├── build/              # Arquivos de build
├── package.json
├── .gitignore
└── README.md
```

**Checklist:**
- [ ] Diretórios criados
- [ ] Estrutura validada

---

### 1.2 Inicializar Projeto Node.js (15 min)

**Descrição:** Criar package.json inicial

**Comandos:**
```bash
npm init -y
```

**Editar `package.json`:**
```json
{
  "name": "lex-desktop",
  "version": "1.0.0",
  "description": "LEX Agent - Assistente Jurídico Inteligente para PJe",
  "main": "src/main/main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux"
  },
  "keywords": ["juridico", "pje", "automacao", "ia"],
  "author": "LEX Team",
  "license": "MIT"
}
```

**Checklist:**
- [ ] package.json criado
- [ ] Scripts configurados

---

### 1.3 Instalar Dependências Electron (20 min)

**Descrição:** Instalar Electron e ferramentas de build

**Comandos:**
```bash
# Core
npm install electron --save-dev
npm install electron-builder --save-dev

# Utilities
npm install electron-store --save
npm install electron-updater --save

# Development
npm install electron-reload --save-dev
```

**Versões recomendadas:**
- `electron`: ^28.0.0 (mais recente estável)
- `electron-builder`: ^24.0.0
- `electron-store`: ^8.0.0

**Checklist:**
- [ ] Dependências instaladas
- [ ] node_modules criado
- [ ] package-lock.json gerado

---

### 1.4 Instalar Dependências do Backend (20 min)

**Descrição:** Instalar dependências do backend Node.js (mesmas do lex-agent-backend)

**Comandos:**
```bash
npm install express --save
npm install ws --save
npm install cors --save
npm install dotenv --save
npm install playwright --save
npm install openai --save
npm install node-fetch@2 --save
```

**Checklist:**
- [ ] Express instalado
- [ ] Playwright instalado
- [ ] OpenAI SDK instalado
- [ ] Outras dependências instaladas

---

### 1.5 Criar .gitignore (10 min)

**Descrição:** Configurar arquivos ignorados pelo git

**Criar `.gitignore`:**
```gitignore
# Node
node_modules/
npm-debug.log*
package-lock.json

# Electron
dist/
build/
out/

# Logs
logs/
*.log

# Environment
.env
.env.local

# OS
.DS_Store
Thumbs.db
desktop.ini

# IDE
.vscode/
.idea/

# Screenshots e temporários
screenshots/
temp/
*.tmp
```

**Checklist:**
- [ ] .gitignore criado
- [ ] Padrões configurados

---

### 1.6 Criar Main Process (main.js) (60 min)

**Descrição:** Criar arquivo principal do Electron

**Criar `src/main/main.js`:**
```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Variáveis globais
let mainWindow;
let isDev = process.argv.includes('--dev');

// Criar janela principal
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    backgroundColor: '#0f0f0f',
    icon: path.join(__dirname, '../../assets/icons/icon.png')
  });

  // Carregar interface
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // DevTools em modo dev
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Cleanup ao fechar
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Inicialização do app
app.whenReady().then(() => {
  console.log('🤖 LEX Desktop iniciando...');
  createMainWindow();

  // macOS: recriar janela ao clicar no dock
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Quit quando todas as janelas forem fechadas
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers (básicos para teste)
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('ping', () => {
  return 'pong';
});

// Logging
console.log('🚀 LEX Desktop Main Process carregado');
console.log(`📁 App Path: ${app.getAppPath()}`);
console.log(`💻 Electron: ${process.versions.electron}`);
console.log(`🟢 Node: ${process.versions.node}`);
console.log(`🌐 Chrome: ${process.versions.chrome}`);
```

**Checklist:**
- [ ] main.js criado
- [ ] BrowserWindow configurado
- [ ] IPC handlers básicos criados
- [ ] Logs de debug adicionados

---

### 1.7 Criar Preload Script (preload.js) (30 min)

**Descrição:** Criar bridge de comunicação seguro

**Criar `src/preload/preload.js`:**
```javascript
const { contextBridge, ipcRenderer } = require('electron');

// Expor API segura para o renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Informações do app
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Teste de comunicação
  ping: () => ipcRenderer.invoke('ping'),

  // Listeners de eventos
  onMessage: (callback) => {
    ipcRenderer.on('message', (event, data) => callback(data));
  },

  // Remover listener
  removeListener: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

console.log('✅ Preload script carregado');
console.log('🔒 Context Isolation: ativado');
console.log('📡 electronAPI exposto para renderer');
```

**Checklist:**
- [ ] preload.js criado
- [ ] contextBridge configurado
- [ ] APIs básicas expostas

---

### 1.8 Criar Interface Básica (index.html) (45 min)

**Descrição:** Criar HTML inicial de teste

**Criar `src/renderer/index.html`:**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;">
  <title>LEX Desktop</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>🤖 LEX Desktop</h1>
      <p class="subtitle">Assistente Jurídico Inteligente</p>
    </header>

    <main>
      <div class="status-card">
        <h2>Status do Sistema</h2>
        <div class="status-item">
          <span>Versão:</span>
          <span id="app-version">Carregando...</span>
        </div>
        <div class="status-item">
          <span>Electron:</span>
          <span id="electron-version">Carregando...</span>
        </div>
        <div class="status-item">
          <span>Node:</span>
          <span id="node-version">Carregando...</span>
        </div>
        <div class="status-item">
          <span>Chrome:</span>
          <span id="chrome-version">Carregando...</span>
        </div>
      </div>

      <div class="test-card">
        <h2>Teste de Comunicação IPC</h2>
        <button id="test-button">Testar Ping</button>
        <div id="test-result"></div>
      </div>
    </main>

    <footer>
      <p>LEX Desktop v1.0.0 - Fase 1: Setup Concluído ✅</p>
    </footer>
  </div>

  <script src="renderer.js"></script>
</body>
</html>
```

**Checklist:**
- [ ] index.html criado
- [ ] Estrutura HTML básica
- [ ] Meta tags de segurança (CSP)

---

### 1.9 Criar CSS Básico (styles.css) (30 min)

**Descrição:** Estilização inicial da interface

**Criar `src/renderer/styles.css`:**
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%);
  color: #ffffff;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.container {
  width: 90%;
  max-width: 800px;
  padding: 40px;
}

header {
  text-align: center;
  margin-bottom: 40px;
}

h1 {
  font-size: 3em;
  margin-bottom: 10px;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 1.2em;
  color: #94a3b8;
}

.status-card, .test-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 30px;
  margin-bottom: 30px;
  backdrop-filter: blur(10px);
}

h2 {
  font-size: 1.5em;
  margin-bottom: 20px;
  color: #a855f7;
}

.status-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.status-item:last-child {
  border-bottom: none;
}

.status-item span:first-child {
  color: #94a3b8;
}

.status-item span:last-child {
  color: #22c55e;
  font-weight: 600;
}

button {
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  color: white;
  border: none;
  padding: 15px 30px;
  font-size: 1em;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 25px rgba(99, 102, 241, 0.3);
}

button:active {
  transform: translateY(0);
}

#test-result {
  margin-top: 20px;
  padding: 15px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 8px;
  color: #22c55e;
  display: none;
}

#test-result.visible {
  display: block;
}

footer {
  text-align: center;
  margin-top: 40px;
  color: #64748b;
  font-size: 0.9em;
}
```

**Checklist:**
- [ ] styles.css criado
- [ ] Design system básico aplicado
- [ ] Responsividade configurada

---

### 1.10 Criar Renderer Script (renderer.js) (45 min)

**Descrição:** JavaScript do renderer para testar comunicação

**Criar `src/renderer/renderer.js`:**
```javascript
// Esperar DOM carregar
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎨 Renderer carregado');

  // Verificar se electronAPI está disponível
  if (!window.electronAPI) {
    console.error('❌ electronAPI não disponível!');
    return;
  }

  console.log('✅ electronAPI disponível');

  // Carregar informações do sistema
  await loadSystemInfo();

  // Configurar botão de teste
  const testButton = document.getElementById('test-button');
  const testResult = document.getElementById('test-result');

  testButton.addEventListener('click', async () => {
    console.log('🧪 Testando comunicação IPC...');

    try {
      const response = await window.electronAPI.ping();
      console.log('✅ Resposta recebida:', response);

      testResult.textContent = `✅ Comunicação OK! Resposta: ${response}`;
      testResult.classList.add('visible');

      setTimeout(() => {
        testResult.classList.remove('visible');
      }, 3000);
    } catch (error) {
      console.error('❌ Erro:', error);
      testResult.textContent = `❌ Erro: ${error.message}`;
      testResult.style.background = 'rgba(239, 68, 68, 0.1)';
      testResult.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      testResult.style.color = '#ef4444';
      testResult.classList.add('visible');
    }
  });
});

// Carregar informações do sistema
async function loadSystemInfo() {
  try {
    // Versão do app
    const appVersion = await window.electronAPI.getAppVersion();
    document.getElementById('app-version').textContent = appVersion;

    // Versões do Electron (via process.versions)
    document.getElementById('electron-version').textContent = process.versions.electron || 'N/A';
    document.getElementById('node-version').textContent = process.versions.node || 'N/A';
    document.getElementById('chrome-version').textContent = process.versions.chrome || 'N/A';

    console.log('✅ Informações do sistema carregadas');
  } catch (error) {
    console.error('❌ Erro ao carregar informações:', error);
  }
}

// Listener de exemplo
window.electronAPI.onMessage((data) => {
  console.log('📨 Mensagem recebida do main:', data);
});

console.log('🚀 Renderer script inicializado');
```

**Checklist:**
- [ ] renderer.js criado
- [ ] Comunicação IPC testada
- [ ] Logs de debug implementados

---

### 1.11 Criar Ícone da Aplicação (15 min)

**Descrição:** Criar/baixar ícone básico para a aplicação

**Opções:**

**Opção A - Ícone Placeholder:**
- Baixar ícone genérico de app jurídico
- Salvar em `assets/icons/icon.png` (512×512px)

**Opção B - Criar depois:**
- Usar ícone padrão do Electron por enquanto
- Adicionar ícone customizado na Fase 6

**Checklist:**
- [ ] Ícone adicionado (ou skip para depois)
- [ ] Caminho configurado em main.js

---

### 1.12 Primeiro Build e Teste (60 min)

**Descrição:** Executar aplicação pela primeira vez

**Comandos:**
```bash
# Testar em modo desenvolvimento
npm start

# Se tudo funcionar:
# - Janela do Electron deve abrir
# - Interface deve carregar
# - Botão "Testar Ping" deve funcionar
# - Versões devem aparecer
```

**Validações:**
1. Janela abre sem erros
2. Interface renderiza corretamente
3. Console não mostra erros
4. Botão de ping funciona
5. Versões aparecem corretamente

**Troubleshooting comum:**

**Erro: "Cannot find module 'electron'"**
```bash
npm install electron --save-dev
```

**Erro: "preload script not found"**
- Verificar caminho em main.js
- Deve ser: `path.join(__dirname, '../preload/preload.js')`

**Erro: "electronAPI is not defined"**
- Verificar contextIsolation: true
- Verificar exposeInMainWorld no preload

**Checklist:**
- [ ] App executa sem erros
- [ ] Interface carrega
- [ ] IPC funciona
- [ ] DevTools abre
- [ ] Logs aparecem no console

---

### 1.13 Configurar electron-builder (30 min)

**Descrição:** Preparar para build de produção

**Editar `package.json` (adicionar seção build):**
```json
{
  "build": {
    "appId": "com.lexagent.desktop",
    "productName": "LEX Desktop",
    "directories": {
      "output": "dist",
      "buildResources": "assets"
    },
    "files": [
      "src/**/*",
      "assets/**/*",
      "node_modules/**/*",
      "package.json"
    ],
    "win": {
      "target": ["nsis"],
      "icon": "assets/icons/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    }
  }
}
```

**Testar build:**
```bash
npm run build:win
```

**Nota:** Build completo só será validado na Fase 6. Por agora, apenas configurar.

**Checklist:**
- [ ] electron-builder configurado
- [ ] Seção build no package.json
- [ ] Teste de build executado (pode falhar por falta de ícone)

---

## Validação da Fase 1

### Critérios de Sucesso

✅ Estrutura de diretórios criada
✅ Dependências instaladas sem erros
✅ Main process executa
✅ Renderer carrega interface
✅ IPC funciona (ping/pong)
✅ DevTools abre e funciona
✅ Logs aparecem no console
✅ electron-builder configurado

### Entregáveis

1. ✅ Projeto Electron funcional
2. ✅ Interface básica renderizando
3. ✅ Comunicação IPC funcionando
4. ✅ Documentação inicial

---

## Próxima Fase

➡️ **[Fase 2: Main Process e Backend](FASE-2-MAIN-PROCESS.md)**

Integrar o backend Node.js existente no main process e implementar IPC handlers.

---

**Status:** ⏳ Aguardando início
**Atualizado:** 2025-12-10
