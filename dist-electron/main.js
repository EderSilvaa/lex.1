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
// Agent module loaded dynamically after app ready
let agentModule = null;
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
const approvedWorkspaceSelections = new Set();
const approvedFileSelections = new Set();
function normalizeFsPath(targetPath) {
    return path.resolve(String(targetPath || ''));
}
function isWithinDirectory(targetPath, baseDir) {
    const normalizedTarget = normalizeFsPath(targetPath);
    const normalizedBase = normalizeFsPath(baseDir);
    const relative = path.relative(normalizedBase, normalizedTarget);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function getWorkspaceRoots() {
    if (!store)
        return [];
    const workspaces = store.get('workspaces', []);
    return workspaces
        .filter((workspacePath) => typeof workspacePath === 'string' && workspacePath.trim().length > 0)
        .map(normalizeFsPath);
}
function isWorkspacePathAllowed(targetPath) {
    const roots = getWorkspaceRoots();
    if (roots.length === 0)
        return false;
    return roots.some(root => isWithinDirectory(targetPath, root));
}
function isPathApprovedForRead(targetPath) {
    const normalized = normalizeFsPath(targetPath);
    return isWorkspacePathAllowed(normalized) || approvedFileSelections.has(normalized);
}
function isPathApprovedForWrite(targetPath) {
    const normalized = normalizeFsPath(targetPath);
    return isWorkspacePathAllowed(normalized) || approvedFileSelections.has(normalized);
}
const ALLOWED_AUTOMATION_HOSTS = new Set(['pje.tjpa.jus.br']);
const ALLOWED_AUTOMATION_PROTOCOLS = new Set(['https:']);
const DEFAULT_PJE_URL = 'https://pje.tjpa.jus.br/pje/login.seam';
const MAX_PLAN_STEPS = 30;
const MAX_STEP_DURATION_MS = 30000;
const MAX_STEP_STRING_LENGTH = 2000;
const MAX_READ_SELECTORS = 30;
const MAX_SAVEFILE_CONTENT_LENGTH = 1000000;
function normalizeAllowedAutomationUrl(rawUrl) {
    if (typeof rawUrl !== 'string')
        return null;
    const trimmed = rawUrl.trim();
    if (!trimmed)
        return null;
    try {
        const parsed = new URL(trimmed);
        if (!ALLOWED_AUTOMATION_PROTOCOLS.has(parsed.protocol))
            return null;
        if (!ALLOWED_AUTOMATION_HOSTS.has(parsed.hostname.toLowerCase()))
            return null;
        return parsed.toString();
    }
    catch (_error) {
        return null;
    }
}
function sanitizeFileName(fileName) {
    const normalized = path.basename(String(fileName || '').trim());
    return normalized
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .slice(0, 120);
}
function normalizeStepString(value) {
    return String(value !== null && value !== void 0 ? value : '').trim().slice(0, MAX_STEP_STRING_LENGTH);
}
function sanitizeExecutionPlan(plan) {
    var _a;
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps)) {
        return { ok: false, error: 'Plano inválido: steps ausente' };
    }
    if (plan.steps.length === 0 || plan.steps.length > MAX_PLAN_STEPS) {
        return { ok: false, error: `Plano inválido: steps deve ter entre 1 e ${MAX_PLAN_STEPS}` };
    }
    const sanitizedSteps = [];
    for (let i = 0; i < plan.steps.length; i++) {
        const rawStep = plan.steps[i];
        const stepType = normalizeStepString(rawStep === null || rawStep === void 0 ? void 0 : rawStep.type);
        const order = Number.isFinite(rawStep === null || rawStep === void 0 ? void 0 : rawStep.order) ? Number(rawStep.order) : i + 1;
        if (!stepType) {
            return { ok: false, error: `Plano inválido: passo ${i + 1} sem tipo` };
        }
        if (stepType === 'click') {
            const selector = normalizeStepString(rawStep.selector);
            if (!selector)
                return { ok: false, error: `Plano inválido: click sem selector (passo ${order})` };
            sanitizedSteps.push({ order, type: 'click', selector });
            continue;
        }
        if (stepType === 'fill') {
            const selector = normalizeStepString(rawStep.selector);
            const value = normalizeStepString(rawStep.value);
            if (!selector || !value)
                return { ok: false, error: `Plano inválido: fill incompleto (passo ${order})` };
            sanitizedSteps.push({ order, type: 'fill', selector, value });
            continue;
        }
        if (stepType === 'navigate') {
            const safeUrl = normalizeAllowedAutomationUrl(normalizeStepString(rawStep.url));
            if (!safeUrl)
                return { ok: false, error: `Plano inválido: URL não permitida (passo ${order})` };
            sanitizedSteps.push({ order, type: 'navigate', url: safeUrl });
            continue;
        }
        if (stepType === 'read') {
            if (!Array.isArray(rawStep.selectors) || rawStep.selectors.length === 0 || rawStep.selectors.length > MAX_READ_SELECTORS) {
                return { ok: false, error: `Plano inválido: read.selectors inválido (passo ${order})` };
            }
            const selectors = [];
            for (let idx = 0; idx < rawStep.selectors.length; idx++) {
                const item = rawStep.selectors[idx];
                const key = normalizeStepString((item === null || item === void 0 ? void 0 : item.key) || `field_${idx + 1}`);
                const selector = normalizeStepString(item === null || item === void 0 ? void 0 : item.selector);
                if (!selector) {
                    return { ok: false, error: `Plano invÃ¡lido: selector vazio em read (passo ${order})` };
                }
                if (!selector)
                    throw new Error(`Plano inválido: selector vazio em read (passo ${order})`);
                selectors.push({ key, selector });
            }
            sanitizedSteps.push({ order, type: 'read', selectors });
            continue;
        }
        if (stepType === 'saveFile') {
            const fileName = sanitizeFileName(normalizeStepString(rawStep.fileName));
            const content = String((_a = rawStep.content) !== null && _a !== void 0 ? _a : '');
            if (!fileName)
                return { ok: false, error: `Plano inválido: saveFile sem fileName (passo ${order})` };
            if (!content || content.length > MAX_SAVEFILE_CONTENT_LENGTH) {
                return { ok: false, error: `Plano inválido: saveFile com conteúdo inválido (passo ${order})` };
            }
            sanitizedSteps.push({ order, type: 'saveFile', fileName, content });
            continue;
        }
        if (stepType === 'wait') {
            const durationRaw = Number(rawStep.duration);
            const duration = Number.isFinite(durationRaw)
                ? Math.min(Math.max(durationRaw, 0), MAX_STEP_DURATION_MS)
                : 0;
            sanitizedSteps.push({ order, type: 'wait', duration });
            continue;
        }
        return { ok: false, error: `Plano inválido: tipo de passo não permitido (${stepType})` };
    }
    return {
        ok: true,
        plan: {
            steps: sanitizedSteps,
            data: {}
        }
    };
}
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
    if (perguntaLower.includes('consultar') || perguntaLower.includes('abrir') || perguntaLower.includes('navegar') || perguntaLower.includes('preencher') || perguntaLower.includes('processo') || perguntaLower.includes('acesse') || perguntaLower.includes('acessar') || perguntaLower.includes('vá para') || perguntaLower.includes('entrar'))
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
      
      IMPORTANTE (LOGIN 2FA):
      O sistema PJe exige 2FA (Token/Certificado). NÃO tente preencher senha ou clicar em 'Entrar'.
      Se a tarefa exigir login (ex: consultar processo), seu plano deve:
      1. Navegar para a página de login.
      2. Adicionar um passo do tipo 'wait' com mensagem para o usuário logar.
      3. ENCERRAR o plano ali, ou continuar assumindo que o usuário fará o login.
      
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
function initStore() {
    return __awaiter(this, void 0, void 0, function* () {
        // @ts-ignore
        const { default: Store } = yield Promise.resolve().then(() => __importStar(require('electron-store')));
        store = new Store();
        // Inicializa chave Anthropic se não existir
        if (!store.has('anthropicKey')) {
            store.set('anthropicKey', '');
        }
        // Inicializa AI handler com Claude
        const { initAI } = yield Promise.resolve().then(() => __importStar(require('./ai-handler')));
        initAI({
            provider: 'anthropic',
            apiKey: store.get('anthropicKey') || ''
        });
    });
}
// Configura chave Anthropic via IPC (para UI de configurações)
electron_1.ipcMain.handle('store-set-anthropic-key', (_event, key) => __awaiter(void 0, void 0, void 0, function* () {
    if (!store)
        return { error: 'Store not initialized' };
    store.set('anthropicKey', key);
    const { initAI } = yield Promise.resolve().then(() => __importStar(require('./ai-handler')));
    initAI({ provider: 'anthropic', apiKey: key });
    return { success: true };
}));
// AI Chat Handler
electron_1.ipcMain.handle('ai-chat-send', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { message, context }) {
    var _b;
    if (!store)
        return { error: 'Store not initialized' };
    try {
        console.log('🤖 Sending to Claude (Anthropic)...');
        const messageStr = message || '';
        const systemPrompt = criarPromptJuridico(context || {}, messageStr);
        console.log('🤖 System Prompt Type:', detectarTipoConversa(messageStr));
        const { callAI } = yield Promise.resolve().then(() => __importStar(require('./ai-handler')));
        const fullText = yield callAI({
            system: systemPrompt,
            user: messageStr
        });
        console.log('🤖 Claude response received:', fullText.substring(0, 50) + '...');
        // PARSE AI RESPONSE (Extract JSON if present)
        let aiPlan = {
            intent: {
                description: fullText || 'Sem resposta da IA.'
            }
        };
        try {
            // Strategy 1: Look for markdown code block
            const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/) || fullText.match(/```\s*([\s\S]*?)\s*```/);
            let potentialJson = "";
            if (jsonMatch && jsonMatch[1]) {
                potentialJson = jsonMatch[1];
            }
            else {
                // Strategy 2: Energetic JSON Search
                // Find method that handles nested braces effectively? No, simplest is first '{' to last '}'
                // and try parsing. If it fails, try finding next '{', etc.
                // Cleanup thinking tags first
                let cleanText = fullText.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
                const start = cleanText.indexOf('{');
                const end = cleanText.lastIndexOf('}');
                if (start !== -1 && end !== -1 && end > start) {
                    potentialJson = cleanText.substring(start, end + 1);
                }
            }
            if (potentialJson) {
                const parsed = JSON.parse(potentialJson);
                // Normalizing Response
                aiPlan = Object.assign(Object.assign({}, parsed), { intent: Object.assign(Object.assign({}, (parsed.intent || {})), { 
                        // Use specific 'response' field if available, otherwise description, otherwise raw text
                        description: parsed.response || ((_b = parsed.intent) === null || _b === void 0 ? void 0 : _b.description) || fullText }) });
                // If the AI just gave a 'response' text but no intent, assume informative
                if (!aiPlan.intent.type) {
                    aiPlan.intent.type = 'informative';
                }
                if (parsed.search_query) {
                    aiPlan.search_query = parsed.search_query;
                    if (!aiPlan.intent.type || aiPlan.intent.type === 'informative')
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
let browserManager = null;
// Dashboard Mode Switching (register once)
electron_1.ipcMain.handle('dashboard-set-mode', (_event, mode) => __awaiter(void 0, void 0, void 0, function* () {
    if (!browserManager) {
        return { success: false, error: 'Browser manager not initialized' };
    }
    if (mode === 'pje') {
        if (!browserManager.activeTab) {
            browserManager.createTab('https://pje.tjpa.jus.br/pje/login.seam');
        }
        else {
            browserManager.showView();
        }
    }
    else {
        browserManager.hideView();
    }
    return { success: true };
}));
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
            sandbox: true
        }
    });
    browserManager = new browser_manager_1.BrowserManager(mainWindow);
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
    // Setup Agent event forwarding to renderer (async, no need to wait)
    setupAgentEventForwarding().catch(err => console.error('[Agent] Failed to setup events:', err));
    // Note: We REMOVED the default injection on mainWindow, because it loads Dashboard.
}
// Register protocol
electron_1.app.whenReady().then(() => {
    const { protocol } = require('electron');
    protocol.registerFileProtocol('lex-extension', (request, callback) => {
        try {
            const relativeUrl = decodeURIComponent(request.url.replace('lex-extension://', ''));
            const rootDir = path.resolve(__dirname, '..');
            const requestedPath = path.resolve(rootDir, relativeUrl);
            if (!isWithinDirectory(requestedPath, rootDir)) {
                callback({ error: -10 }); // ACCESS_DENIED
                return;
            }
            callback({ path: requestedPath });
        }
        catch (_error) {
            callback({ error: -324 }); // ERR_INVALID_URL
        }
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
    const firstPath = result.filePaths[0];
    if (!firstPath)
        return null;
    const selectedPath = normalizeFsPath(firstPath);
    approvedWorkspaceSelections.add(selectedPath);
    return selectedPath;
}));
electron_1.ipcMain.handle('files-list', (_event, folderPath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const normalizedFolderPath = normalizeFsPath(folderPath);
        if (!isWorkspacePathAllowed(normalizedFolderPath)) {
            return [];
        }
        const items = yield fs.promises.readdir(normalizedFolderPath, { withFileTypes: true });
        // Filter and map
        const files = items
            .filter(item => !item.name.startsWith('.')) // Ignore hidden
            .map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join(normalizedFolderPath, item.name)
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
// Lê arquivo e extrai texto (.txt, .docx, .pdf)
electron_1.ipcMain.handle('files-read', (_event, filePath) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const normalizedFilePath = normalizeFsPath(filePath);
        if (!isPathApprovedForRead(normalizedFilePath)) {
            return { success: false, error: 'Acesso negado ao arquivo fora de workspace autorizado' };
        }
        const ext = path.extname(normalizedFilePath).toLowerCase();
        if (ext === '.docx') {
            const mammoth = yield Promise.resolve().then(() => __importStar(require('mammoth')));
            const result = yield mammoth.extractRawText({ path: normalizedFilePath });
            return { success: true, text: result.value, type: 'docx' };
        }
        if (ext === '.pdf') {
            const pdfParseModule = yield Promise.resolve().then(() => __importStar(require('pdf-parse')));
            const buffer = yield fs.promises.readFile(normalizedFilePath);
            const pdfParseFn = (_a = pdfParseModule === null || pdfParseModule === void 0 ? void 0 : pdfParseModule.default) !== null && _a !== void 0 ? _a : pdfParseModule;
            if (typeof pdfParseFn !== 'function') {
                throw new Error('PDF parser unavailable');
            }
            const data = yield pdfParseFn(buffer);
            return { success: true, text: data.text, type: 'pdf' };
        }
        // .txt e outros arquivos de texto
        const text = yield fs.promises.readFile(normalizedFilePath, 'utf8');
        return { success: true, text, type: 'text' };
    }
    catch (e) {
        console.error('[Files] Erro ao ler arquivo:', e);
        return { success: false, error: e.message };
    }
}));
// Seleciona arquivo (dialog)
electron_1.ipcMain.handle('files-select-file', (_event, filters) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mainWindow)
        return null;
    const workspaces = getWorkspaceRoots();
    const result = yield electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        defaultPath: workspaces[0] || electron_1.app.getPath('documents'),
        filters: filters || [
            { name: 'Documentos', extensions: ['docx', 'pdf', 'txt'] },
            { name: 'Word', extensions: ['docx'] },
            { name: 'PDF', extensions: ['pdf'] },
            { name: 'Todos', extensions: ['*'] }
        ]
    });
    if (result.canceled)
        return null;
    const firstPath = result.filePaths[0];
    if (!firstPath)
        return null;
    const selectedPath = normalizeFsPath(firstPath);
    approvedFileSelections.add(selectedPath);
    return selectedPath;
}));
// Salva texto como .txt na pasta de documentos do escritório
electron_1.ipcMain.handle('files-save-document', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { name, content }) {
    try {
        if (!mainWindow)
            return { success: false, error: 'Janela não disponível' };
        const workspaces = getWorkspaceRoots();
        if (workspaces.length === 0) {
            return { success: false, error: 'Nenhum workspace autorizado para salvar arquivo' };
        }
        const primaryWorkspace = workspaces[0];
        if (!primaryWorkspace) {
            return { success: false, error: 'Workspace autorizado invalido' };
        }
        const result = yield electron_1.dialog.showSaveDialog(mainWindow, {
            defaultPath: path.join(primaryWorkspace, path.basename(name || 'documento.txt')),
            filters: [
                { name: 'Documento de Texto', extensions: ['txt'] },
                { name: 'Todos', extensions: ['*'] }
            ]
        });
        if (result.canceled || !result.filePath)
            return { success: false, error: 'Cancelado' };
        if (!isWorkspacePathAllowed(result.filePath)) {
            return { success: false, error: 'Destino fora de workspace autorizado' };
        }
        yield fs.promises.writeFile(result.filePath, content, 'utf8');
        approvedFileSelections.add(normalizeFsPath(result.filePath));
        return { success: true, path: result.filePath };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
}));
// Escreve conteúdo em arquivo existente
electron_1.ipcMain.handle('files-write', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { path: filePath, content }) {
    try {
        const normalizedFilePath = normalizeFsPath(filePath);
        if (!isPathApprovedForWrite(normalizedFilePath)) {
            return { success: false, error: 'Acesso negado ao caminho fora de workspace autorizado' };
        }
        yield fs.promises.writeFile(normalizedFilePath, content, 'utf8');
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message };
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
    return store ? getWorkspaceRoots() : [];
}));
electron_1.ipcMain.handle('workspace-add', (_event, path) => __awaiter(void 0, void 0, void 0, function* () {
    if (!store)
        return { success: false };
    const selectedPath = normalizeFsPath(path);
    if (!approvedWorkspaceSelections.has(selectedPath)) {
        return { success: false, error: 'Workspace nao autorizado pela selecao de pasta' };
    }
    approvedWorkspaceSelections.delete(selectedPath);
    const workspaces = getWorkspaceRoots();
    if (!workspaces.includes(selectedPath)) {
        workspaces.push(selectedPath);
        store.set('workspaces', workspaces);
    }
    return { success: true, workspaces };
}));
electron_1.ipcMain.handle('workspace-remove', (_event, path) => __awaiter(void 0, void 0, void 0, function* () {
    if (!store)
        return { success: false };
    const selectedPath = normalizeFsPath(path);
    let workspaces = store.get('workspaces', []);
    workspaces = workspaces.filter(w => normalizeFsPath(w) !== selectedPath);
    store.set('workspaces', workspaces);
    return { success: true, workspaces };
}));
// Browser/PJe IPC Handlers
electron_1.ipcMain.handle('browser-layout-update', (_event, bounds) => {
    // Renderer sends us the calculated "hole" for the browser {x, y, width, height}
    if (!browserManager)
        return;
    browserManager.updateBounds(bounds);
});
electron_1.ipcMain.handle('browser-tab-new', (_event, url) => {
    if (!browserManager)
        return { success: false, error: 'Browser manager not initialized' };
    const safeUrl = normalizeAllowedAutomationUrl(String(url || DEFAULT_PJE_URL));
    if (!safeUrl) {
        return { success: false, error: 'URL não permitida para nova aba' };
    }
    browserManager.createTab(safeUrl);
    return { success: true, url: safeUrl };
});
electron_1.ipcMain.handle('browser-tab-switch', (_event, tabId) => {
    if (!browserManager)
        return;
    browserManager.setActiveTab(tabId);
});
electron_1.ipcMain.handle('browser-tab-close', (_event, tabId) => {
    if (!browserManager)
        return;
    browserManager.closeTab(tabId);
});
// Legacy PJe Hooks (mapped to active tab)
electron_1.ipcMain.handle('pje-navigate', (_event, url) => __awaiter(void 0, void 0, void 0, function* () {
    if (!browserManager)
        return { success: false, error: 'Browser manager not initialized' };
    const safeUrl = normalizeAllowedAutomationUrl(String(url || ''));
    if (!safeUrl) {
        return { success: false, error: 'URL não permitida' };
    }
    yield browserManager.navigateTo(safeUrl);
    return { success: true };
}));
electron_1.ipcMain.handle('check-pje', () => __awaiter(void 0, void 0, void 0, function* () {
    if (!browserManager || !browserManager.activeTab) {
        return { connected: false, isPje: false, url: null };
    }
    const url = browserManager.activeTab.url;
    const isPje = typeof url === 'string' && url.includes('pje.');
    return { connected: true, isPje, url };
}));
// LEX EXECUTION ENGINE
// ====================
function executePlan(plan) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!browserManager)
            return { error: "Browser manager nao inicializado" };
        const validation = sanitizeExecutionPlan(plan);
        if (!validation.ok)
            return { error: validation.error };
        const safePlan = validation.plan;
        if (!plan || !plan.steps)
            return { error: "Plano inválido" };
        // Ensure active tab exists
        if (!browserManager.activeTab) {
            console.log('[EXEC] No active tab, creating default...');
            browserManager.createTab(DEFAULT_PJE_URL);
            // Wait a bit for view creation
            yield new Promise(r => setTimeout(r, 500));
        }
        const webContents = (_a = browserManager.activeTab) === null || _a === void 0 ? void 0 : _a.view.webContents;
        if (!webContents)
            return { error: "Falha ao criar aba de automação" };
        for (const step of safePlan.steps) {
            console.log(`[EXEC] Step ${step.order}: ${step.type}`);
            // Simular Human Delay (0.5s - 1.5s)
            const delay = Math.floor(Math.random() * 1000) + 500;
            yield new Promise(r => setTimeout(r, delay));
            try {
                switch (step.type) {
                    case 'click':
                        if (step.selector) {
                            const safeSelector = JSON.stringify(String(step.selector));
                            yield webContents.executeJavaScript(`
                            const el = document.querySelector(${safeSelector});
                            if(el) el.click();
                        `);
                        }
                        break;
                    case 'fill':
                        if (step.selector && step.value) {
                            const safeSelector = JSON.stringify(String(step.selector));
                            const safeValue = JSON.stringify(String(step.value));
                            yield webContents.executeJavaScript(`
                            const el = document.querySelector(${safeSelector});
                            if(el) { el.value = ${safeValue}; el.dispatchEvent(new Event('input', {bubbles:true})); }
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
                            Object.assign(safePlan.data, extractedData);
                        }
                        break;
                    case 'saveFile':
                        // Save content to a file
                        // Expected step format: { type: 'saveFile', fileName: 'resumo.md', content: '...' }
                        // If content is missing, maybe use the last extracted data?
                        // For now, assume explicit content string (Generated by AI previously)
                        if (step.fileName && step.content) {
                            const workspaces = getWorkspaceRoots();
                            if (workspaces.length === 0) {
                                return { error: 'Nenhum workspace autorizado para salvar arquivo' };
                            }
                            const primaryWorkspace = workspaces[0];
                            if (!primaryWorkspace) {
                                return { error: 'Workspace autorizado invalido' };
                            }
                            const targetDir = normalizeFsPath(primaryWorkspace);
                            const fullPath = normalizeFsPath(path.join(targetDir, step.fileName));
                            if (!isWorkspacePathAllowed(fullPath)) {
                                return { error: 'Tentativa de escrita fora de workspace autorizado' };
                            }
                            yield fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
                            yield fs.promises.writeFile(fullPath, step.content, 'utf8');
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
        return { success: true, data: safePlan.data };
    });
}
electron_1.ipcMain.handle('ai-plan-execute', (event, plan) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const senderUrl = ((_a = event.senderFrame) === null || _a === void 0 ? void 0 : _a.url) || '';
    if (!senderUrl.startsWith('file://')) {
        return { error: 'Origem não autorizada para execução de plano' };
    }
    return yield executePlan(plan);
}));
// ============================================================================
// LEX AGENT LOOP INTEGRATION
// ============================================================================
// Initialize agent on app ready
let agentInitialized = false;
function loadAgentModule() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!agentModule) {
            console.log('[Agent] Loading module...');
            agentModule = yield Promise.resolve().then(() => __importStar(require('./agent')));
            console.log('[Agent] Module loaded');
        }
        return agentModule;
    });
}
function ensureAgentInitialized() {
    return __awaiter(this, void 0, void 0, function* () {
        const agent = yield loadAgentModule();
        if (!agentInitialized) {
            yield agent.initializeAgent();
            agentInitialized = true;
        }
        return agent;
    });
}
// Forward agent events to renderer
function setupAgentEventForwarding() {
    return __awaiter(this, void 0, void 0, function* () {
        const agent = yield loadAgentModule();
        agent.agentEmitter.on('agent-event', (event) => {
            console.log('[Agent Event]', event.type);
            if (mainWindow) {
                mainWindow.webContents.send('agent-event', event);
            }
        });
    });
}
// IPC: Run Agent Loop
electron_1.ipcMain.handle('agent-run', (_event, objetivo) => __awaiter(void 0, void 0, void 0, function* () {
    const agent = yield ensureAgentInitialized();
    try {
        // Load tenant config (for now use default)
        const tenantConfig = agent.getDefaultTenantConfig();
        // Run the agent loop
        const resposta = yield agent.runAgentLoop(objetivo, {
            maxIterations: 5,
            timeoutMs: 60000
        }, tenantConfig);
        return { success: true, resposta };
    }
    catch (error) {
        console.error('[Agent] Erro:', error);
        return { success: false, error: error.message };
    }
}));
// IPC: Cancel Agent Loop
electron_1.ipcMain.handle('agent-cancel', () => __awaiter(void 0, void 0, void 0, function* () {
    const agent = yield loadAgentModule();
    agent.cancelAgentLoop();
    return { success: true };
}));
// Setup event forwarding after window is created
// We'll call this in createWindow
//# sourceMappingURL=main.js.map