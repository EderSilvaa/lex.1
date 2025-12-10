# Mapeamento de APIs: Chrome Extension → Electron

Este documento mapeia todas as APIs da extensão Chrome para seus equivalentes no Electron.

---

## APIs de Runtime

### chrome.runtime.getURL()

**Uso na extensão:**
```javascript
const cssUrl = chrome.runtime.getURL('styles/chat-styles.css');
const iconUrl = chrome.runtime.getURL('assets/icon.png');
```

**Equivalente no Electron:**
```javascript
// Opção 1: Path relativo (renderer)
const cssPath = './styles/chat-styles.css';
const iconPath = './assets/icon.png';

// Opção 2: Path absoluto (main process)
const path = require('path');
const { app } = require('electron');
const cssPath = path.join(app.getAppPath(), 'src/renderer/styles/chat-styles.css');
const iconPath = path.join(app.getAppPath(), 'assets/icon.png');
```

**Complexidade:** 🟢 Baixa

---

### chrome.runtime.sendMessage()

**Uso na extensão:**
```javascript
// Content script → Background
chrome.runtime.sendMessage(
  { action: 'getData', payload: { id: 123 } },
  (response) => {
    console.log('Resposta:', response);
  }
);
```

**Equivalente no Electron:**
```javascript
// Renderer → Main (via IPC)
const response = await window.electronAPI.getData({ id: 123 });
console.log('Resposta:', response);

// Preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  getData: (params) => ipcRenderer.invoke('get-data', params)
});

// Main.js
ipcMain.handle('get-data', async (event, params) => {
  return { data: '...' };
});
```

**Complexidade:** 🟡 Média

---

### chrome.runtime.onMessage

**Uso na extensão:**
```javascript
// Background listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getData') {
    sendResponse({ data: '...' });
  }
  return true; // Async response
});
```

**Equivalente no Electron:**
```javascript
// Main process listener
ipcMain.handle('get-data', async (event, params) => {
  return { data: '...' };
});

// Ou para eventos push (Main → Renderer):
mainWindow.webContents.send('data-updated', { data: '...' });

// Renderer listener
window.electronAPI.onDataUpdated((data) => {
  console.log('Dados atualizados:', data);
});

// Preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  onDataUpdated: (callback) => {
    ipcRenderer.on('data-updated', (event, data) => callback(data));
  }
});
```

**Complexidade:** 🟡 Média

---

## APIs de Storage

### chrome.storage.local.get()

**Uso na extensão:**
```javascript
chrome.storage.local.get(['chatHistory', 'settings'], (result) => {
  console.log('Histórico:', result.chatHistory);
  console.log('Configurações:', result.settings);
});
```

**Equivalente no Electron:**

**Opção 1: localStorage (simples)**
```javascript
const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
const settings = JSON.parse(localStorage.getItem('settings') || '{}');
```

**Opção 2: electron-store (recomendado)**
```javascript
// Instalar: npm install electron-store

// Main process
const Store = require('electron-store');
const store = new Store();

// Salvar
store.set('chatHistory', [...]);
store.set('settings', {...});

// Ler
const chatHistory = store.get('chatHistory', []);
const settings = store.get('settings', {});

// IPC para renderer
ipcMain.handle('store-get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('store-set', (event, key, value) => {
  store.set(key, value);
});
```

**Complexidade:** 🟢 Baixa

---

### chrome.storage.local.set()

**Uso na extensão:**
```javascript
chrome.storage.local.set({
  chatHistory: [...],
  settings: {...}
}, () => {
  console.log('Dados salvos');
});
```

**Equivalente no Electron:**

**Opção 1: localStorage**
```javascript
localStorage.setItem('chatHistory', JSON.stringify([...]));
localStorage.setItem('settings', JSON.stringify({...}));
console.log('Dados salvos');
```

**Opção 2: electron-store**
```javascript
store.set('chatHistory', [...]);
store.set('settings', {...});
console.log('Dados salvos');

// Ou via IPC
await window.electronAPI.storeSet('chatHistory', [...]);
```

**Complexidade:** 🟢 Baixa

---

### chrome.storage.onChanged

**Uso na extensão:**
```javascript
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (changes.chatHistory) {
    console.log('Histórico mudou:', changes.chatHistory.newValue);
  }
});
```

**Equivalente no Electron:**
```javascript
// electron-store tem eventos nativos
store.onDidChange('chatHistory', (newValue, oldValue) => {
  console.log('Histórico mudou:', newValue);
});

// Ou broadcast via IPC
// Main → Renderer
mainWindow.webContents.send('storage-changed', {
  key: 'chatHistory',
  value: newValue
});
```

**Complexidade:** 🟡 Média

---

## APIs de Tabs

### chrome.tabs.query()

**Uso na extensão:**
```javascript
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentTab = tabs[0];
  console.log('URL:', currentTab.url);
});
```

**Equivalente no Electron:**
```javascript
// Electron não tem conceito de "tabs" como Chrome
// Use BrowserViews ou múltiplas BrowserWindows

// Obter URL do BrowserView atual
const url = pjeView.webContents.getURL();
console.log('URL:', url);

// Ou obter todas as janelas
const windows = BrowserWindow.getAllWindows();
windows.forEach(win => {
  console.log('URL:', win.webContents.getURL());
});
```

**Complexidade:** 🟡 Média (conceito diferente)

---

### chrome.tabs.onActivated

**Uso na extensão:**
```javascript
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('Tab ativada:', activeInfo.tabId);
});
```

**Equivalente no Electron:**
```javascript
// BrowserWindow focus
mainWindow.on('focus', () => {
  console.log('Janela focada');
});

// BrowserView não tem evento de "activate"
// Mas você pode criar lógica própria de tracking
```

**Complexidade:** 🟡 Média

---

### chrome.tabs.onUpdated

**Uso na extensão:**
```javascript
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('Página carregada:', tab.url);
  }
});
```

**Equivalente no Electron:**
```javascript
// BrowserView/BrowserWindow
pjeView.webContents.on('did-finish-load', () => {
  const url = pjeView.webContents.getURL();
  console.log('Página carregada:', url);
});

// Ou did-start-loading, did-stop-loading, etc.
```

**Complexidade:** 🟢 Baixa

---

## APIs de Scripting

### chrome.scripting.executeScript()

**Uso na extensão:**
```javascript
chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => {
    return document.title;
  }
}, (results) => {
  console.log('Título:', results[0].result);
});
```

**Equivalente no Electron:**
```javascript
// BrowserView/BrowserWindow
const title = await pjeView.webContents.executeJavaScript(`
  document.title
`);
console.log('Título:', title);

// Ou função completa
const result = await pjeView.webContents.executeJavaScript(`
  (() => {
    const data = {
      title: document.title,
      url: window.location.href
    };
    return data;
  })()
`);
```

**Complexidade:** 🟢 Baixa

---

## Content Scripts

### Injeção Automática (manifest.json)

**Uso na extensão:**
```json
{
  "content_scripts": [
    {
      "matches": ["*://*.pje.jus.br/*"],
      "js": ["content-simple.js"],
      "css": ["styles.css"],
      "run_at": "document_end"
    }
  ]
}
```

**Equivalente no Electron:**
```javascript
// Preload script (executado automaticamente)
// main.js
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, '../preload/preload.js')
  }
});

// Ou injeção manual após load
pjeView.webContents.on('did-finish-load', () => {
  const url = pjeView.webContents.getURL();
  if (url.includes('pje.jus.br')) {
    // Injetar CSS
    pjeView.webContents.insertCSS(`
      /* Estilos aqui */
    `);

    // Injetar JS
    pjeView.webContents.executeJavaScript(`
      // Código aqui
    `);
  }
});
```

**Complexidade:** 🟡 Média

---

## WebRequest

### chrome.webRequest.onBeforeRequest

**Uso na extensão:**
```javascript
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.log('Request:', details.url);
    // Modificar ou bloquear
  },
  { urls: ["*://*.pje.jus.br/*"] },
  ["blocking"]
);
```

**Equivalente no Electron:**
```javascript
const { session } = require('electron');

session.defaultSession.webRequest.onBeforeRequest(
  { urls: ['*://*.pje.jus.br/*'] },
  (details, callback) => {
    console.log('Request:', details.url);

    // Permitir
    callback({});

    // Ou bloquear
    // callback({ cancel: true });

    // Ou redirecionar
    // callback({ redirectURL: 'https://...' });
  }
);
```

**Complexidade:** 🟢 Baixa

---

## Cookies

### chrome.cookies.get()

**Uso na extensão:**
```javascript
chrome.cookies.get({
  url: 'https://pje.tjpa.jus.br',
  name: 'JSESSIONID'
}, (cookie) => {
  console.log('Cookie:', cookie);
});
```

**Equivalente no Electron:**
```javascript
const { session } = require('electron');

const cookies = await session.defaultSession.cookies.get({
  url: 'https://pje.tjpa.jus.br',
  name: 'JSESSIONID'
});
console.log('Cookie:', cookies[0]);
```

**Complexidade:** 🟢 Baixa

---

### chrome.cookies.set()

**Uso na extensão:**
```javascript
chrome.cookies.set({
  url: 'https://pje.tjpa.jus.br',
  name: 'customCookie',
  value: 'valor123',
  expirationDate: Date.now() / 1000 + 3600
});
```

**Equivalente no Electron:**
```javascript
await session.defaultSession.cookies.set({
  url: 'https://pje.tjpa.jus.br',
  name: 'customCookie',
  value: 'valor123',
  expirationDate: Date.now() / 1000 + 3600
});
```

**Complexidade:** 🟢 Baixa

---

## Fetch com Credentials

### Fetch na extensão

**Uso na extensão:**
```javascript
// Content script tem acesso aos cookies automaticamente
fetch('https://pje.tjpa.jus.br/api/documento/123', {
  credentials: 'include'  // Envia cookies
})
.then(res => res.blob())
.then(blob => {
  // Processar documento
});
```

**Equivalente no Electron:**

**No BrowserView (igual à extensão):**
```javascript
// JavaScript executado no contexto da página
pjeView.webContents.executeJavaScript(`
  fetch('https://pje.tjpa.jus.br/api/documento/123', {
    credentials: 'include'
  })
  .then(res => res.blob())
  .then(blob => blob.arrayBuffer())
  .then(buffer => Array.from(new Uint8Array(buffer)))
`).then(arrayBuffer => {
  // Processar no main process
});
```

**No Main Process (com cookies manuais):**
```javascript
const fetch = require('node-fetch');

// Obter cookies
const cookies = await session.defaultSession.cookies.get({
  url: 'https://pje.tjpa.jus.br'
});

const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

// Fetch com cookies
const response = await fetch('https://pje.tjpa.jus.br/api/documento/123', {
  headers: {
    'Cookie': cookieHeader
  }
});
```

**Complexidade:** 🟡 Média

---

## Notificações

### chrome.notifications.create()

**Uso na extensão:**
```javascript
chrome.notifications.create({
  type: 'basic',
  iconUrl: 'icon.png',
  title: 'LEX',
  message: 'Análise concluída!'
});
```

**Equivalente no Electron:**
```javascript
const { Notification } = require('electron');

new Notification({
  title: 'LEX',
  body: 'Análise concluída!',
  icon: path.join(__dirname, '../../assets/icon.png')
}).show();
```

**Complexidade:** 🟢 Baixa

---

## Clipboard

**Uso na extensão:**
```javascript
// Via navigator.clipboard (Web API padrão)
navigator.clipboard.writeText('texto copiado');
```

**Equivalente no Electron:**
```javascript
// Mesma API funciona no renderer
navigator.clipboard.writeText('texto copiado');

// Ou via módulo clipboard do Electron (main process)
const { clipboard } = require('electron');
clipboard.writeText('texto copiado');
```

**Complexidade:** 🟢 Baixa

---

## Download de Arquivos

**Uso na extensão:**
```javascript
// Content script cria link e clica
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'arquivo.pdf';
a.click();
```

**Equivalente no Electron:**
```javascript
const { dialog } = require('electron');
const fs = require('fs');

// Salvar arquivo
const { filePath } = await dialog.showSaveDialog({
  defaultPath: 'arquivo.pdf'
});

if (filePath) {
  fs.writeFileSync(filePath, buffer);
}

// Ou download automático
const downloadPath = app.getPath('downloads');
const filePath = path.join(downloadPath, 'arquivo.pdf');
fs.writeFileSync(filePath, buffer);
```

**Complexidade:** 🟢 Baixa

---

## Resumo de Complexidade

| API Chrome | Equivalente Electron | Complexidade | Notas |
|------------|---------------------|--------------|-------|
| runtime.getURL() | path.join() | 🟢 Baixa | Paths relativos/absolutos |
| runtime.sendMessage() | ipcRenderer.invoke() | 🟡 Média | IPC em vez de messaging |
| storage.local | localStorage / electron-store | 🟢 Baixa | electron-store recomendado |
| tabs.* | BrowserWindow/View | 🟡 Média | Conceito diferente |
| scripting.executeScript() | webContents.executeJavaScript() | 🟢 Baixa | API similar |
| Content scripts | Preload / manual injection | 🟡 Média | Preload para setup |
| webRequest | session.webRequest | 🟢 Baixa | API similar |
| cookies | session.cookies | 🟢 Baixa | API similar |
| fetch credentials | Igual / manual cookies | 🟡 Média | BrowserView = igual |
| notifications | Notification API | 🟢 Baixa | API similar |

---

## Checklist de Migração

### APIs a Substituir

- [ ] Todos os `chrome.runtime.getURL()` → paths relativos
- [ ] Todos os `chrome.runtime.sendMessage()` → IPC
- [ ] Todos os `chrome.storage.local` → localStorage/electron-store
- [ ] Listeners `chrome.runtime.onMessage` → ipcMain.handle()
- [ ] `chrome.tabs.*` → BrowserWindow/View equivalentes
- [ ] Content scripts → Preload scripts ou injeção manual
- [ ] `chrome.webRequest.*` → session.webRequest
- [ ] `chrome.cookies.*` → session.cookies

### Novos Conceitos

- [ ] Entender IPC (invoke/handle vs send/on)
- [ ] Entender contextBridge e contextIsolation
- [ ] Entender BrowserView vs BrowserWindow
- [ ] Entender Preload scripts
- [ ] Entender Main process vs Renderer process

---

## Exemplos Práticos

### Exemplo 1: Enviar e Receber Mensagem

**Extensão:**
```javascript
// content-simple.js
chrome.runtime.sendMessage({ action: 'analyze' }, (response) => {
  console.log(response.result);
});

// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'analyze') {
    const result = doAnalysis();
    sendResponse({ result });
  }
  return true;
});
```

**Electron:**
```javascript
// renderer/chat-controller.js
const result = await window.electronAPI.analyze();
console.log(result);

// preload/preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  analyze: () => ipcRenderer.invoke('analyze')
});

// main/main.js
ipcMain.handle('analyze', async (event) => {
  const result = await doAnalysis();
  return result;
});
```

### Exemplo 2: Salvar e Ler Storage

**Extensão:**
```javascript
// Salvar
chrome.storage.local.set({ history: [...] });

// Ler
chrome.storage.local.get(['history'], (result) => {
  console.log(result.history);
});
```

**Electron:**
```javascript
// Salvar
localStorage.setItem('history', JSON.stringify([...]));

// Ler
const history = JSON.parse(localStorage.getItem('history') || '[]');
```

### Exemplo 3: Executar Script na Página

**Extensão:**
```javascript
chrome.scripting.executeScript({
  target: { tabId },
  func: () => document.querySelector('.processo-numero').textContent
}, (results) => {
  console.log('Número:', results[0].result);
});
```

**Electron:**
```javascript
const numero = await pjeView.webContents.executeJavaScript(`
  document.querySelector('.processo-numero').textContent
`);
console.log('Número:', numero);
```

---

**Última atualização:** 2025-12-10
