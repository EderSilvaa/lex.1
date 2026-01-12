"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Enable Hot Reload in Development
if (!electron_1.app.isPackaged) {
    try {
        require('electron-reload')(__dirname, {
            electron: path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe'),
            awaitWriteFinish: true
        });
    }
    catch (e) {
        console.error('Error loading electron-reload', e);
    }
}
// Initialize store (wrapping in async IIFE if needed or top level if supported)
// Note: electron-store is ESM. We might need to handle this.
// For now, let's assume we can use it or we'll fix it if we get an error.
// A safe bet is using a dynamic import or require if it was CJS, but it is ESM.
// We will try dynamic import in initialization if top level fails, but TS might complain.
// Actually, let's use a simple file based storage for now if store is complex, OR just standard approach.
// Let's try standard import. passing 'module': 'commonjs' in tsconfig might cause issue with 'import Store'.
// We will simply use `const Store = require('electron-store');` if it was CJS, but it's not.
// We'll write it as standard import and rely on a possibly adapted environment or just fix it later.
let mainWindow = null;
let store;
// Prompt Engineering Logic (Ported from Extension)
function detectarTipoConversa(pergunta) {
    const perguntaLower = pergunta.toLowerCase();
    // Cumprimento
    if (/^(oi|olá|e aí|tudo bem|como vai)/i.test(pergunta))
        return 'cumprimento';
    // Análise técnica
    if (perguntaLower.includes('analisar') || perguntaLower.includes('análise'))
        return 'analise_tecnica';
    // Prazos
    if (perguntaLower.includes('prazo') || perguntaLower.includes('quando'))
        return 'prazos';
    // Explicação
    if (perguntaLower.includes('o que é') || perguntaLower.includes('explique'))
        return 'explicacao';
    // Estratégia
    if (perguntaLower.includes('próximos passos') || perguntaLower.includes('estratégia') || perguntaLower.includes('como proceder'))
        return 'estrategia';
    // Automação
    if (perguntaLower.includes('consultar') || perguntaLower.includes('abrir') || perguntaLower.includes('navegar') || perguntaLower.includes('preencher') || perguntaLower.includes('processo'))
        return 'automacao';
    return 'conversa_geral';
}
function obterPromptBase(tipo) {
    const prompts = {
        cumprimento: `Você é Lex, uma assistente jurídica amigável e acessível. Responda de forma calorosa e natural, como uma colega experiente.`,
        analise_tecnica: `Você é Lex, especialista em análise processual. Faça uma análise técnica mas acessível, como se estivesse explicando para um colega.`,
        prazos: `Você é Lex, especialista em prazos processuais. Seja precisa com datas e artigos de lei, mas mantenha um tom acessível e prático.`,
        explicacao: `Você é Lex, educadora jurídica. Explique conceitos de forma didática, usando exemplos práticos quando possível.`,
        estrategia: `Você é Lex, consultora estratégica. Apresente opções e recomendações como uma mentora experiente daria conselhos.`,
        automacao: `Você é Lex, uma agente de automação capaz de operar o sistema PJe. Seu objetivo é traduzir o pedido do usuário em um plano de execução JSON preciso.`,
        conversa_geral: `Você é Lex, assistente jurídica conversacional. Responda de forma natural e útil, adaptando seu tom ao contexto da pergunta.`
    };
    return prompts[tipo] || prompts['conversa_geral'] || '';
}
function obterInstrucoesEspecificas(tipo) {
    const instrucoes = {
        cumprimento: `Responda de forma amigável e pergunte como posso ajudar com o processo. Máximo 2-3 linhas.`,
        analise_tecnica: `• <strong>Análise:</strong> O que identifiquei no documento
• <strong>Próximos passos:</strong> O que precisa ser feito
• <strong>Observações:</strong> Pontos de atenção
Máximo 300 palavras, use HTML simples.

IMPORTANTE: Antes de responder, pense passo a passo sobre sua análise. Coloque seu pensamento dentro de tags <thinking>...</thinking>.

OBS: Se você precisar buscar jurisprudência ou pesquisar algo na web, adicione o campo 'search_query' ao JSON de resposta com o termo de busca.`,
        prazos: `• <strong>Prazo:</strong> Data/período exato
• <strong>Fundamento:</strong> Artigo de lei aplicável  
• <strong>Consequência:</strong> O que acontece se não cumprir
• <strong>Dica:</strong> Como se organizar
Use HTML simples, máximo 250 palavras.

IMPORTANTE: Antes de responder, pense passo a passo sobre sua análise. Coloque seu pensamento dentro de tags <thinking>...</thinking>.`,
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
        automacao: `Para realizar automações no PJe, você deve responder ESTRITAMENTE com um objeto JSON contendo o plano de execução.
        
O formato deve ser:
\`\`\`json
{
  "intent": {
    "type": "automation",
    "description": "Texto curto descrevendo o que será feito (ex: Navegando para o processo...)"
  },
  "steps": [
    {
      "order": 1,
      "type": "navigate | click | fill | read | wait",
      "description": "Descrição do passo",
      "url": "URL se for navegação",
      "selector": "CSS Selector do elemento",
      "value": "Valor para preencher (se type=fill)",
      "duration": 1000 (ms, se type=wait)
    }
  ]
}
\`\`\`

URLs Úteis do PJe TJPA:
- Login: https://pje.tjpa.jus.br/pje/login.seam
- Painel: https://pje.tjpa.jus.br/pje/Processo/ConsultaProcesso/listView.seam
- Consulta: https://pje.tjpa.jus.br/pje/Processo/ConsultaProcesso/listView.seam

SEMPRE use seletores genéricos ou visuais quando possível, ou IDs específicos se souber.
Responda APENAS com o bloco JSON.`,
        conversa_geral: `- Se for dúvida: seja didática
- Se for urgente: seja direta e prática  
- Se for complexa: quebre em partes
Use HTML simples, máximo 300 palavras.

IMPORTANTE: Antes de responder, pense passo a passo sobre sua resposta dentro de tags <thinking>...</thinking>.

OBS: Se o usuário pedir para pesquisar algo (ex: "busque decisões sobre X"), adicione o campo 'search_query' ao JSON de resposta com o termo de busca e defina intent.type = 'search_jurisprudence'.`
    };
    return instrucoes[tipo] || instrucoes['conversa_geral'] || '';
}
function criarPromptJuridico(contexto, pergunta) {
    const tipoConversa = detectarTipoConversa(pergunta);
    const promptBase = obterPromptBase(tipoConversa);
    // Simple context formatting
    const contextStr = JSON.stringify(contexto, null, 2);
    return `${promptBase}\n\nCONTEXTO DO PROCESSO:\n${contextStr}\n\nPERGUNTA: ${pergunta}\n\n${obterInstrucoesEspecificas(tipoConversa)}`;
}
const DEFAULT_SUPABASE_URL = 'https://nspauxzztflgmxjgevmo.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcGF1eHp6dGZsZ214amdldm1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MTI4ODUsImV4cCI6MjA3MDE4ODg4NX0.XXJf6alnb6me4PeMCA80UmfJVUZo8VxA0BFDdFCtN1A';
function initStore() {
    return __awaiter(this, void 0, void 0, function* () {
        // @ts-ignore
        const { default: Store } = yield Promise.resolve().then(() => __importStar(require('electron-store')));
        store = new Store();
        // Initialize default credentials if missing
        if (!store.has('supabaseUrl')) {
            store.set('supabaseUrl', DEFAULT_SUPABASE_URL);
        }
        if (!store.has('supabaseKey')) {
            store.set('supabaseKey', DEFAULT_SUPABASE_KEY);
        }
    });
}
// AI Chat Handler
electron_1.ipcMain.handle('ai-chat-send', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { message, context }) {
    var _b;
    if (!store)
        return { error: 'Store not initialized' };
    const supabaseUrl = store.get('supabaseUrl');
    const supabaseKey = store.get('supabaseKey');
    // Changed to OPENIA endpoint which is known to work
    const functionUrl = `${supabaseUrl}/functions/v1/OPENIA`;
    try {
        console.log('🤖 Sending to AI (OPENIA)...');
        // Apply Prompt Engineering
        const messageStr = message || '';
        const systemPrompt = criarPromptJuridico(context || {}, messageStr);
        console.log('🤖 System Prompt Type:', detectarTipoConversa(messageStr));
        // Using global fetch (available in Node 18+ / Electron)
        const response = yield fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey // Required for OPENIA endpoint
            },
            body: JSON.stringify({
                pergunta: systemPrompt, // Send the engineered prompt
                contexto: JSON.stringify(context || {})
            })
        });
        if (!response.ok) {
            const errText = yield response.text();
            console.error('AI Error:', errText);
            throw new Error(`AI Request failed: ${response.status} ${errText}`);
        }
        // Handle SSE Stream
        const reader = (_b = response.body) === null || _b === void 0 ? void 0 : _b.getReader();
        if (!reader)
            throw new Error('Response body is null or not readable');
        const decoder = new TextDecoder();
        let fullText = '';
        let done = false;
        while (!done) {
            const { value, done: isDone } = yield reader.read();
            done = isDone;
            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataVal = line.slice(6).trim();
                        if (dataVal === '[DONE]')
                            continue;
                        try {
                            const parsed = JSON.parse(dataVal);
                            if (parsed.text)
                                fullText += parsed.text;
                            // Fallback for non-streamed responses or different formats
                            if (parsed.resposta)
                                fullText += parsed.resposta;
                        }
                        catch (e) {
                            // Ignora linhas que não são JSON válido
                        }
                    }
                }
            }
        }
        // Fallback: if fullText is empty, maybe it wasn't a stream or format was different.
        // But OPENIA is known to be SSE. If it was a simple JSON, the loop might need adjustment,
        // but typically fetch handles non-stream body specifically. 
        // With 'OPENIA', we know it returns SSE/JSON stream.
        console.log('🤖 AI Response received:', fullText.substring(0, 50) + '...');
        // PARSE AI RESPONSE (Extract JSON if present)
        let aiPlan = {
            intent: {
                description: fullText || 'Sem resposta da IA.'
            }
        };
        try {
            // Strategy 1: Look for markdown code block
            const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
            let potentialJson = "";
            if (jsonMatch && jsonMatch[1]) {
                potentialJson = jsonMatch[1];
            }
            else {
                // Strategy 2: Find outermost curly braces (ignoring thinking tag if possible)
                // We'll search from the end to find the last '}' and match its pair?
                // Or just first '{' after </thinking>
                const thinkingEnd = fullText.indexOf('</thinking>');
                const searchStart = (thinkingEnd !== -1) ? thinkingEnd + 11 : 0;
                const start = fullText.indexOf('{', searchStart);
                const end = fullText.lastIndexOf('}');
                if (start !== -1 && end !== -1 && end > start) {
                    potentialJson = fullText.substring(start, end + 1);
                }
            }
            if (potentialJson) {
                const parsed = JSON.parse(potentialJson);
                // If successful:
                aiPlan = Object.assign(Object.assign({}, parsed), { intent: Object.assign(Object.assign({}, (parsed.intent || {})), { description: fullText // Always keep full log
                     }) });
                if (parsed.search_query) {
                    aiPlan.search_query = parsed.search_query;
                    // Force intent type if missing
                    if (!aiPlan.intent.type)
                        aiPlan.intent.type = 'search_jurisprudence';
                }
            }
        }
        catch (e) {
            console.log('⚠️ Could not parse structured JSON from response, using raw text.', e);
        }
        return { plan: aiPlan };
    }
    catch (error) {
        console.error('AI Connection Failed:', error);
        return { error: error.message };
    }
}));
const browser_manager_1 = require("./browser-manager");
let browserManager;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400, // Wider for split view
        height: 900,
        titleBarStyle: 'hidden', // Look "modern"
        titleBarOverlay: {
            color: '#1e1e1e',
            symbolColor: '#ffffff'
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });
    browserManager = new browser_manager_1.BrowserManager(mainWindow);
    // Dashboard Mode Switching (Refactored for Split View constraints)
    electron_1.ipcMain.handle('dashboard-set-mode', (_event, mode) => __awaiter(this, void 0, void 0, function* () {
        // We rely on Renderer to tell us Layout Bounds via 'browser-layout-update'
        if (mode === 'pje') {
            // Ensure at least one tab exists
            if (!browserManager.activeTab) {
                browserManager.createTab('https://pje.tjpa.jus.br/pje/login.seam');
            }
            else {
                browserManager.showView();
            }
        }
        else {
            // If leaving PJe mode, hide the browser view
            browserManager.hideView();
        }
    }));
    // Load the local dashboard file
    if (electron_1.app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    }
    else {
        // In dev, we can link directly to the source
        mainWindow.loadFile(path.join(process.cwd(), 'src/renderer/index.html'));
    }
    // Open DevTools in dev mode
    if (!electron_1.app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }
    // Note: We REMOVED the default injection on mainWindow, because it loads Dashboard.
}
// Register protocol
electron_1.app.whenReady().then(() => {
    const { protocol } = require('electron');
    protocol.registerFileProtocol('lex-extension', (request, callback) => {
        const url = request.url.replace('lex-extension://', '');
        // We assume files are in the root directory or subdirectories
        // Caution: security risk if not sanitized, but for local app it's acceptable for now
        const filePath = path.join(__dirname, '..', url); // __dirname is electron/ or dist-electron/, parent is root
        callback({ path: filePath });
    });
});
// File System Handlers
electron_1.ipcMain.handle('files-select-folder', () => __awaiter(void 0, void 0, void 0, function* () {
    if (!mainWindow)
        return null;
    const result = yield electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled)
        return null;
    return result.filePaths[0]; // Return the selected path
}));
electron_1.ipcMain.handle('files-list', (_event, folderPath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const items = yield fs.promises.readdir(folderPath, { withFileTypes: true });
        // Filter and map
        const files = items
            .filter(item => !item.name.startsWith('.')) // Ignore hidden
            .map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join(folderPath, item.name)
        }));
        // Sort: directories first
        files.sort((a, b) => {
            if (a.isDirectory === b.isDirectory)
                return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
        return files;
    }
    catch (e) {
        console.error('Error listing files:', e);
        return [];
    }
}));
function injectLexScripts(target) {
    return __awaiter(this, void 0, void 0, function* () {
        const webContents = 'webContents' in target ? target.webContents : target;
        const currentUrl = webContents.getURL();
        console.log('Checking injection for:', currentUrl);
        // Inject Polyfill FIRST
        try {
            const polyfillPath = path.join(__dirname, 'polyfill.js');
            if (fs.existsSync(polyfillPath)) {
                const polyfillContent = fs.readFileSync(polyfillPath, 'utf8');
                yield webContents.executeJavaScript(polyfillContent);
            }
            else {
                // If running from dist-electron, polyfill might be in ../electron/polyfill.js or we need to copy it
                // Let's try to resolve it. If __dirname is dist-electron, polyfill.js might not be there unless copied.
                // We should check ../electron/polyfill.js too
                const polyfillSrcPath = path.join(__dirname, '../electron/polyfill.js');
                if (fs.existsSync(polyfillSrcPath)) {
                    const polyfillContent = fs.readFileSync(polyfillSrcPath, 'utf8');
                    yield webContents.executeJavaScript(polyfillContent);
                }
            }
        }
        catch (e) {
            console.error('Error injecting polyfill:', e);
        }
        // INJECT OVERLAY (The Steering Wheel)
        try {
            // CSS Injection
            let overlayCssPath = path.join(__dirname, 'overlay.css');
            if (!fs.existsSync(overlayCssPath)) {
                // Fallback to source directory (Dev Mode)
                overlayCssPath = path.join(__dirname, '../electron/overlay.css');
            }
            if (fs.existsSync(overlayCssPath)) {
                const css = fs.readFileSync(overlayCssPath, 'utf8');
                webContents.insertCSS(css);
                console.log('✅ Overlay CSS Injected from:', overlayCssPath);
            }
            else {
                console.error('❌ Overlay CSS not found at:', overlayCssPath);
            }
            // JS Injection
            let overlayJsPath = path.join(__dirname, 'overlay.js');
            if (!fs.existsSync(overlayJsPath)) {
                // Fallback to source directory (Dev Mode)
                overlayJsPath = path.join(__dirname, '../electron/overlay.js');
            }
            if (fs.existsSync(overlayJsPath)) {
                const js = fs.readFileSync(overlayJsPath, 'utf8');
                yield webContents.executeJavaScript(js);
                console.log('✅ Overlay JS Injected from:', overlayJsPath);
            }
            else {
                console.error('❌ Overlay JS not found at:', overlayJsPath);
            }
        }
        catch (e) {
            console.error('Error injecting overlay:', e);
        }
        /*
        try {
            const manifestPath = path.join(__dirname, '../manifest.json');
            if (!fs.existsSync(manifestPath)) {
                console.error('Manifest not found at:', manifestPath);
                return;
            }
    
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const contentScripts = manifest.content_scripts;
    
            for (const script of contentScripts) {
                // ... (legacy injection logic commented out)
                // We are replacing this with the unified overlay.js
            }
        } catch (err) {
            console.error('Error reading manifest or injecting scripts:', err);
        }
        */
    });
}
const crawler_1 = require("./crawler");
// ... (existing code)
electron_1.app.whenReady().then(() => __awaiter(void 0, void 0, void 0, function* () {
    yield initStore();
    createWindow();
    (0, crawler_1.registerCrawlerHandlers)(); // LOGIN CRAWLER
    electron_1.app.on('activate', function () {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
}));
electron_1.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// IPC Handlers
electron_1.ipcMain.handle('save-history', (_event, messages) => __awaiter(void 0, void 0, void 0, function* () {
    if (store)
        store.set('chatHistory', messages);
    return { success: true };
}));
electron_1.ipcMain.handle('get-history', () => __awaiter(void 0, void 0, void 0, function* () {
    return store ? store.get('chatHistory', []) : [];
}));
electron_1.ipcMain.handle('save-preferences', (_event, prefs) => __awaiter(void 0, void 0, void 0, function* () {
    if (store)
        store.set('userPreferences', prefs);
    return { success: true };
}));
// Workspace Management
electron_1.ipcMain.handle('workspace-get', () => __awaiter(void 0, void 0, void 0, function* () {
    return store ? store.get('workspaces', []) : [];
}));
electron_1.ipcMain.handle('workspace-add', (_event, path) => __awaiter(void 0, void 0, void 0, function* () {
    if (!store)
        return { success: false };
    const workspaces = store.get('workspaces', []);
    if (!workspaces.includes(path)) {
        workspaces.push(path);
        store.set('workspaces', workspaces);
    }
    return { success: true, workspaces };
}));
electron_1.ipcMain.handle('workspace-remove', (_event, path) => __awaiter(void 0, void 0, void 0, function* () {
    if (!store)
        return { success: false };
    let workspaces = store.get('workspaces', []);
    workspaces = workspaces.filter(w => w !== path);
    store.set('workspaces', workspaces);
    return { success: true, workspaces };
}));
// Browser/PJe IPC Handlers
electron_1.ipcMain.handle('browser-layout-update', (_event, bounds) => {
    // Renderer sends us the calculated "hole" for the browser {x, y, width, height}
    browserManager.updateBounds(bounds);
});
electron_1.ipcMain.handle('browser-tab-new', (_event, url) => {
    browserManager.createTab(url || 'https://pje.tjpa.jus.br/pje/login.seam');
});
electron_1.ipcMain.handle('browser-tab-switch', (_event, tabId) => {
    browserManager.setActiveTab(tabId);
});
electron_1.ipcMain.handle('browser-tab-close', (_event, tabId) => {
    browserManager.closeTab(tabId);
});
// Legacy PJe Hooks (mapped to active tab)
electron_1.ipcMain.handle('pje-navigate', (_event, url) => __awaiter(void 0, void 0, void 0, function* () {
    yield browserManager.navigateTo(url);
}));
electron_1.ipcMain.handle('pje-execute-script', (_event, script) => __awaiter(void 0, void 0, void 0, function* () {
    return yield browserManager.executeScript(script);
}));
// LEX EXECUTION ENGINE
// ====================
function executePlan(plan) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!plan || !plan.steps)
            return { error: "Plano inválido" };
        const webContents = (_a = browserManager.activeTab) === null || _a === void 0 ? void 0 : _a.view.webContents;
        if (!webContents)
            return { error: "Nenhuma aba ativa para automação" };
        for (const step of plan.steps) {
            console.log(`[EXEC] Step ${step.order}: ${step.type}`);
            // Simular Human Delay (0.5s - 1.5s)
            const delay = Math.floor(Math.random() * 1000) + 500;
            yield new Promise(r => setTimeout(r, delay));
            try {
                switch (step.type) {
                    case 'click':
                        if (step.selector) {
                            yield webContents.executeJavaScript(`
                            const el = document.querySelector('${step.selector}');
                            if(el) el.click();
                        `);
                        }
                        break;
                    case 'fill':
                        if (step.selector && step.value) {
                            yield webContents.executeJavaScript(`
                            const el = document.querySelector('${step.selector}');
                            if(el) { el.value = '${step.value}'; el.dispatchEvent(new Event('input', {bubbles:true})); }
                        `);
                        }
                        break;
                    case 'navigate':
                        if (step.url) {
                            yield webContents.loadURL(step.url);
                        }
                        break;
                    case 'read':
                        // Extract text from multiple selectors
                        // Expected step format: { type: 'read', selectors: [ { key: 'num_wprocesso', selector: '...' } ] }
                        if (step.selectors && Array.isArray(step.selectors)) {
                            const extractedData = yield webContents.executeJavaScript(`
                            (function() {
                                const result = {};
                                const selectors = ${JSON.stringify(step.selectors)};
                                selectors.forEach(item => {
                                    const el = document.querySelector(item.selector);
                                    result[item.key] = el ? el.innerText.trim() : 'N/A';
                                });
                                return result;
                            })()
                        `);
                            console.log('[EXEC] Read Data:', extractedData);
                            // Save this data to the global context or define where it goes?
                            // For now we just log it, but typically we want to return it.
                            // Let's attach to the plan result if possible, or send an IPC event?
                            // Simple way: Return it in the final object.
                            if (!plan.data)
                                plan.data = {};
                            Object.assign(plan.data, extractedData);
                        }
                        break;
                    case 'saveFile':
                        // Save content to a file
                        // Expected step format: { type: 'saveFile', fileName: 'resumo.md', content: '...' }
                        // If content is missing, maybe use the last extracted data?
                        // For now, assume explicit content string (Generated by AI previously)
                        if (step.fileName && step.content) {
                            // Ideally we use the user's active workspace.
                            // Let's use the first workspace if available, or just Documents/Lex
                            let targetDir = store && store.get('workspaces') && store.get('workspaces')[0]
                                ? store.get('workspaces')[0]
                                : path.join(electron_1.app.getPath('documents'), 'Lex');
                            if (!fs.existsSync(targetDir))
                                fs.mkdirSync(targetDir, { recursive: true });
                            const fullPath = path.join(targetDir, step.fileName);
                            fs.writeFileSync(fullPath, step.content, 'utf8');
                            console.log('[EXEC] File saved:', fullPath);
                        }
                        break;
                    case 'wait':
                        // Wait is handled by the loop delay + potential extra wait
                        if (step.duration) {
                            yield new Promise(r => setTimeout(r, step.duration));
                        }
                        break;
                }
            }
            catch (err) {
                console.error(`[EXEC] Error on step ${step.order}:`, err);
                return { error: `Erro no passo ${step.order}: ${err.message}` };
            }
        }
        return { success: true, data: plan.data };
    });
}
electron_1.ipcMain.handle('ai-plan-execute', (_event, plan) => __awaiter(void 0, void 0, void 0, function* () {
    return yield executePlan(plan);
}));
//# sourceMappingURL=main.js.map