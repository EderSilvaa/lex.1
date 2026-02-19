import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// PJeManager type for dynamic import
type PJeManagerType = import('./pje-manager').PJeManager;

// Agent module loaded dynamically after app ready
let agentModule: {
    initializeAgent: () => Promise<void>;
    runAgentLoop: (objetivo: string, config: any, tenantConfig: any) => Promise<string>;
    cancelAgentLoop: (runId?: string) => boolean;
    agentEmitter: import('events').EventEmitter;
    getDefaultTenantConfig: () => any;
} | null = null;

// Enable Hot Reload in Development
if (!app.isPackaged) {
    try {
        require('electron-reload')(__dirname, {
            electron: path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe'),
            awaitWriteFinish: true
        });
    } catch (e) { console.error('Error loading electron-reload', e); }
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

let mainWindow: BrowserWindow | null = null;
let store: any;
const approvedWorkspaceSelections = new Set<string>();
const approvedFileSelections = new Set<string>();

function normalizeFsPath(targetPath: string): string {
    return path.resolve(String(targetPath || ''));
}

function isWithinDirectory(targetPath: string, baseDir: string): boolean {
    const normalizedTarget = normalizeFsPath(targetPath);
    const normalizedBase = normalizeFsPath(baseDir);
    const relative = path.relative(normalizedBase, normalizedTarget);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getWorkspaceRoots(): string[] {
    if (!store) return [];
    const workspaces = store.get('workspaces', []) as string[];
    return workspaces
        .filter((workspacePath: string) => typeof workspacePath === 'string' && workspacePath.trim().length > 0)
        .map(normalizeFsPath);
}

function isWorkspacePathAllowed(targetPath: string): boolean {
    const roots = getWorkspaceRoots();
    if (roots.length === 0) return false;
    return roots.some(root => isWithinDirectory(targetPath, root));
}

function isPathApprovedForRead(targetPath: string): boolean {
    const normalized = normalizeFsPath(targetPath);
    return isWorkspacePathAllowed(normalized) || approvedFileSelections.has(normalized);
}

function isPathApprovedForWrite(targetPath: string): boolean {
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
const MAX_SAVEFILE_CONTENT_LENGTH = 1_000_000;

function normalizeAllowedAutomationUrl(rawUrl: string): string | null {
    if (typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    try {
        const parsed = new URL(trimmed);
        if (!ALLOWED_AUTOMATION_PROTOCOLS.has(parsed.protocol)) return null;
        if (!ALLOWED_AUTOMATION_HOSTS.has(parsed.hostname.toLowerCase())) return null;
        return parsed.toString();
    } catch (_error) {
        return null;
    }
}

function sanitizeFileName(fileName: string): string {
    const normalized = path.basename(String(fileName || '').trim());
    return normalized
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .slice(0, 120);
}

function normalizeStepString(value: unknown): string {
    return String(value ?? '').trim().slice(0, MAX_STEP_STRING_LENGTH);
}

function sanitizeExecutionPlan(plan: any): { ok: true; plan: any } | { ok: false; error: string } {
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps)) {
        return { ok: false, error: 'Plano inválido: steps ausente' };
    }

    if (plan.steps.length === 0 || plan.steps.length > MAX_PLAN_STEPS) {
        return { ok: false, error: `Plano inválido: steps deve ter entre 1 e ${MAX_PLAN_STEPS}` };
    }

    const sanitizedSteps: any[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
        const rawStep = plan.steps[i];
        const stepType = normalizeStepString(rawStep?.type);
        const order = Number.isFinite(rawStep?.order) ? Number(rawStep.order) : i + 1;

        if (!stepType) {
            return { ok: false, error: `Plano inválido: passo ${i + 1} sem tipo` };
        }

        if (stepType === 'click') {
            const selector = normalizeStepString(rawStep.selector);
            if (!selector) return { ok: false, error: `Plano inválido: click sem selector (passo ${order})` };
            sanitizedSteps.push({ order, type: 'click', selector });
            continue;
        }

        if (stepType === 'fill') {
            const selector = normalizeStepString(rawStep.selector);
            const value = normalizeStepString(rawStep.value);
            if (!selector || !value) return { ok: false, error: `Plano inválido: fill incompleto (passo ${order})` };
            sanitizedSteps.push({ order, type: 'fill', selector, value });
            continue;
        }

        if (stepType === 'navigate') {
            const safeUrl = normalizeAllowedAutomationUrl(normalizeStepString(rawStep.url));
            if (!safeUrl) return { ok: false, error: `Plano inválido: URL não permitida (passo ${order})` };
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
                const key = normalizeStepString(item?.key || `field_${idx + 1}`);
                const selector = normalizeStepString(item?.selector);
                if (!selector) {
                    return { ok: false, error: `Plano invÃ¡lido: selector vazio em read (passo ${order})` };
                }
                if (!selector) throw new Error(`Plano inválido: selector vazio em read (passo ${order})`);
                selectors.push({ key, selector });
            }
            sanitizedSteps.push({ order, type: 'read', selectors });
            continue;
        }

        if (stepType === 'saveFile') {
            const fileName = sanitizeFileName(normalizeStepString(rawStep.fileName));
            const content = String(rawStep.content ?? '');
            if (!fileName) return { ok: false, error: `Plano inválido: saveFile sem fileName (passo ${order})` };
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
function detectarTipoConversa(pergunta: string): string {
    const perguntaLower = pergunta.toLowerCase();

    // Cumprimento
    if (/^(oi|olá|e aí|tudo bem|como vai)/i.test(pergunta)) return 'cumprimento';
    // Análise técnica
    if (perguntaLower.includes('analisar') || perguntaLower.includes('análise')) return 'analise_tecnica';
    // Prazos
    if (perguntaLower.includes('prazo') || perguntaLower.includes('quando')) return 'prazos';
    // Explicação
    if (perguntaLower.includes('o que é') || perguntaLower.includes('explique')) return 'explicacao';
    // Estratégia
    if (perguntaLower.includes('próximos passos') || perguntaLower.includes('estratégia') || perguntaLower.includes('como proceder')) return 'estrategia';
    // Automação
    if (perguntaLower.includes('consultar') || perguntaLower.includes('abrir') || perguntaLower.includes('navegar') || perguntaLower.includes('preencher') || perguntaLower.includes('processo') || perguntaLower.includes('acesse') || perguntaLower.includes('acessar') || perguntaLower.includes('vá para') || perguntaLower.includes('entrar')) return 'automacao';

    return 'conversa_geral';
}

function obterPromptBase(tipo: string): string {
    const prompts: Record<string, string> = {
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

function obterInstrucoesEspecificas(tipo: string): string {
    const instrucoes: Record<string, string> = {
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

function criarPromptJuridico(contexto: any, pergunta: string): string {
    const tipoConversa = detectarTipoConversa(pergunta);
    const promptBase = obterPromptBase(tipoConversa);
    // Simple context formatting
    const contextStr = JSON.stringify(contexto, null, 2);

    return `${promptBase}\n\nCONTEXTO DO PROCESSO:\n${contextStr}\n\nPERGUNTA: ${pergunta}\n\n${obterInstrucoesEspecificas(tipoConversa)}`;
}

async function initStore() {
    // @ts-ignore
    const { default: Store } = await import('electron-store');
    store = new Store();

    // Inicializa chave Anthropic se não existir
    if (!store.has('anthropicKey')) {
        store.set('anthropicKey', '');
    }

    // Inicializa AI handler com Claude
    const { initAI } = await import('./ai-handler');
    initAI({
        provider: 'anthropic',
        apiKey: store.get('anthropicKey') as string || ''
    });
}

// Configura chave Anthropic via IPC (para UI de configurações)
ipcMain.handle('store-set-anthropic-key', async (_event, key: string) => {
    if (!store) return { error: 'Store not initialized' };
    store.set('anthropicKey', key);
    const { initAI } = await import('./ai-handler');
    initAI({ provider: 'anthropic', apiKey: key });
    return { success: true };
});

// AI Chat Handler
ipcMain.handle('ai-chat-send', async (_event, { message, context }) => {
    if (!store) return { error: 'Store not initialized' };

    try {
        console.log('🤖 Sending to Claude (Anthropic)...');

        const messageStr = message || '';
        const systemPrompt = criarPromptJuridico(context || {}, messageStr);
        console.log('🤖 System Prompt Type:', detectarTipoConversa(messageStr));

        const { callAI } = await import('./ai-handler');
        const fullText = await callAI({
            system: systemPrompt,
            user: messageStr
        });

        console.log('🤖 Claude response received:', fullText.substring(0, 50) + '...');

        // PARSE AI RESPONSE (Extract JSON if present)
        let aiPlan: any = {
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
            } else {
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
                aiPlan = {
                    ...parsed,
                    intent: {
                        ...(parsed.intent || {}),
                        // Use specific 'response' field if available, otherwise description, otherwise raw text
                        description: parsed.response || parsed.intent?.description || fullText
                    }
                };

                // If the AI just gave a 'response' text but no intent, assume informative
                if (!aiPlan.intent.type) {
                    aiPlan.intent.type = 'informative';
                }

                if (parsed.search_query) {
                    aiPlan.search_query = parsed.search_query;
                    if (!aiPlan.intent.type || aiPlan.intent.type === 'informative') aiPlan.intent.type = 'search_jurisprudence';
                }
            }
        } catch (e) {
            console.log('⚠️ Could not parse structured JSON from response, using raw text.', e);
        }

        return { plan: aiPlan };

    } catch (error: any) {
        console.error('AI Connection Failed:', error);
        return { error: error.message };
    }
});

import { BrowserManager } from './browser-manager';

let browserManager: BrowserManager | null = null;

// Dashboard Mode Switching (register once)
ipcMain.handle('dashboard-set-mode', async (_event, mode) => {
    if (!browserManager) {
        return { success: false, error: 'Browser manager not initialized' };
    }

    if (mode === 'pje') {
        if (!browserManager.activeTab) {
            browserManager.createTab('https://pje.tjpa.jus.br/pje/login.seam');
        } else {
            browserManager.showView();
        }
    } else {
        browserManager.hideView();
    }

    return { success: true };
});

function createWindow() {
    mainWindow = new BrowserWindow({
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

    browserManager = new BrowserManager(mainWindow);

    // Load the local dashboard file
    if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    } else {
        // In dev, we can link directly to the source
        mainWindow.loadFile(path.join(process.cwd(), 'src/renderer/index.html'));
    }

    // Open DevTools in dev mode
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }

    // Setup Agent event forwarding to renderer (async, no need to wait)
    setupAgentEventForwarding().catch(err => console.error('[Agent] Failed to setup events:', err));

    // Note: We REMOVED the default injection on mainWindow, because it loads Dashboard.
}

// Register protocol
app.whenReady().then(() => {
    const { protocol } = require('electron');
    protocol.registerFileProtocol('lex-extension', (request: any, callback: any) => {
        try {
            const relativeUrl = decodeURIComponent(request.url.replace('lex-extension://', ''));
            const rootDir = path.resolve(__dirname, '..');
            const requestedPath = path.resolve(rootDir, relativeUrl);

            if (!isWithinDirectory(requestedPath, rootDir)) {
                callback({ error: -10 }); // ACCESS_DENIED
                return;
            }

            callback({ path: requestedPath });
        } catch (_error) {
            callback({ error: -324 }); // ERR_INVALID_URL
        }
    });
});

// File System Handlers
ipcMain.handle('files-select-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled) return null;
    const firstPath = result.filePaths[0];
    if (!firstPath) return null;
    const selectedPath = normalizeFsPath(firstPath);
    approvedWorkspaceSelections.add(selectedPath);
    return selectedPath;
});

ipcMain.handle('files-list', async (_event, folderPath) => {
    try {
        const normalizedFolderPath = normalizeFsPath(folderPath);
        if (!isWorkspacePathAllowed(normalizedFolderPath)) {
            return [];
        }

        const items = await fs.promises.readdir(normalizedFolderPath, { withFileTypes: true });
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
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
        return files;
    } catch (e) {
        console.error('Error listing files:', e);
        return [];
    }
});

// Lê arquivo e extrai texto (.txt, .docx, .pdf)
ipcMain.handle('files-read', async (_event, filePath: string) => {
    try {
        const normalizedFilePath = normalizeFsPath(filePath);
        if (!isPathApprovedForRead(normalizedFilePath)) {
            return { success: false, error: 'Acesso negado ao arquivo fora de workspace autorizado' };
        }

        const ext = path.extname(normalizedFilePath).toLowerCase();

        if (ext === '.docx') {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ path: normalizedFilePath });
            return { success: true, text: result.value, type: 'docx' };
        }

        if (ext === '.pdf') {
            const pdfParseModule: any = await import('pdf-parse');
            const buffer = await fs.promises.readFile(normalizedFilePath);
            const pdfParseFn = pdfParseModule?.default ?? pdfParseModule;
            if (typeof pdfParseFn !== 'function') {
                throw new Error('PDF parser unavailable');
            }
            const data = await pdfParseFn(buffer);
            return { success: true, text: data.text, type: 'pdf' };
        }

        // .txt e outros arquivos de texto
        const text = await fs.promises.readFile(normalizedFilePath, 'utf8');
        return { success: true, text, type: 'text' };

    } catch (e: any) {
        console.error('[Files] Erro ao ler arquivo:', e);
        return { success: false, error: e.message };
    }
});

// Seleciona arquivo (dialog)
ipcMain.handle('files-select-file', async (_event, filters?: Electron.FileFilter[]) => {
    if (!mainWindow) return null;
    const workspaces = getWorkspaceRoots();
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        defaultPath: workspaces[0] || app.getPath('documents'),
        filters: filters || [
            { name: 'Documentos', extensions: ['docx', 'pdf', 'txt'] },
            { name: 'Word', extensions: ['docx'] },
            { name: 'PDF', extensions: ['pdf'] },
            { name: 'Todos', extensions: ['*'] }
        ]
    });
    if (result.canceled) return null;
    const firstPath = result.filePaths[0];
    if (!firstPath) return null;
    const selectedPath = normalizeFsPath(firstPath);
    approvedFileSelections.add(selectedPath);
    return selectedPath;
});

// Salva texto como .txt na pasta de documentos do escritório
ipcMain.handle('files-save-document', async (_event, { name, content }: { name: string; content: string }) => {
    try {
        if (!mainWindow) return { success: false, error: 'Janela não disponível' };

        const workspaces = getWorkspaceRoots();
        if (workspaces.length === 0) {
            return { success: false, error: 'Nenhum workspace autorizado para salvar arquivo' };
        }
        const primaryWorkspace = workspaces[0];
        if (!primaryWorkspace) {
            return { success: false, error: 'Workspace autorizado invalido' };
        }

        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: path.join(primaryWorkspace, path.basename(name || 'documento.txt')),
            filters: [
                { name: 'Documento de Texto', extensions: ['txt'] },
                { name: 'Todos', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) return { success: false, error: 'Cancelado' };
        if (!isWorkspacePathAllowed(result.filePath)) {
            return { success: false, error: 'Destino fora de workspace autorizado' };
        }

        await fs.promises.writeFile(result.filePath, content, 'utf8');
        approvedFileSelections.add(normalizeFsPath(result.filePath));
        return { success: true, path: result.filePath };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

// Escreve conteúdo em arquivo existente
ipcMain.handle('files-write', async (_event, { path: filePath, content }: { path: string; content: string }) => {
    try {
        const normalizedFilePath = normalizeFsPath(filePath);
        if (!isPathApprovedForWrite(normalizedFilePath)) {
            return { success: false, error: 'Acesso negado ao caminho fora de workspace autorizado' };
        }
        await fs.promises.writeFile(normalizedFilePath, content, 'utf8');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

async function injectLexScripts(target: BrowserWindow | Electron.WebContents) {
    const webContents = 'webContents' in target ? target.webContents : target;
    const currentUrl = webContents.getURL();
    console.log('Checking injection for:', currentUrl);

    // Inject Polyfill FIRST
    try {
        const polyfillPath = path.join(__dirname, 'polyfill.js');
        if (fs.existsSync(polyfillPath)) {
            const polyfillContent = fs.readFileSync(polyfillPath, 'utf8');
            await webContents.executeJavaScript(polyfillContent);
        } else {
            // If running from dist-electron, polyfill might be in ../electron/polyfill.js or we need to copy it
            // Let's try to resolve it. If __dirname is dist-electron, polyfill.js might not be there unless copied.
            // We should check ../electron/polyfill.js too
            const polyfillSrcPath = path.join(__dirname, '../electron/polyfill.js');
            if (fs.existsSync(polyfillSrcPath)) {
                const polyfillContent = fs.readFileSync(polyfillSrcPath, 'utf8');
                await webContents.executeJavaScript(polyfillContent);
            }
        }
    } catch (e) {
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
        } else {
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
            await webContents.executeJavaScript(js);
            console.log('✅ Overlay JS Injected from:', overlayJsPath);
        } else {
            console.error('❌ Overlay JS not found at:', overlayJsPath);
        }

    } catch (e) {
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
}

import { registerCrawlerHandlers } from './crawler';

// ... (existing code)

app.whenReady().then(async () => {
    await initStore();
    createWindow();
    registerCrawlerHandlers(); // LOGIN CRAWLER

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('save-history', async (_event, messages) => {
    if (store) store.set('chatHistory', messages);
    return { success: true };
});

ipcMain.handle('get-history', async () => {
    return store ? store.get('chatHistory', []) : [];
});

ipcMain.handle('save-preferences', async (_event, prefs) => {
    if (store) store.set('userPreferences', prefs);
    return { success: true };
});

// Workspace Management
ipcMain.handle('workspace-get', async () => {
    return store ? getWorkspaceRoots() : [];
});

ipcMain.handle('workspace-add', async (_event, path) => {
    if (!store) return { success: false };
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
});

ipcMain.handle('workspace-remove', async (_event, path) => {
    if (!store) return { success: false };
    const selectedPath = normalizeFsPath(path);
    let workspaces = store.get('workspaces', []) as string[];
    workspaces = workspaces.filter(w => normalizeFsPath(w) !== selectedPath);
    store.set('workspaces', workspaces);
    return { success: true, workspaces };
});

// Browser/PJe IPC Handlers
ipcMain.handle('browser-layout-update', (_event, bounds) => {
    // Renderer sends us the calculated "hole" for the browser {x, y, width, height}
    if (!browserManager) return;
    browserManager.updateBounds(bounds);
});

ipcMain.handle('browser-tab-new', (_event, url) => {
    if (!browserManager) return { success: false, error: 'Browser manager not initialized' };
    const safeUrl = normalizeAllowedAutomationUrl(String(url || DEFAULT_PJE_URL));
    if (!safeUrl) {
        return { success: false, error: 'URL não permitida para nova aba' };
    }
    browserManager.createTab(safeUrl);
    return { success: true, url: safeUrl };
});

ipcMain.handle('browser-tab-switch', (_event, tabId) => {
    if (!browserManager) return;
    browserManager.setActiveTab(tabId);
});

ipcMain.handle('browser-tab-close', (_event, tabId) => {
    if (!browserManager) return;
    browserManager.closeTab(tabId);
});

// Legacy PJe Hooks (mapped to active tab)
ipcMain.handle('pje-navigate', async (_event, url) => {
    if (!browserManager) return { success: false, error: 'Browser manager not initialized' };
    const safeUrl = normalizeAllowedAutomationUrl(String(url || ''));
    if (!safeUrl) {
        return { success: false, error: 'URL não permitida' };
    }
    await browserManager.navigateTo(safeUrl);
    return { success: true };
});

ipcMain.handle('check-pje', async () => {
    if (!browserManager || !browserManager.activeTab) {
        return { connected: false, isPje: false, url: null };
    }
    const url = browserManager.activeTab.url;
    const isPje = typeof url === 'string' && url.includes('pje.');
    return { connected: true, isPje, url };
});

// LEX EXECUTION ENGINE
// ====================

async function executePlan(plan: any) {
    if (!browserManager) return { error: "Browser manager nao inicializado" };
    const validation = sanitizeExecutionPlan(plan);
    if (!validation.ok) return { error: validation.error };
    const safePlan = validation.plan;
    if (!plan || !plan.steps) return { error: "Plano inválido" };

    // Ensure active tab exists
    if (!browserManager.activeTab) {
        console.log('[EXEC] No active tab, creating default...');
        browserManager.createTab(DEFAULT_PJE_URL);
        // Wait a bit for view creation
        await new Promise(r => setTimeout(r, 500));
    }

    const webContents = browserManager.activeTab?.view.webContents;
    if (!webContents) return { error: "Falha ao criar aba de automação" };

    for (const step of safePlan.steps) {
        console.log(`[EXEC] Step ${step.order}: ${step.type}`);

        // Simular Human Delay (0.5s - 1.5s)
        const delay = Math.floor(Math.random() * 1000) + 500;
        await new Promise(r => setTimeout(r, delay));

        try {
            switch (step.type) {
                case 'click':
                    if (step.selector) {
                        const safeSelector = JSON.stringify(String(step.selector));
                        await webContents.executeJavaScript(`
                            const el = document.querySelector(${safeSelector});
                            if(el) el.click();
                        `);
                    }
                    break;

                case 'fill':
                    if (step.selector && step.value) {
                        const safeSelector = JSON.stringify(String(step.selector));
                        const safeValue = JSON.stringify(String(step.value));
                        await webContents.executeJavaScript(`
                            const el = document.querySelector(${safeSelector});
                            if(el) { el.value = ${safeValue}; el.dispatchEvent(new Event('input', {bubbles:true})); }
                        `);
                    }
                    break;

                case 'navigate':
                    if (step.url) {
                        await webContents.loadURL(step.url);
                    }
                    break;

                case 'read':
                    // Extract text from multiple selectors
                    // Expected step format: { type: 'read', selectors: [ { key: 'num_wprocesso', selector: '...' } ] }
                    if (step.selectors && Array.isArray(step.selectors)) {
                        const extractedData = await webContents.executeJavaScript(`
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

                        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
                        await fs.promises.writeFile(fullPath, step.content, 'utf8');
                        console.log('[EXEC] File saved:', fullPath);
                    }
                    break;

                case 'wait':
                    // Wait is handled by the loop delay + potential extra wait
                    if (step.duration) {
                        await new Promise(r => setTimeout(r, step.duration));
                    }
                    break;
            }
        } catch (err: any) {
            console.error(`[EXEC] Error on step ${step.order}:`, err);
            return { error: `Erro no passo ${step.order}: ${err.message}` };
        }
    }

    return { success: true, data: safePlan.data };
}

ipcMain.handle('ai-plan-execute', async (event, plan) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!senderUrl.startsWith('file://')) {
        return { error: 'Origem não autorizada para execução de plano' };
    }
    return await executePlan(plan);
});

// ============================================================================
// LEX AGENT LOOP INTEGRATION
// ============================================================================

// Initialize agent on app ready
let agentInitialized = false;

async function loadAgentModule() {
    if (!agentModule) {
        console.log('[Agent] Loading module...');
        agentModule = await import('./agent');
        console.log('[Agent] Module loaded');
    }
    return agentModule;
}

async function ensureAgentInitialized() {
    const agent = await loadAgentModule();
    if (!agentInitialized) {
        await agent.initializeAgent();
        agentInitialized = true;
    }
    return agent;
}

// Forward agent events to renderer
async function setupAgentEventForwarding() {
    const agent = await loadAgentModule();
    agent.agentEmitter.on('agent-event', (event: any) => {
        console.log('[Agent Event]', event.type);
        if (mainWindow) {
            mainWindow.webContents.send('agent-event', event);
        }
    });
}

// IPC: Run Agent Loop
ipcMain.handle('agent-run', async (_event, objetivo: string) => {
    const agent = await ensureAgentInitialized();

    try {
        // Load tenant config (for now use default)
        const tenantConfig = agent.getDefaultTenantConfig();

        // Run the agent loop
        const resposta = await agent.runAgentLoop(objetivo, {
            maxIterations: 5,
            timeoutMs: 60000
        }, tenantConfig);

        return { success: true, resposta };
    } catch (error: any) {
        console.error('[Agent] Erro:', error);
        return { success: false, error: error.message };
    }
});

// IPC: Cancel Agent Loop
ipcMain.handle('agent-cancel', async () => {
    const agent = await loadAgentModule();
    agent.cancelAgentLoop();
    return { success: true };
});

// Setup event forwarding after window is created
// We'll call this in createWindow
