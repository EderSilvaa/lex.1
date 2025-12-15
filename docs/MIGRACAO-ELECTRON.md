# Migração LEX: Extensão → Electron Desktop App

## Por que Electron?

- ✅ Reutiliza backend Node.js existente (lex-agent-backend)
- ✅ Playwright funciona nativamente
- ✅ Controle total do navegador (sem dependência de extensão)
- ✅ Distribuição via executável (.exe)
- ✅ Atualização automática
- ✅ Interface pode ser portada facilmente

## Arquitetura Nova

```
LEX-Desktop/
├── main.js                 # Main process (Node.js backend)
├── preload.js              # Bridge seguro entre main e renderer
├── renderer/               # UI (React/Vue ou HTML puro)
│   ├── index.html
│   ├── chat.html
│   └── assets/
├── backend/                # Código atual do lex-agent-backend
│   ├── action-planner.js
│   ├── pje-executor.js
│   └── server.js (adaptado)
└── package.json
```

## Passo a Passo

### 1. Criar estrutura Electron (1-2 dias)

```bash
npm init -y
npm install electron electron-builder
npm install express ws playwright dotenv
```

**Criar `main.js` (Main Process):**
```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

// Importar backend atual
const ActionPlanner = require('./backend/action-planner');
const PJeExecutor = require('./backend/pje-executor');

let mainWindow;

app.whenReady().then(() => {
  // Criar janela principal
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Carregar interface
  mainWindow.loadFile('renderer/index.html');

  // Iniciar backend interno (sem servidor HTTP separado)
  initBackend();
});

function initBackend() {
  const actionPlanner = new ActionPlanner();
  const pjeExecutor = new PJeExecutor();

  // IPC para comunicação com renderer
  const { ipcMain } = require('electron');

  ipcMain.handle('execute-command', async (event, command, context) => {
    const plan = await actionPlanner.createPlan(command, context);
    return plan;
  });

  ipcMain.handle('execute-plan', async (event, plan) => {
    await pjeExecutor.initialize();
    // Executar plano...
    return { success: true };
  });
}
```

### 2. Portar Frontend (2-3 dias)

**Opção A: Reutilizar HTML atual**
- Copiar `src/js/lex-agent-ui.js` e `src/js/lex-modal.js`
- Adaptar para usar `window.electronAPI` em vez de extension APIs

**Opção B: Criar interface nova (melhor UX)**
- React + Tailwind CSS
- Tela dedicada (não overlay)
- Melhor experiência desktop

### 3. Adaptar Backend (1-2 dias)

**Mudanças necessárias:**

1. **Remover WebSocket** → Usar IPC do Electron
2. **PjeExecutor**: Continua usando Playwright
3. **ActionPlanner**: Sem mudanças (Supabase Edge Function)

```javascript
// Antes (Extension): WebSocket
ws.send(JSON.stringify({ type: 'plan_created', plan }));

// Depois (Electron): IPC
mainWindow.webContents.send('plan-created', plan);
```

### 4. Comunicação Main ↔️ Renderer (1 dia)

**preload.js** (Bridge seguro):
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  executeCommand: (command, context) =>
    ipcRenderer.invoke('execute-command', command, context),

  executePlan: (plan) =>
    ipcRenderer.invoke('execute-plan', plan),

  onPlanCreated: (callback) =>
    ipcRenderer.on('plan-created', (event, plan) => callback(plan)),
});
```

**No Renderer (HTML/JS):**
```javascript
// Executar comando
const plan = await window.electronAPI.executeCommand('protocolar petição', context);

// Escutar eventos
window.electronAPI.onPlanCreated((plan) => {
  console.log('Plano criado:', plan);
});
```

### 5. Controlar Navegador PJe (Crítico!)

**Opção A: Chromium embutido do Electron**
```javascript
// Abrir PJe dentro do Electron
const pjeWindow = new BrowserWindow({
  parent: mainWindow,
  width: 1024,
  height: 768
});
pjeWindow.loadURL('https://pje.tjpa.jus.br');

// Executar automação na própria janela
pjeWindow.webContents.executeJavaScript(`
  document.querySelector('#username').value = 'user';
`);
```

**Opção B: Playwright controla Chrome externo** (como hoje)
```javascript
// Continua usando CDP na porta 9222
const browser = await playwright.chromium.connectOverCDP('http://localhost:9222');
```

**Recomendação:** Opção A (mais integrado)

### 6. Build e Distribuição (2-3 dias)

**electron-builder** para criar executável:

```json
// package.json
{
  "build": {
    "appId": "com.lexagent.desktop",
    "productName": "LEX Agent",
    "win": {
      "target": ["nsis"],
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

**Gerar executável:**
```bash
npm run build  # Gera LEX-Agent-Setup-1.0.0.exe
```

### 7. Distribuição

**Opções:**
1. **Site próprio**: Download direto do .exe
2. **GitHub Releases**: Gratuito, versionamento automático
3. **Microsoft Store**: Distribuição profissional (requer conta)

## Timeline Estimado

| Fase | Tempo | Esforço |
|------|-------|---------|
| 1. Setup Electron | 1 dia | Baixo |
| 2. Portar Backend | 2 dias | Médio |
| 3. Criar Interface | 3 dias | Alto |
| 4. Integração Playwright | 2 dias | Médio |
| 5. Testes | 2 dias | Médio |
| 6. Build/Deploy | 1 dia | Baixo |
| **TOTAL** | **11 dias** | - |

## Vantagens da Nova Arquitetura

### Antes (Extensão):
```
❌ Usuário instala extensão manualmente
❌ Precisa abrir Chrome com --remote-debugging-port=9222
❌ Backend separado (node server.js)
❌ 3 componentes independentes (extensão + backend + Chrome)
❌ Difícil de distribuir
```

### Depois (Electron):
```
✅ Usuário baixa .exe e instala
✅ Tudo integrado: backend + frontend + navegador
✅ Um único processo
✅ Atualização automática
✅ Profissional
```

## Próximos Passos

1. **Criar POC** (2-3 dias):
   - Setup Electron básico
   - Portar uma funcionalidade (ex: "ler número do processo")
   - Validar viabilidade

2. **Decisão**:
   - Se POC funcionar bem → migrar completamente
   - Se tiver problemas → avaliar alternativas

3. **Migração gradual**:
   - Manter extensão funcionando
   - Desenvolver Electron em paralelo
   - Lançar versão beta para testers

## Código de Exemplo Completo

Ver: `docs/examples/electron-poc/`

## Referências

- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)
- [Playwright with Electron](https://playwright.dev/docs/api/class-electron)
