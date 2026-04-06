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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const crypto_1 = require("crypto");
const tribunal_urls_1 = require("./pje/tribunal-urls");
const browser_manager_1 = require("./browser-manager");
const memory_1 = require("./agent/memory");
const brain_1 = require("./brain");
const route_memory_1 = require("./pje/route-memory");
const browser_1 = require("./browser");
const backend_client_1 = require("./backend-client");
const crypto_store_1 = require("./crypto-store");
const doc_index_1 = require("./agent/doc-index");
const legislacao_downloader_1 = require("./agent/legislacao-downloader");
const provider_config_1 = require("./provider-config");
const supabase_client_1 = require("./auth/supabase-client");
const license_1 = require("./auth/license");
const analytics_1 = require("./analytics");
const electron_updater_1 = require("electron-updater");
const privacy_1 = require("./privacy");
const ollama_manager_1 = require("./ollama-manager");
// Suprime EPIPE (pipe quebrado ao rodar via terminal/background) — evita crash dialog
process.stdout.on('error', (err) => { if (err.code === 'EPIPE')
    return; });
process.stderr.on('error', (err) => { if (err.code === 'EPIPE')
    return; });
// Desabilita GPU do Electron para evitar conflito com Chrome externo e sandbox issues
electron_1.app.disableHardwareAcceleration();
electron_1.app.commandLine.appendSwitch('disable-gpu-sandbox');
// Agent module loaded dynamically after app ready
let agentModule = null;
const AGENT_SESSION_ID = (0, crypto_1.randomUUID)();
let _activeOrchestratorState = null;
let _activeOrchestratorRef = null;
// Enable Hot Reload in Development
// electron-reload removido: bypassava o launch-electron.js (sem deletar ELECTRON_RUN_AS_NODE)
// causando Electron a subir em modo Node.js e congelar o renderer ao detectar mudanças em dist-electron/
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
let tray = null;
let trayModeActive = false;
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
const ALLOWED_AUTOMATION_HOSTS = new Set((0, tribunal_urls_1.getKnownPJeHosts)());
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
        if (!isAllowedAutomationHost(parsed.hostname))
            return null;
        return parsed.toString();
    }
    catch (_error) {
        return null;
    }
}
function isAllowedAutomationHost(hostname) {
    const host = String(hostname || '').toLowerCase().trim();
    if (!host)
        return false;
    if (ALLOWED_AUTOMATION_HOSTS.has(host))
        return true;
    if (!host.endsWith('.jus.br'))
        return false;
    return host.includes('pje');
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
            const selectorsToUse = Array.isArray(rawStep.selectors) ? rawStep.selectors : [];
            const selectors = [];
            for (let idx = 0; idx < Math.min(selectorsToUse.length, MAX_READ_SELECTORS); idx++) {
                const item = selectorsToUse[idx];
                const key = normalizeStepString((item === null || item === void 0 ? void 0 : item.key) || `field_${idx + 1}`);
                const selector = normalizeStepString(item === null || item === void 0 ? void 0 : item.selector);
                if (selector) {
                    selectors.push({ key, selector });
                }
            }
            // Allow empty arrays or invalid arrays to pass if we just want to read general content,
            // or if the LLM hallucinated the format
            if (selectors.length === 0 && Array.isArray(rawStep.selectors) && rawStep.selectors.length > 0) {
                console.warn('[Validation] Ignoring malformed read.selectors');
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
    var _a;
    const tipoConversa = detectarTipoConversa(pergunta);
    // Usa o prompt-layer para personalidade e comportamento (mesmo sistema do agent loop)
    let systemPrompt;
    try {
        const tenantConfig = (_a = agentModule === null || agentModule === void 0 ? void 0 : agentModule.getDefaultTenantConfig) === null || _a === void 0 ? void 0 : _a.call(agentModule);
        if (tenantConfig) {
            const { buildPromptLayerSystem } = require('./agent/prompt-layer');
            systemPrompt = buildPromptLayerSystem(tenantConfig);
        }
        else {
            systemPrompt = obterPromptBase(tipoConversa);
        }
    }
    catch (_b) {
        systemPrompt = obterPromptBase(tipoConversa);
    }
    // Contexto do processo (se houver)
    const contextStr = contexto && Object.keys(contexto).length > 0
        ? `\n\nCONTEXTO DO PROCESSO:\n${JSON.stringify(contexto, null, 2)}`
        : '';
    // Instruções específicas do tipo (mantém para automação)
    const instrucoes = tipoConversa === 'automacao' ? `\n\n${obterInstrucoesEspecificas(tipoConversa)}` : '';
    return `${systemPrompt}${contextStr}${instrucoes}`;
}
/**
 * Sincroniza o provider ativo no runtime (ai-handler + env vars).
 */
function syncProvider(providerId, apiKey, agentModel, visionModel) {
    return __awaiter(this, void 0, void 0, function* () {
        const preset = provider_config_1.PROVIDER_PRESETS[providerId];
        const resolvedAgent = agentModel || preset.defaultAgentModel;
        const resolvedVision = visionModel || preset.defaultVisionModel;
        const config = {
            providerId,
            apiKey,
            agentModel: resolvedAgent,
            visionModel: resolvedVision,
        };
        const { initAI } = yield Promise.resolve().then(() => __importStar(require('./ai-handler')));
        initAI(config);
        // Sincroniza config com o backend (se conectado)
        (0, backend_client_1.syncConfigToBackend)(config);
    });
}
/**
 * Carrega chave do store para um provider.
 * Se o valor estiver em plaintext legado, migra para criptografado imediatamente.
 */
function loadApiKey(providerId) {
    if (!store) {
        console.log(`[loadApiKey] Store não inicializado`);
        return '';
    }
    const apiKeys = store.get('apiKeys', {});
    const raw = String(apiKeys[providerId] || '').trim();
    console.log(`[loadApiKey] provider=${providerId}, raw=${raw ? raw.slice(0, 20) + '...' : 'EMPTY'}, encrypted=${(0, crypto_store_1.isEncrypted)(raw)}`);
    if (!raw)
        return '';
    if (!(0, crypto_store_1.isEncrypted)(raw)) {
        saveApiKey(providerId, raw);
        return raw;
    }
    const decrypted = (0, crypto_store_1.safeDecrypt)(raw);
    console.log(`[loadApiKey] decrypted=${decrypted ? decrypted.slice(0, 8) + '...' : 'EMPTY (decrypt failed)'}`);
    return decrypted;
}
/**
 * Persiste chave encriptada no store para um provider.
 */
function saveApiKey(providerId, key) {
    if (!store)
        return;
    const apiKeys = store.get('apiKeys', {});
    apiKeys[providerId] = key ? (0, crypto_store_1.encryptApiKey)(key) : '';
    store.set('apiKeys', apiKeys);
}
function initStore() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        // @ts-ignore
        const { default: Store } = yield Promise.resolve().then(() => __importStar(require('electron-store')));
        store = new Store();
        // ── Migração legada: anthropicKey → apiKeys.anthropic ──
        const legacyRaw = String(store.get('anthropicKey', '') || '').trim();
        if (legacyRaw) {
            const legacyKey = (0, crypto_store_1.safeDecrypt)(legacyRaw);
            if (legacyKey) {
                saveApiKey('anthropic', legacyKey);
                store.delete('anthropicKey');
            }
        }
        // ── Carrega config do provider ──
        const savedProvider = store.get('aiProvider', null);
        const providerId = (_a = savedProvider === null || savedProvider === void 0 ? void 0 : savedProvider.providerId) !== null && _a !== void 0 ? _a : 'anthropic';
        const apiKey = loadApiKey(providerId);
        const preset = provider_config_1.PROVIDER_PRESETS[providerId];
        // Migra visionModel: Claude 4.x pode causar problemas em browser automation
        // agentModel não é migrado — Claude 4.x funciona fine com generateText no SDK principal
        const LEGACY_VISION_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'];
        const savedVision = (_b = savedProvider === null || savedProvider === void 0 ? void 0 : savedProvider.visionModel) !== null && _b !== void 0 ? _b : preset.defaultVisionModel;
        const visionModel = (providerId === 'anthropic' && LEGACY_VISION_MODELS.includes(savedVision))
            ? preset.defaultVisionModel : savedVision;
        yield syncProvider(providerId, apiKey, (_c = savedProvider === null || savedProvider === void 0 ? void 0 : savedProvider.agentModel) !== null && _c !== void 0 ? _c : preset.defaultAgentModel, visionModel);
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// IPC — Configuração de Provider/API Keys
// ─────────────────────────────────────────────────────────────────────────────
/** Define provider ativo + modelos. Re-inicia browser em background. */
electron_1.ipcMain.handle('store-set-provider', (_event, cfg) => __awaiter(void 0, void 0, void 0, function* () {
    if (!store)
        return { error: 'Store not initialized' };
    store.set('aiProvider', cfg);
    const apiKey = loadApiKey(cfg.providerId);
    console.log(`[Provider] setProvider: ${cfg.providerId}, key=${apiKey ? apiKey.slice(0, 8) + '...' : 'EMPTY'}, agent=${cfg.agentModel}, vision=${cfg.visionModel}`);
    yield syncProvider(cfg.providerId, apiKey, cfg.agentModel, cfg.visionModel);
    (0, browser_manager_1.reInitBrowser)().catch(e => console.error('[Browser] Erro ao re-inicializar após troca de provider:', e));
    return { success: true };
}));
/** Retorna provider ativo + status da chave. A apiKey nunca é enviada ao renderer. */
electron_1.ipcMain.handle('store-get-provider', () => __awaiter(void 0, void 0, void 0, function* () {
    const cfg = (0, provider_config_1.getActiveConfig)();
    const hasKey = cfg.apiKey.length > 0;
    const { apiKey: _omit } = cfg, safe = __rest(cfg, ["apiKey"]);
    return Object.assign(Object.assign({}, safe), { hasKey });
}));
/** Salva chave API para um provider. */
electron_1.ipcMain.handle('store-set-api-key', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { providerId, key }) {
    if (!store)
        return { error: 'Store not initialized' };
    // Remove zero-width chars, BOM, e qualquer non-ASCII que colar junto
    const normalizedKey = String(key || '').replace(/[^\x20-\x7E]/g, '').trim();
    saveApiKey(providerId, normalizedKey);
    // Se é o provider ativo, re-sincroniza imediatamente
    const current = (0, provider_config_1.getActiveConfig)();
    if (current.providerId === providerId) {
        yield syncProvider(providerId, normalizedKey, current.agentModel, current.visionModel);
        (0, browser_manager_1.reInitBrowser)().catch(e => console.error('[Browser] Erro ao re-inicializar após nova chave:', e));
    }
    return { success: true, configured: normalizedKey.length > 0 };
}));
/** Retorna status da chave para um provider. */
electron_1.ipcMain.handle('store-get-api-key-status', (_event, providerId) => __awaiter(void 0, void 0, void 0, function* () {
    const key = loadApiKey(providerId);
    return {
        configured: key.length > 0,
        preview: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : '',
    };
}));
/** Retorna catálogo de providers/modelos para a UI de configurações. */
electron_1.ipcMain.handle('store-get-provider-presets', () => {
    return provider_config_1.PROVIDER_PRESETS;
});
// ── Privacy / Consent ──────────────────────────────────────────────────────
electron_1.ipcMain.handle('privacy-get-config', () => {
    return (0, privacy_1.getConsentConfig)();
});
electron_1.ipcMain.handle('privacy-set-level', (_event, level) => {
    (0, privacy_1.setDefaultLevel)(level);
    return { success: true };
});
electron_1.ipcMain.handle('privacy-set-provider-consent', (_event, { providerId, level, consented }) => {
    (0, privacy_1.setProviderConsent)(providerId, level, consented);
    return { success: true };
});
electron_1.ipcMain.handle('privacy-complete-onboarding', (_event, level) => {
    (0, privacy_1.completeOnboarding)(level);
    return { success: true };
});
electron_1.ipcMain.handle('privacy-is-onboarding-completed', () => {
    return (0, privacy_1.isOnboardingCompleted)();
});
electron_1.ipcMain.handle('privacy-revoke-all', () => {
    (0, privacy_1.revokeAllConsent)();
    return { success: true };
});
electron_1.ipcMain.handle('privacy-get-effective-level', (_event, providerId) => {
    return (0, privacy_1.getEffectiveLevel)(providerId);
});
electron_1.ipcMain.handle('privacy-get-audit-summary', (_event, days) => {
    return (0, privacy_1.getAuditSummary)(days !== null && days !== void 0 ? days : 7);
});
// ── Training (PJe-Model dataset) ──────────────────────────────────────────
electron_1.ipcMain.handle('training-stats', () => {
    try {
        const { getStats } = require('./agent/training-collector');
        return getStats();
    }
    catch (_a) {
        return { total: 0, today: 0, bySistema: {}, byTribunal: {}, bySkill: {}, oldestDate: '', newestDate: '' };
    }
});
electron_1.ipcMain.handle('training-export', (_event, options) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userData = electron_1.app.getPath('userData');
        const trainingDir = require('path').join(userData, 'training');
        const { exportForFineTune } = require('./agent/training-exporter');
        return yield exportForFineTune(trainingDir, options !== null && options !== void 0 ? options : {});
    }
    catch (err) {
        return { success: false, outputPath: '', stats: {}, error: err.message };
    }
}));
// ── Ollama (Modelo Local) ──────────────────────────────────────────────────
electron_1.ipcMain.handle('ollama-status', () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield (0, ollama_manager_1.getOllamaStatus)();
    }
    catch (e) {
        console.error('[IPC] ollama-status error:', e.message);
        return { running: false, models: [], error: e.message };
    }
}));
electron_1.ipcMain.handle('ollama-list-models', () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield (0, ollama_manager_1.listModels)();
    }
    catch (e) {
        console.error('[IPC] ollama-list-models error:', e.message);
        return [];
    }
}));
electron_1.ipcMain.handle('ollama-recommended', () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield (0, ollama_manager_1.getRecommendedModelsWithStatus)();
    }
    catch (e) {
        console.error('[IPC] ollama-recommended error:', e.message);
        return [];
    }
}));
electron_1.ipcMain.handle('ollama-pull', (_event, modelName) => __awaiter(void 0, void 0, void 0, function* () {
    // Forward de progresso para o renderer
    const onProgress = (data) => {
        if (mainWindow)
            mainWindow.webContents.send('ollama-pull-progress', data);
    };
    const onComplete = (data) => {
        if (mainWindow)
            mainWindow.webContents.send('ollama-pull-complete', data);
        ollama_manager_1.ollamaEmitter.off('pull-progress', onProgress);
        ollama_manager_1.ollamaEmitter.off('pull-complete', onComplete);
        ollama_manager_1.ollamaEmitter.off('pull-error', onError);
    };
    const onError = (data) => {
        if (mainWindow)
            mainWindow.webContents.send('ollama-pull-error', data);
        ollama_manager_1.ollamaEmitter.off('pull-progress', onProgress);
        ollama_manager_1.ollamaEmitter.off('pull-complete', onComplete);
        ollama_manager_1.ollamaEmitter.off('pull-error', onError);
    };
    ollama_manager_1.ollamaEmitter.on('pull-progress', onProgress);
    ollama_manager_1.ollamaEmitter.on('pull-complete', onComplete);
    ollama_manager_1.ollamaEmitter.on('pull-error', onError);
    return (0, ollama_manager_1.pullModel)(modelName);
}));
electron_1.ipcMain.handle('ollama-delete', (_event, modelName) => __awaiter(void 0, void 0, void 0, function* () {
    return (0, ollama_manager_1.deleteModel)(modelName);
}));
electron_1.ipcMain.handle('ollama-get-recommended-list', () => {
    return ollama_manager_1.RECOMMENDED_MODELS;
});
electron_1.ipcMain.handle('ollama-is-running', () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield (0, ollama_manager_1.isOllamaRunning)();
    }
    catch (_a) {
        return false;
    }
}));
electron_1.ipcMain.handle('ollama-download-installer', () => __awaiter(void 0, void 0, void 0, function* () {
    const url = process.platform === 'darwin'
        ? 'https://ollama.com/download/Ollama-darwin.zip'
        : 'https://ollama.com/download/OllamaSetup.exe';
    const fileName = process.platform === 'darwin' ? 'Ollama-darwin.zip' : 'OllamaSetup.exe';
    const destPath = path.join(electron_1.app.getPath('temp'), fileName);
    try {
        // Notifica progresso
        if (mainWindow)
            mainWindow.webContents.send('ollama-install-progress', { status: 'downloading', percent: 0 });
        const res = yield fetch(url);
        if (!res.ok || !res.body)
            throw new Error(`HTTP ${res.status}`);
        const total = Number(res.headers.get('content-length') || 0);
        let downloaded = 0;
        const chunks = [];
        const reader = res.body.getReader();
        while (true) {
            const { done, value } = yield reader.read();
            if (done)
                break;
            chunks.push(Buffer.from(value));
            downloaded += value.byteLength;
            if (total > 0 && mainWindow) {
                mainWindow.webContents.send('ollama-install-progress', {
                    status: 'downloading',
                    percent: Math.round(downloaded / total * 100)
                });
            }
        }
        fs.writeFileSync(destPath, Buffer.concat(chunks));
        if (mainWindow)
            mainWindow.webContents.send('ollama-install-progress', { status: 'opening', percent: 100 });
        // Abre o installer para o usuário
        yield electron_1.shell.openPath(destPath);
        return { success: true, path: destPath };
    }
    catch (e) {
        console.error('[Ollama] Erro ao baixar installer:', e.message);
        if (mainWindow)
            mainWindow.webContents.send('ollama-install-progress', { status: 'error', error: e.message });
        return { success: false, error: e.message };
    }
}));
// ── Aliases legados (retrocompat com código antigo) ──
electron_1.ipcMain.handle('store-set-anthropic-key', (_event, key) => __awaiter(void 0, void 0, void 0, function* () {
    if (!store)
        return { error: 'Store not initialized' };
    const normalizedKey = String(key || '').trim();
    saveApiKey('anthropic', normalizedKey);
    const current = (0, provider_config_1.getActiveConfig)();
    if (current.providerId === 'anthropic') {
        yield syncProvider('anthropic', normalizedKey, current.agentModel, current.visionModel);
    }
    return { success: true, configured: normalizedKey.length > 0 };
}));
electron_1.ipcMain.handle('store-get-anthropic-key-status', () => __awaiter(void 0, void 0, void 0, function* () {
    const key = loadApiKey('anthropic');
    return {
        configured: key.length > 0,
        preview: key ? `${key.slice(0, 7)}...${key.slice(-4)}` : '',
    };
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
                // Fix common LLM format issues:
                // 1. Remove trailing commas before ']' or '}'
                let cleanedJson = potentialJson.replace(/,\s*([\]}])/g, '$1');
                // 2. Fix hallucinated quotes between a number and a comma, e.g. `"order": 6,",` -> `"order": 6,`
                cleanedJson = cleanedJson.replace(/(\d+)\s*",\s*"/g, '$1, "');
                // 3. Fix unescaped newlines in middle of strings (basic heuristic)
                cleanedJson = cleanedJson.replace(/\n(?=[^"]*"\s*:)/g, '\\n');
                let parsed;
                try {
                    parsed = JSON.parse(cleanedJson);
                }
                catch (e) {
                    console.warn('[Validation] JSON parse failed after basic cleanup. Falling back to raw response', e);
                    throw e; // goes to outer catch
                }
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
function createTray() {
    tray = new electron_1.Tray(getAppIcon());
    tray.setToolTip('LEX — Assistente Jurídico (24/7)');
    refreshTrayMenu();
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
        else {
            createWindow();
        }
    });
}
function refreshTrayMenu() {
    if (!tray)
        return;
    const botRunning = (0, telegram_bot_1.isBotRunning)();
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: 'Abrir LEX',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
                else {
                    createWindow();
                }
            }
        },
        { type: 'separator' },
        { label: `Telegram: ${botRunning ? '● Ativo' : '○ Inativo'}`, enabled: false },
        { label: `Agente: ● Pronto`, enabled: false },
        { type: 'separator' },
        {
            label: 'Encerrar LEX',
            click: () => {
                trayModeActive = false;
                electron_1.app.quit();
            }
        }
    ]);
    tray.setContextMenu(contextMenu);
}
function getAppIcon() {
    const candidates = [
        path.join(__dirname, '../build-assets/icon.ico'),
        path.join(__dirname, '../build-assets/icon.png'),
        path.join(process.cwd(), 'build-assets/icon.ico'),
        path.join(process.cwd(), 'build-assets/icon.png'),
    ];
    const iconPath = candidates.find(p => fs.existsSync(p));
    return iconPath ? electron_1.nativeImage.createFromPath(iconPath) : electron_1.nativeImage.createEmpty();
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400, // Wider for split view
        height: 900,
        icon: getAppIcon(),
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
    // Modo 24/7: minimiza para bandeja em vez de fechar
    mainWindow.on('close', (event) => {
        if (trayModeActive) {
            event.preventDefault();
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.hide();
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    // Note: We REMOVED the default injection on mainWindow, because it loads Dashboard.
}
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
// Retorna file:// URL para preview de arquivos (PDF, imagens)
electron_1.ipcMain.handle('files-get-url', (_event, filePath) => __awaiter(void 0, void 0, void 0, function* () {
    const normalizedFilePath = normalizeFsPath(filePath);
    if (!isPathApprovedForRead(normalizedFilePath)) {
        return null;
    }
    // Converte caminho Windows para file:// URL
    const fileUrl = `file:///${normalizedFilePath.replace(/\\/g, '/').replace(/^\//, '')}`;
    return fileUrl;
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
        // Re-indexa RAG em background após salvar documento
        const wsRoots = getWorkspaceRoots();
        if (wsRoots.length > 0) {
            (0, doc_index_1.getDocIndex)().indexarWorkspace(wsRoots).catch(e => console.warn('[files-save-document] RAG re-index falhou:', e.message));
        }
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
    });
}
const crawler_1 = require("./crawler");
// ... (existing code)
electron_1.app.whenReady().then(() => __awaiter(void 0, void 0, void 0, function* () {
    // Configura userDataDir para módulos desacoplados do Electron
    const userData = electron_1.app.getPath('userData');
    (0, browser_manager_1.setUserDataDir)(userData);
    (0, memory_1.initMemoryDir)(userData);
    // Inicializa salt de criptografia antes de qualquer encrypt/decrypt
    (0, crypto_store_1.initCryptoStoreSalt)(userData);
    // Inicializa módulos de privacidade
    (0, privacy_1.initConsentManager)(userData);
    (0, privacy_1.initAuditLog)(userData);
    // Inicializa índice RAG (carrega índice persistido do disco)
    (0, doc_index_1.getDocIndex)().init(userData);
    yield initStore();
    (0, supabase_client_1.initSupabase)(store);
    createWindow();
    (0, crawler_1.registerCrawlerHandlers)();
    (0, route_memory_1.initRouteMemory)(userData);
    (0, browser_1.initSelectorMemory)(userData);
    // Brain (SQLite FTS5 + grafo de conhecimento)
    try {
        (0, brain_1.initBrain)(userData);
        console.log('[Main] Brain inicializado');
    }
    catch (err) {
        console.error('[Main] Falha ao iniciar Brain:', err.message);
    }
    // Training collector — coleta dados de treino para PJe-model
    try {
        const { initTrainingCollector } = require('./agent/training-collector');
        initTrainingCollector(userData);
    }
    catch ( /* módulo não disponível */_a) { /* módulo não disponível */ }
    // Inicia backend Node.js separado (agent + browser + skills)
    try {
        yield (0, backend_client_1.startBackend)(userData);
        // Forward de eventos do backend → renderer
        backend_client_1.backendEvents.on('agent-event', (event) => {
            console.log('[Agent Event via Backend]', event.type);
            if (mainWindow) {
                mainWindow.webContents.send('agent-event', event);
            }
        });
        // Sincroniza config de provider/API key com o backend (já foi carregada no initStore)
        const cfg = (0, provider_config_1.getActiveConfig)();
        yield (0, backend_client_1.syncConfigToBackend)(cfg);
        console.log('[Main] Backend conectado e config sincronizada');
    }
    catch (err) {
        console.error('[Main] Falha ao iniciar backend — usando fallback local:', err.message);
    }
    initAutoUpdater();
    // Modo 24/7: tray sempre ativo desde o boot
    trayModeActive = true;
    createTray();
    // Auto-inicia bot Telegram se estava ativo na sessão anterior
    initTelegramBotIfConfigured().catch(e => {
        console.error('[Telegram] Falha ao auto-iniciar:', e);
    }).then(() => refreshTrayMenu()); // atualiza status no menu após bot iniciar
    // Phase 3 AIOS: Inicializa plugins ANTES do scheduler
    // (scheduler pode executar goals que usam skills de plugins)
    try {
        const { initPlugins } = yield Promise.resolve().then(() => __importStar(require('./plugins')));
        yield initPlugins();
        if (mainWindow)
            mainWindow.webContents.send('plugins-ready');
    }
    catch (err) {
        console.error('[Plugins] Falha ao inicializar:', err.message);
    }
    // Phase 2 AIOS: Inicializa scheduler + notifications
    try {
        const { initScheduler, setJobRunnerWindow } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
        const { setNotificationWindow, setTelegramUserId } = yield Promise.resolve().then(() => __importStar(require('./notifications')));
        setNotificationWindow(mainWindow);
        setJobRunnerWindow(mainWindow);
        const telegramUserId = store === null || store === void 0 ? void 0 : store.get('telegramUserId', 0);
        if (telegramUserId)
            setTelegramUserId(telegramUserId);
        yield initScheduler();
    }
    catch (err) {
        console.error('[Scheduler] Falha ao inicializar:', err.message);
    }
    // Terminal embutido (xterm.js + node-pty)
    try {
        const { initTerminal, getPtyManager } = yield Promise.resolve().then(() => __importStar(require('./terminal')));
        initTerminal();
        const ptyMgr = getPtyManager();
        electron_1.ipcMain.handle('terminal-create', (_, opts) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                yield ptyMgr.createSession(opts.sessionId, opts);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        }));
        electron_1.ipcMain.handle('terminal-write', (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { sessionId, data }) {
            try {
                ptyMgr.write(sessionId, data);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        }));
        electron_1.ipcMain.handle('terminal-resize', (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { sessionId, cols, rows }) {
            try {
                ptyMgr.resize(sessionId, cols, rows);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        }));
        electron_1.ipcMain.handle('terminal-kill', (_, sessionId) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                ptyMgr.killSession(sessionId);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        }));
        electron_1.ipcMain.handle('terminal-list-sessions', () => __awaiter(void 0, void 0, void 0, function* () {
            return { success: true, data: ptyMgr.listSessions() };
        }));
        // Forward PTY events para renderer
        ptyMgr.on('data', (sessionId, data) => {
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('terminal-data', { sessionId, data });
        });
        ptyMgr.on('exit', (sessionId, exitCode) => {
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('terminal-exit', { sessionId, exitCode });
        });
        // Cleanup no quit
        electron_1.app.on('before-quit', () => ptyMgr.killAll());
        console.log('[Terminal] IPC handlers registrados');
    }
    catch (err) {
        console.error('[Terminal] Falha ao inicializar:', err.message);
    }
    // Legal Store — base jurídica dinâmica (seed no primeiro uso)
    try {
        const { initLegalStore } = yield Promise.resolve().then(() => __importStar(require('./legal/legal-store')));
        initLegalStore();
    }
    catch (err) {
        console.warn('[LegalStore] Falha ao inicializar:', err.message);
    }
    // DataJud Pipeline — data pipeline jurídica (async, não bloqueia boot)
    try {
        const { initDataPipeline } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
        yield initDataPipeline();
    }
    catch (err) {
        console.warn('[DataPipeline] Falha ao inicializar:', err.message);
    }
    // Knowledge Base de Documentos — schemas + exemplos + seed pipeline
    try {
        const { initDocSchemaRegistry } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
        const { initDocExamples } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-examples')));
        const { seedIfEmpty } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-seed-pipeline')));
        initDocSchemaRegistry();
        initDocExamples();
        const seedResult = seedIfEmpty();
        if (seedResult) {
            console.log(`[KnowledgeBase] Seed: ${seedResult.imported} exemplos importados`);
        }
    }
    catch (err) {
        console.warn('[KnowledgeBase] Falha ao inicializar:', err.message);
    }
    // Python embedded — setup async em background (não bloqueia boot)
    try {
        const { initPythonEnv, getPythonEnv } = yield Promise.resolve().then(() => __importStar(require('./python')));
        initPythonEnv();
        getPythonEnv().setup()
            .then(() => {
            // Instala browser-use em background após Python estar pronto
            Promise.resolve().then(() => __importStar(require('./browser/browser-use-setup'))).then(({ ensureBrowserUseInstalled }) => ensureBrowserUseInstalled().catch((err) => console.warn('[BrowserUse] Instalação falhou:', err.message))).catch(() => { });
        })
            .catch((err) => console.warn('[Python] Setup falhou:', err.message));
    }
    catch (err) {
        console.error('[Python] Falha ao inicializar módulo:', err.message);
    }
    // Sync de legislação em background (não bloqueia boot)
    initLegislacaoSync();
    // Inicia watchers nos workspaces para auto re-indexar RAG
    startWorkspaceWatchers();
    // Analytics — rastreia sessão e tempo ativo
    const analytics = (0, analytics_1.getAnalytics)();
    analytics.syncConversationCount(store);
    analytics.startSession();
    // Track focus/blur para tempo ativo
    if (mainWindow) {
        mainWindow.on('focus', () => analytics.trackFocus());
        mainWindow.on('blur', () => analytics.trackBlur());
    }
    electron_1.app.on('activate', function () {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
}));
function initAutoUpdater() {
    // Em dev não verifica atualizações
    if (!electron_1.app.isPackaged)
        return;
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on('update-available', () => {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('update-available');
    });
    electron_updater_1.autoUpdater.on('update-downloaded', () => {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('update-downloaded');
    });
    electron_updater_1.autoUpdater.on('error', (err) => {
        console.error('[Updater]', err.message);
    });
    electron_updater_1.autoUpdater.checkForUpdates().catch(() => { });
}
const LEGISLACAO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
/**
 * Inicia o ciclo automático de sync de legislação:
 *  - 15s após boot: baixa o que falta / está desatualizado
 *  - A cada 24h: re-verifica e atualiza
 */
function initLegislacaoSync() {
    function runSync(label) {
        return __awaiter(this, void 0, void 0, function* () {
            const userDataDir = electron_1.app.getPath('userData');
            const pendentes = (0, legislacao_downloader_1.verificarDesatualizados)(userDataDir);
            if (pendentes.length === 0) {
                console.log(`[Legislação] ${label} — tudo em dia`);
                return;
            }
            console.log(`[Legislação] ${label} — ${pendentes.length} arquivo(s) para atualizar`);
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('rag-legislacao-progress', `Atualizando legislação (${pendentes.length} arquivo(s))…`);
            const result = yield (0, legislacao_downloader_1.downloadIncremental)(userDataDir, (msg) => {
                console.log('[Legislação]', msg);
                mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('rag-legislacao-progress', msg);
            });
            if (result.sucesso > 0) {
                // Garante que a pasta está nos workspaces e re-indexa
                const legDir = result.dir;
                const workspaces = store.get('workspaces', []);
                if (!workspaces.includes(legDir)) {
                    workspaces.push(legDir);
                    store.set('workspaces', workspaces);
                }
                yield (0, doc_index_1.getDocIndex)().indexarWorkspace([legDir, ...workspaces.filter(w => w !== legDir)]);
                console.log(`[Legislação] ${result.sucesso} arquivo(s) atualizados e re-indexados`);
            }
        });
    }
    // Boot: aguarda 15s para não competir com a inicialização da janela
    setTimeout(() => runSync('boot').catch(e => console.error('[Legislação] Erro no boot sync:', e)), 15000);
    // Verificação diária
    setInterval(() => runSync('daily').catch(e => console.error('[Legislação] Erro no daily sync:', e)), LEGISLACAO_CHECK_INTERVAL_MS);
}
electron_1.app.on('window-all-closed', function () {
    return __awaiter(this, void 0, void 0, function* () {
        // Finaliza sessão de analytics
        (0, analytics_1.getAnalytics)().endSession();
        // Flush audit log de privacidade
        yield (0, privacy_1.flushAuditLog)();
        // Phase 2 AIOS: Para scheduler (limpa timers/watchers)
        try {
            const { stopScheduler } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
            stopScheduler();
        }
        catch ( /* ignore */_a) { /* ignore */ }
        // No modo 24/7 com tray ativo, não encerra o processo
        if (trayModeActive)
            return;
        // Encerra backend (flush + close browser + sessions)
        yield (0, backend_client_1.stopBackend)();
        // Fallback local caso backend não estivesse rodando
        (0, route_memory_1.flush)();
        (0, browser_1.flushSelectorMemory)();
        try {
            require('./agent/training-collector').flush();
        }
        catch ( /* ok */_b) { /* ok */ }
        (0, brain_1.closeBrain)();
        yield (0, browser_manager_1.closeBrowser)();
        try {
            if (agentModule) {
                const sm = agentModule.getSessionManager();
                if (sm === null || sm === void 0 ? void 0 : sm.flush)
                    yield sm.flush();
            }
        }
        catch (e) { /* non-critical */ }
        if (process.platform !== 'darwin')
            electron_1.app.quit();
    });
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
// ============================================================================
// CONVERSATIONS (multi-session persistence)
// ============================================================================
electron_1.ipcMain.handle('conversations-list', () => __awaiter(void 0, void 0, void 0, function* () {
    const convs = (store === null || store === void 0 ? void 0 : store.get('conversations', {})) || {};
    return Object.values(convs)
        .map((c) => { var _a; return ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: ((_a = c.messages) === null || _a === void 0 ? void 0 : _a.length) || 0 }); })
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 50);
}));
electron_1.ipcMain.handle('conversations-save', (_event, conv) => __awaiter(void 0, void 0, void 0, function* () {
    const MAX_CONV_SIZE = 2000000; // 2 MB por conversa
    if (!conv || typeof conv.id !== 'string')
        return { success: false, error: 'Conversa inválida.' };
    if (JSON.stringify(conv).length > MAX_CONV_SIZE)
        return { success: false, error: 'Conversa muito grande para salvar (limite 2 MB).' };
    const convs = (store === null || store === void 0 ? void 0 : store.get('conversations', {})) || {};
    const isNew = !convs[conv.id];
    convs[conv.id] = conv;
    store === null || store === void 0 ? void 0 : store.set('conversations', convs);
    if (isNew)
        (0, analytics_1.getAnalytics)().trackConversation();
    return { success: true };
}));
electron_1.ipcMain.handle('conversations-load', (_event, id) => __awaiter(void 0, void 0, void 0, function* () {
    const convs = (store === null || store === void 0 ? void 0 : store.get('conversations', {})) || {};
    return convs[id] || null;
}));
electron_1.ipcMain.handle('conversations-delete', (_event, id) => __awaiter(void 0, void 0, void 0, function* () {
    const convs = (store === null || store === void 0 ? void 0 : store.get('conversations', {})) || {};
    delete convs[id];
    store === null || store === void 0 ? void 0 : store.set('conversations', convs);
    return { success: true };
}));
// Pre-seed agent session with saved messages (for context on conversation reload)
electron_1.ipcMain.handle('session-seed', (_event, sessionId, messages) => __awaiter(void 0, void 0, void 0, function* () {
    if (typeof sessionId !== 'string' || !sessionId)
        return { success: false, error: 'sessionId inválido.' };
    if (!Array.isArray(messages))
        return { success: false, error: 'messages inválido.' };
    const agent = yield loadAgentModule();
    const sm = agent.getSessionManager();
    sm.getOrCreate(sessionId);
    for (const msg of messages.slice(-8)) {
        const role = msg.role === 'user' ? 'user' : 'assistant';
        sm.addMessage(sessionId, role, msg.content);
    }
    return { success: true };
}));
// ============================================================================
// ANALYTICS
// ============================================================================
electron_1.ipcMain.handle('analytics-summary', () => __awaiter(void 0, void 0, void 0, function* () {
    return (0, analytics_1.getAnalytics)().getSummary();
}));
electron_1.ipcMain.handle('analytics-track-message', () => __awaiter(void 0, void 0, void 0, function* () {
    (0, analytics_1.getAnalytics)().trackMessage();
    return { success: true };
}));
electron_1.ipcMain.handle('save-preferences', (_event, prefs) => __awaiter(void 0, void 0, void 0, function* () {
    if (store)
        store.set('userPreferences', prefs);
    return { success: true };
}));
electron_1.ipcMain.handle('get-preferences', () => __awaiter(void 0, void 0, void 0, function* () {
    return store ? store.get('userPreferences', {}) : {};
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
    startWorkspaceWatchers(); // Reinicia watchers com novo workspace
    return { success: true, workspaces };
}));
electron_1.ipcMain.handle('workspace-remove', (_event, path) => __awaiter(void 0, void 0, void 0, function* () {
    if (!store)
        return { success: false };
    const selectedPath = normalizeFsPath(path);
    let workspaces = store.get('workspaces', []);
    workspaces = workspaces.filter(w => normalizeFsPath(w) !== selectedPath);
    store.set('workspaces', workspaces);
    startWorkspaceWatchers(); // Reinicia watchers sem workspace removido
    return { success: true, workspaces };
}));
/** Re-indexa todos os documentos dos workspaces para o RAG. */
electron_1.ipcMain.handle('rag-index-workspace', () => __awaiter(void 0, void 0, void 0, function* () {
    const workspaces = getWorkspaceRoots();
    if (workspaces.length === 0)
        return { success: false, error: 'Nenhum workspace configurado.' };
    const result = yield (0, doc_index_1.getDocIndex)().indexarWorkspace(workspaces);
    return Object.assign({ success: true }, result);
}));
/** Retorna estatísticas do índice RAG atual. */
electron_1.ipcMain.handle('rag-stats', () => __awaiter(void 0, void 0, void 0, function* () {
    return (0, doc_index_1.getDocIndex)().getStats();
}));
// ============================================================================
// FILE WATCHER — auto re-indexa RAG quando arquivos mudam nos workspaces
// ============================================================================
const activeWatchers = [];
let ragReindexTimer = null;
const RAG_DEBOUNCE_MS = 5000; // 5s debounce para agrupar mudanças rápidas
function scheduleRagReindex() {
    if (ragReindexTimer)
        clearTimeout(ragReindexTimer);
    ragReindexTimer = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
        ragReindexTimer = null;
        const ws = getWorkspaceRoots();
        if (ws.length === 0)
            return;
        try {
            const result = yield (0, doc_index_1.getDocIndex)().indexarWorkspace(ws);
            console.log(`[FileWatcher] RAG re-indexado: ${result.chunks} chunks, ${result.arquivos} arquivos`);
        }
        catch (e) {
            console.warn('[FileWatcher] RAG re-index falhou:', e.message);
        }
    }), RAG_DEBOUNCE_MS);
}
const WATCHED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.docx', '.doc']);
function startWorkspaceWatchers() {
    // Limpa watchers anteriores
    for (const w of activeWatchers) {
        try {
            w.close();
        }
        catch (_a) { }
    }
    activeWatchers.length = 0;
    const workspaces = getWorkspaceRoots();
    for (const wsPath of workspaces) {
        try {
            const watcher = fs.watch(wsPath, { recursive: true }, (_event, filename) => {
                if (!filename)
                    return;
                const ext = path.extname(filename).toLowerCase();
                if (WATCHED_EXTENSIONS.has(ext)) {
                    console.log(`[FileWatcher] Mudança detectada: ${filename}`);
                    scheduleRagReindex();
                }
            });
            activeWatchers.push(watcher);
        }
        catch (e) {
            console.warn(`[FileWatcher] Não foi possível monitorar ${wsPath}:`, e.message);
        }
    }
    if (activeWatchers.length > 0) {
        console.log(`[FileWatcher] Monitorando ${activeWatchers.length} workspace(s)`);
    }
}
/** Baixa os códigos de legislação do Planalto e re-indexa o RAG. */
electron_1.ipcMain.handle('rag-download-legislacao', (_e_1, ...args_1) => __awaiter(void 0, [_e_1, ...args_1], void 0, function* (_e, forcar = false) {
    const userDataDir = electron_1.app.getPath('userData');
    const fn = forcar ? legislacao_downloader_1.downloadTudo : legislacao_downloader_1.downloadIncremental;
    const result = yield fn(userDataDir, (msg) => {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('rag-legislacao-progress', msg);
    });
    // Garante que a pasta de legislação está nos workspaces
    const legDir = result.dir;
    const workspaces = store.get('workspaces', []);
    if (!workspaces.includes(legDir)) {
        workspaces.push(legDir);
        store.set('workspaces', workspaces);
    }
    const indexResult = yield (0, doc_index_1.getDocIndex)().indexarWorkspace([legDir, ...workspaces.filter(w => w !== legDir)]);
    return Object.assign(Object.assign({}, result), { indexResult });
}));
/** Retorna estatísticas dos arquivos de legislação já baixados. */
electron_1.ipcMain.handle('rag-legislacao-stats', () => __awaiter(void 0, void 0, void 0, function* () {
    return (0, legislacao_downloader_1.getLegislacaoStats)(electron_1.app.getPath('userData'));
}));
// Check PJe status via browser
electron_1.ipcMain.handle('check-pje', () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const page = (0, browser_manager_1.getActivePage)();
        const url = (_a = page === null || page === void 0 ? void 0 : page.url()) !== null && _a !== void 0 ? _a : null;
        const isPje = typeof url === 'string' && url.includes('pje.');
        // Detecta tribunal pela URL (ex: pje.tjpa.jus.br → TJPA, pje.trt8.jus.br → TRT8)
        let tribunalAtivo = null;
        if (isPje && url) {
            const match = url.match(/pje\.([a-z0-9]+)\.jus\.br/i);
            if (match === null || match === void 0 ? void 0 : match[1])
                tribunalAtivo = match[1].toUpperCase();
        }
        // Tribunal preferido salvo na memória do usuário
        const mem = (0, memory_1.getMemory)();
        const [memoriaData, usuario] = yield Promise.all([mem.carregar(), mem.getUsuario()]);
        const pref = ((_b = memoriaData.preferencias) === null || _b === void 0 ? void 0 : _b['tribunal_preferido']) || usuario.tribunal_preferido || null;
        return { connected: !!url, isPje, url, tribunalAtivo, tribunalPreferido: pref };
    }
    catch (_c) {
        return { connected: false, isPje: false, url: null, tribunalAtivo: null, tribunalPreferido: null };
    }
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
            // Injeta dialog nativo do Electron para confirmação de ações perigosas
            const confirmFn = (titulo, detalhe) => __awaiter(this, void 0, void 0, function* () {
                const { response } = yield electron_1.dialog.showMessageBox({
                    type: 'warning',
                    buttons: ['Cancelar', 'Executar'],
                    defaultId: 0,
                    cancelId: 0,
                    title: titulo,
                    message: titulo,
                    detail: detalhe,
                    noLink: true
                });
                return response === 1;
            });
            const { setConfirmDialog } = yield Promise.resolve().then(() => __importStar(require('./skills/os/sistema')));
            setConfirmDialog(confirmFn);
            agentInitialized = true;
        }
        return agent;
    });
}
// Forward agent events to renderer (com guard contra listeners duplicados)
let agentEventForwardingActive = false;
function setupAgentEventForwarding() {
    return __awaiter(this, void 0, void 0, function* () {
        if (agentEventForwardingActive)
            return;
        agentEventForwardingActive = true;
        const agent = yield loadAgentModule();
        agent.agentEmitter.removeAllListeners('agent-event');
        agent.agentEmitter.on('agent-event', (event) => {
            console.log('[Agent Event]', event.type);
            if (mainWindow) {
                mainWindow.webContents.send('agent-event', event);
            }
        });
    });
}
function normalizeIntentText(raw) {
    return String(raw || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}
/**
 * Detects ambiguous objectives (PC vs PJe) and injects a disambiguation
 * instruction directly into the objective text so Claude is forced to ask
 * before acting. This works regardless of system prompt encoding issues.
 */
function injectDisambiguationIfNeeded(objetivo) {
    const lower = normalizeIntentText(objetivo);
    const pjeSignals = ['pje', 'processo', 'tribunal', 'trt', 'trf', 'tj', 'peticao', 'despacho', 'audiencia', 'expediente', 'cnj', 'publicacao', 'intimacao'];
    const pcSignals = ['download', 'desktop', 'area de trabalho', 'c:', 'd:', 'meu computador', 'minha maquina', '.pdf', '.docx', '.xlsx', '.txt', '.png', '.jpg', 'pasta downloads', 'pasta documentos'];
    const hasPjeContext = pjeSignals.some(t => lower.includes(t));
    const hasPcContext = pcSignals.some(t => lower.includes(t));
    // File/folder/document ambiguity: could be PC or PJe
    const fileAmbiguous = ['pasta', 'pastas', 'arquivo', 'arquivos', 'documento', 'documentos'];
    if (fileAmbiguous.some(t => lower.includes(t)) && !hasPjeContext && !hasPcContext) {
        return `[INSTRUCAO OBRIGATORIA: Este pedido contem termo ambiguo. Use tipo=pergunta perguntando ao usuario se quer acessar o PC (computador local, usando os_listar ou os_arquivos) ou o PJe (sistema judicial, usando pje_agir). NAO execute nenhuma skill antes de perguntar.] ${objetivo}`;
    }
    // Screen/tela ambiguity: could be PC screen or PJe screen
    const screenAmbiguous = ['minha tela', 'minha area', 'o que ta na tela', 'o que esta na tela', 'ver a tela', 'ver tela', 'capturar tela'];
    if (screenAmbiguous.some(t => lower.includes(t)) && !hasPjeContext && !hasPcContext) {
        return `[INSTRUCAO OBRIGATORIA: Use tipo=pergunta perguntando se o usuario quer ver a tela do computador (pc_agir) ou algo no PJe (pje_agir).] ${objetivo}`;
    }
    return objetivo;
}
function heuristicRouteForObjective(objetivoRaw, activeUrl) {
    const objetivo = normalizeIntentText(objetivoRaw);
    const isPJeActive = Boolean(activeUrl && /pje\./i.test(activeUrl));
    if (!objetivo)
        return { decided: true, useAgent: false, reason: 'objetivo_vazio' };
    const shortConfirmationSignals = new Set([
        'sim',
        'ok',
        'pode',
        'confirmo',
        'prosseguir',
        'continuar',
        'nao',
        'cancelar'
    ]);
    if (isPJeActive && shortConfirmationSignals.has(objetivo)) {
        return { decided: true, useAgent: true, reason: 'confirmacao_curta_com_pje_ativo' };
    }
    const smallTalkSignals = [
        'oi',
        'ola',
        'bom dia',
        'boa tarde',
        'boa noite',
        'obrigado',
        'valeu'
    ];
    if (smallTalkSignals.includes(objetivo)) {
        return { decided: true, useAgent: false, reason: 'small_talk' };
    }
    const questionOnlySignals = [
        'o que e',
        'o que eh',
        'explique',
        'como funciona',
        'qual a diferenca',
        'resuma',
        'traduza'
    ];
    const actionSignals = [
        'abrir',
        'abre',
        'abra',
        'acessar',
        'acesse',
        'entrar',
        'entre',
        'login',
        'logar',
        'navegar',
        'navegue',
        'ir para',
        'vai',
        'vai no',
        'vai na',
        'va',
        'me leva',
        'leva',
        'clicar',
        'clique',
        'clica',
        'preencher',
        'preencha',
        'digitar',
        'digite',
        'selecionar',
        'selecione',
        'consultar',
        'consulte',
        'buscar',
        'busque',
        'pesquisar',
        'pesquise',
        'listar',
        'liste',
        'anexar',
        'anexe',
        'baixar',
        'baixe',
        'protocolar',
        'protocole',
        'peticionar',
        'peticione',
        'gerar documento',
        'novo processo',
        'movimentacoes',
        'movimentacoes do processo'
    ];
    const pjeSignals = [
        'pje',
        'trt',
        'trf',
        'tj',
        'certificado',
        'processo',
        'cnj',
        'peticionamento',
        'peticao',
        'aba'
    ];
    const hasQuestionOnly = questionOnlySignals.some(token => objetivo.includes(token));
    const hasActionSignal = actionSignals.some(token => objetivo.includes(token));
    const hasCNJNumber = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(objetivoRaw);
    // Capability questions: "consegue X?", "pode Y?", "tem como Z?" → implicit action requests
    const capabilitySignals = ['consegue', 'pode ', 'poderia', 'tem como', 'consigo', 'da pra', 'da para', 'e possivel'];
    const hasCapabilitySignal = capabilitySignals.some(t => objetivo.includes(t));
    // File/folder/screen queries always go to agent — it handles PC vs PJe disambiguation
    const ambiguousTerms = ['pasta', 'pastas', 'arquivo', 'arquivos', 'documento', 'documentos', 'tela', 'desktop', 'area de trabalho'];
    const hasAmbiguousTerm = ambiguousTerms.some(t => objetivo.includes(t));
    if (hasCNJNumber) {
        return { decided: true, useAgent: true, reason: 'numero_cnj_detectado' };
    }
    // Any action signal → agent (agent decides PJe vs PC vs OS)
    if (hasActionSignal) {
        return { decided: true, useAgent: true, reason: 'acao_operacional' };
    }
    // Capability questions with ambiguous terms → agent to disambiguate
    if (hasCapabilitySignal && hasAmbiguousTerm) {
        return { decided: true, useAgent: true, reason: 'capability_question_needs_agent' };
    }
    if (hasQuestionOnly && !hasActionSignal) {
        return { decided: true, useAgent: false, reason: 'pergunta_informativa' };
    }
    // Sem sinal claro: delegar para classificador semântico.
    return { decided: false, useAgent: false, reason: 'ambiguous' };
}
function parseSemanticModeResponse(raw) {
    const text = String(raw || '').trim();
    if (!text)
        return null;
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i)
        || text.match(/```\s*([\s\S]*?)\s*```/i);
    const candidate = (fenced && fenced[1])
        ? fenced[1].trim()
        : (text.includes('{') && text.includes('}') ? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1) : text);
    try {
        const parsed = JSON.parse(candidate);
        const mode = String((parsed === null || parsed === void 0 ? void 0 : parsed.mode) || '').toLowerCase();
        const confidenceRaw = Number(parsed === null || parsed === void 0 ? void 0 : parsed.confidence);
        const confidence = Number.isFinite(confidenceRaw)
            ? Math.max(0, Math.min(1, confidenceRaw))
            : undefined;
        const reason = String((parsed === null || parsed === void 0 ? void 0 : parsed.reason) || 'semantic_router').trim();
        if (mode === 'agent') {
            return Object.assign({ useAgent: true, reason, source: 'semantic' }, (confidence !== undefined ? { confidence } : {}));
        }
        if (mode === 'chat') {
            return Object.assign({ useAgent: false, reason, source: 'semantic' }, (confidence !== undefined ? { confidence } : {}));
        }
        return null;
    }
    catch (_a) {
        return null;
    }
}
function semanticRouteForObjective(objetivoRaw, activeUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const objective = String(objetivoRaw || '').trim();
        if (!objective)
            return null;
        try {
            const { callAI } = yield Promise.resolve().then(() => __importStar(require('./ai-handler')));
            const system = `Voce eh um classificador semantico para rotear mensagens de um assistente juridico com acesso ao PJe (sistema judicial), ao Windows/PC e ao sistema de arquivos.

Decida o modo:
- "agent": quando a mensagem pede ACAO em qualquer sistema — PJe judicial, Windows/PC, arquivos, browser, mouse/teclado. Exemplos: abrir, acessar, navegar, clicar, listar, controlar, executar, ver a tela, mover arquivo, consultar processo, preencher formulario. Inclui perguntas de capacidade ("consegue X?", "pode Y?") quando X e uma acao.
- "chat": quando a mensagem pede explicacao juridica, opiniao, analise de texto, calculo de prazo, estrategia processual, resumo, conversa geral sem acao em sistema.

Regras:
- Considere intencao semantica, nao apenas palavras-chave.
- Se a mensagem parecer pedido de acao em qualquer sistema (nao so PJe), use "agent".
- Responda APENAS JSON valido:
{"mode":"agent|chat","confidence":0.0,"reason":"curto"}`;
            const user = JSON.stringify({
                objective,
                activeUrl: activeUrl || null,
                pjeActive: Boolean(activeUrl && /pje\./i.test(activeUrl || ''))
            });
            const response = yield callAI({
                system,
                user,
                temperature: 0,
                maxTokens: 140,
                // Usa o agentModel do provider ativo (não hardcodar modelo específico)
            });
            return parseSemanticModeResponse(response);
        }
        catch (error) {
            console.warn('[Router] Semantic routing failed:', (error === null || error === void 0 ? void 0 : error.message) || error);
            return null;
        }
    });
}
function shouldUseAgentLoopForObjective(objetivoRaw, activeUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const heuristic = heuristicRouteForObjective(objetivoRaw, activeUrl);
        if (heuristic.decided) {
            return {
                useAgent: heuristic.useAgent,
                reason: heuristic.reason,
                source: 'heuristic'
            };
        }
        const semantic = yield semanticRouteForObjective(objetivoRaw, activeUrl);
        if (semantic) {
            return semantic;
        }
        return {
            useAgent: false,
            reason: 'fallback_chat',
            source: 'fallback'
        };
    });
}
electron_1.ipcMain.handle('agent-should-handle', (_event, objetivo) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    let activeUrl = null;
    try {
        activeUrl = (_b = (_a = (0, browser_manager_1.getActivePage)()) === null || _a === void 0 ? void 0 : _a.url()) !== null && _b !== void 0 ? _b : null;
    }
    catch (_c) { }
    return yield shouldUseAgentLoopForObjective(objetivo, activeUrl);
}));
// ============================================================================
// TELEGRAM BOT (Modo 24/7)
// ============================================================================
const telegram_bot_1 = require("./telegram-bot");
const user_input_1 = require("./user-input");
function loadTelegramToken() {
    if (!store)
        return '';
    const raw = String(store.get('telegramToken', '') || '').trim();
    if (!raw)
        return '';
    if (!(0, crypto_store_1.isEncrypted)(raw)) {
        // Token legado em plaintext — migra para criptografado imediatamente
        store.set('telegramToken', (0, crypto_store_1.encryptApiKey)(raw));
        return raw;
    }
    return (0, crypto_store_1.safeDecrypt)(raw);
}
function initTelegramBotIfConfigured() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!store)
            return;
        const enabled = store.get('telegramEnabled', false);
        if (!enabled)
            return;
        const token = loadTelegramToken();
        const userId = store.get('telegramUserId', 0);
        if (!token || !userId)
            return;
        try {
            yield (0, telegram_bot_1.startBot)({ token, authorizedUserId: userId }, runAgentForTelegram);
            (0, user_input_1.setNotifyFn)((prompt) => (0, telegram_bot_1.sendMessage)(userId, prompt));
            trayModeActive = true;
            if (!tray)
                createTray();
            console.log('[Telegram] Bot iniciado automaticamente (modo 24/7 ativo)');
        }
        catch (e) {
            console.error('[Telegram] Falha ao iniciar bot:', e.message);
        }
    });
}
function runAgentForTelegram(text, sessionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const agent = yield ensureAgentInitialized();
        const tenantConfig = agent.getDefaultTenantConfig();
        const objetivoFinal = injectDisambiguationIfNeeded(text);
        return yield agent.runAgentLoop({
            objetivo: objetivoFinal,
            config: { maxIterations: 8, timeoutMs: 120000 },
            tenantConfig,
            sessionId,
        });
    });
}
/** Retorna config do Telegram (sem o token completo) */
electron_1.ipcMain.handle('telegram-get-config', () => {
    if (!store)
        return { enabled: false, hasToken: false, userId: 0 };
    const token = loadTelegramToken();
    const userId = store.get('telegramUserId', 0);
    const enabled = store.get('telegramEnabled', false);
    return {
        enabled,
        hasToken: token.length > 0,
        tokenPreview: token ? `${token.slice(0, 8)}...${token.slice(-4)}` : '',
        userId,
        running: (0, telegram_bot_1.isBotRunning)()
    };
});
/** Salva token + userId do Telegram */
electron_1.ipcMain.handle('telegram-set-config', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { token, userId }) {
    if (!store)
        return { error: 'Store não inicializado' };
    const normalizedToken = String(token || '').trim();
    const normalizedUserId = Number(userId) || 0;
    store.set('telegramToken', normalizedToken ? (0, crypto_store_1.encryptApiKey)(normalizedToken) : '');
    store.set('telegramUserId', normalizedUserId);
    return { success: true };
}));
/** Ativa o modo 24/7 (liga o bot + tray) */
electron_1.ipcMain.handle('telegram-enable', () => __awaiter(void 0, void 0, void 0, function* () {
    if (!store)
        return { error: 'Store não inicializado' };
    const token = loadTelegramToken();
    const userId = store.get('telegramUserId', 0);
    if (!token || !userId) {
        return { error: 'Configure o token e o ID do usuário antes de ativar.' };
    }
    try {
        yield (0, telegram_bot_1.startBot)({ token, authorizedUserId: userId }, runAgentForTelegram);
        (0, user_input_1.setNotifyFn)((prompt) => (0, telegram_bot_1.sendMessage)(userId, prompt));
        store.set('telegramEnabled', true);
        refreshTrayMenu();
        return { success: true, running: true };
    }
    catch (e) {
        return { error: `Falha ao iniciar bot: ${e.message}` };
    }
}));
/** Desativa o modo 24/7 (desliga o bot + remove comportamento de tray) */
electron_1.ipcMain.handle('telegram-disable', () => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, telegram_bot_1.stopBot)();
    if (store)
        store.set('telegramEnabled', false);
    refreshTrayMenu();
    return { success: true, running: false };
}));
/** Retorna status em tempo real */
electron_1.ipcMain.handle('telegram-get-status', () => ({
    running: (0, telegram_bot_1.isBotRunning)(),
    trayActive: trayModeActive
}));
// IPC: Run Agent Loop — proxy para backend (com fallback local)
electron_1.ipcMain.handle('agent-run', (_event, objetivo, config, sessionId) => __awaiter(void 0, void 0, void 0, function* () {
    // Verificar licença antes de executar
    const license = yield (0, license_1.checkLicense)();
    if (license.status === 'not_authenticated') {
        return { success: false, error: 'not_authenticated' };
    }
    if (license.status === 'trial_expired') {
        return { success: false, error: 'trial_expired' };
    }
    // Normaliza números CNJ sem pontuação (20 dígitos → NNNNNNN-NN.NNNN.N.NN.NNNN)
    const objetivoNorm = objetivo.replace(/[\u200B\u200C\u200D\uFEFF]/g, '').replace(/\b(\d{20})\b/g, (_, d) => `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`);
    console.log('[Agent] CNJ normalize:', objetivo, '->', objetivoNorm);
    const objetivoFinal = injectDisambiguationIfNeeded(objetivoNorm);
    const maxIter = Math.min(Math.max(Number(config === null || config === void 0 ? void 0 : config.maxIterations) || 5, 1), 10);
    const timeoutMs = Math.min(Math.max(Number(config === null || config === void 0 ? void 0 : config.timeoutMs) || 300000, 10000), 600000);
    // Tenta via backend (processo separado)
    if ((0, backend_client_1.isBackendAlive)()) {
        try {
            const resposta = yield (0, backend_client_1.rpcCall)('agent-run', {
                objetivo: objetivoFinal,
                config: { maxIterations: maxIter, timeoutMs },
                sessionId: sessionId || AGENT_SESSION_ID,
            });
            return { success: true, resposta };
        }
        catch (error) {
            console.error('[Agent via Backend] Erro:', error.message);
            return { success: false, error: error.message };
        }
    }
    // Fallback: executa localmente (compatibilidade)
    try {
        const agent = yield ensureAgentInitialized();
        const tenantConfig = agent.getDefaultTenantConfig();
        const resposta = yield agent.runAgentLoop({
            objetivo: objetivoFinal,
            config: { maxIterations: maxIter, timeoutMs },
            tenantConfig,
            sessionId: sessionId || AGENT_SESSION_ID,
        });
        return { success: true, resposta };
    }
    catch (error) {
        console.error('[Agent Local] Erro:', error);
        return { success: false, error: error.message };
    }
}));
// IPC: Cancel Agent Loop — proxy para backend (com fallback local)
electron_1.ipcMain.handle('agent-cancel', () => __awaiter(void 0, void 0, void 0, function* () {
    if ((0, backend_client_1.isBackendAlive)()) {
        try {
            yield (0, backend_client_1.rpcCall)('agent-cancel');
            return { success: true };
        }
        catch ( /* fallback */_a) { /* fallback */ }
    }
    const agent = yield loadAgentModule();
    agent.cancelAgentLoop();
    return { success: true };
}));
// ============================================================================
// IPC: Plan & Orchestrator (Phase 1 AIOS)
// ============================================================================
electron_1.ipcMain.handle('ai-plan-execute', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { goal, sessionId }) {
    const license = yield (0, license_1.checkLicense)();
    if (license.status === 'not_authenticated') {
        return { success: false, error: 'not_authenticated' };
    }
    if (license.status === 'trial_expired') {
        return { success: false, error: 'trial_expired' };
    }
    try {
        yield ensureAgentInitialized();
        const { Orchestrator } = yield Promise.resolve().then(() => __importStar(require('./agent/orchestrator')));
        const orchestrator = new Orchestrator();
        _activeOrchestratorRef = orchestrator;
        _activeOrchestratorState = null;
        // Rastreia estado + forward de eventos para o renderer
        orchestrator.on('event', (evt) => {
            // Atualiza snapshot local
            if (evt.type === 'plan_created') {
                _activeOrchestratorState = {
                    planId: evt.plan.id,
                    goal: evt.plan.goal,
                    planStatus: 'executing',
                    subtasks: evt.plan.subtasks.map((t) => ({
                        id: t.id, description: t.description,
                        agentType: t.agentType, status: t.status,
                    })),
                };
            }
            else if (evt.type === 'plan_state_snapshot') {
                _activeOrchestratorState = evt.state;
            }
            else if (evt.type === 'subtask_started' && _activeOrchestratorState) {
                const st = _activeOrchestratorState.subtasks.find((t) => t.id === evt.subtaskId);
                if (st) {
                    st.status = 'running';
                    st.startedAt = Date.now();
                }
            }
            else if (evt.type === 'subtask_completed' && _activeOrchestratorState) {
                const st = _activeOrchestratorState.subtasks.find((t) => t.id === evt.subtaskId);
                if (st)
                    st.status = 'completed';
            }
            else if (evt.type === 'subtask_failed' && _activeOrchestratorState) {
                const st = _activeOrchestratorState.subtasks.find((t) => t.id === evt.subtaskId);
                if (st) {
                    st.status = 'failed';
                    st.error = evt.error;
                }
            }
            else if (evt.type === 'plan_completed' || evt.type === 'plan_failed') {
                if (_activeOrchestratorState) {
                    _activeOrchestratorState.planStatus = evt.type === 'plan_completed' ? 'completed' : 'failed';
                }
                _activeOrchestratorRef = null;
            }
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('agent-event', { type: 'orchestrator', data: evt });
        });
        const result = yield orchestrator.execute(goal, sessionId || AGENT_SESSION_ID);
        return { success: true, result };
    }
    catch (error) {
        _activeOrchestratorRef = null;
        console.error('[Orchestrator] Erro:', error.message);
        return { success: false, error: error.message };
    }
}));
// ============================================================================
// IPC: Orchestrator — estado em tempo real + cancel
// ============================================================================
electron_1.ipcMain.handle('orchestrator-get-state', () => _activeOrchestratorState);
electron_1.ipcMain.handle('orchestrator-cancel', () => __awaiter(void 0, void 0, void 0, function* () {
    if (!_activeOrchestratorRef)
        return { success: false, error: 'Nenhuma execução ativa' };
    yield _activeOrchestratorRef.cancel();
    _activeOrchestratorRef = null;
    return { success: true };
}));
electron_1.ipcMain.handle('orchestrator-pause', () => {
    if (!_activeOrchestratorRef)
        return { success: false, error: 'Nenhuma execução ativa' };
    _activeOrchestratorRef.pause();
    return { success: true };
});
electron_1.ipcMain.handle('orchestrator-resume', () => {
    if (!_activeOrchestratorRef)
        return { success: false, error: 'Nenhuma execução ativa' };
    _activeOrchestratorRef.resume();
    return { success: true };
});
electron_1.ipcMain.handle('orchestrator-is-paused', () => {
    var _a;
    return { paused: (_a = _activeOrchestratorRef === null || _activeOrchestratorRef === void 0 ? void 0 : _activeOrchestratorRef.isPaused) !== null && _a !== void 0 ? _a : false };
});
// ============================================================================
// IPC: Checkpoints (P3a AIOS — retomada de planos interrompidos)
// ============================================================================
electron_1.ipcMain.handle('checkpoint-list-pending', () => __awaiter(void 0, void 0, void 0, function* () {
    const { listPendingCheckpoints } = yield Promise.resolve().then(() => __importStar(require('./agent/checkpoint-store')));
    return listPendingCheckpoints();
}));
electron_1.ipcMain.handle('checkpoint-resume', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { planId }) {
    try {
        const { loadCheckpoint, restorePlanFromCheckpoint } = yield Promise.resolve().then(() => __importStar(require('./agent/checkpoint-store')));
        const checkpoint = loadCheckpoint(planId);
        if (!checkpoint)
            return { success: false, error: 'Checkpoint não encontrado' };
        yield ensureAgentInitialized();
        const { Orchestrator } = yield Promise.resolve().then(() => __importStar(require('./agent/orchestrator')));
        const orchestrator = new Orchestrator();
        orchestrator.on('event', (evt) => {
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('agent-event', {
                type: 'orchestrator',
                data: evt,
            });
        });
        const result = yield orchestrator.execute(checkpoint.goal, AGENT_SESSION_ID);
        return { success: true, result };
    }
    catch (error) {
        console.error('[Checkpoint] Erro ao retomar:', error.message);
        return { success: false, error: error.message };
    }
}));
electron_1.ipcMain.handle('checkpoint-remove', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { planId }) {
    const { removeCheckpoint } = yield Promise.resolve().then(() => __importStar(require('./agent/checkpoint-store')));
    removeCheckpoint(planId);
    return { success: true };
}));
// ============================================================================
// IPC: Scheduler (Phase 2 AIOS — Autonomia)
// ============================================================================
electron_1.ipcMain.handle('scheduler-list-goals', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getGoalStore } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
    return getGoalStore().getAllGoals();
}));
electron_1.ipcMain.handle('scheduler-add-goal', (_event, goalInput) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { getGoalStore, getScheduler } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
        const goal = yield getGoalStore().addGoal(goalInput);
        getScheduler().scheduleGoal(goal);
        return { success: true, goal };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}));
electron_1.ipcMain.handle('scheduler-update-goal', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { id, updates }) {
    try {
        const { getGoalStore, getScheduler } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
        const goal = yield getGoalStore().updateGoal(id, updates);
        if (goal)
            yield getScheduler().rescheduleGoal(id);
        return { success: true, goal };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}));
electron_1.ipcMain.handle('scheduler-remove-goal', (_event, id) => __awaiter(void 0, void 0, void 0, function* () {
    const { getGoalStore, getScheduler } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
    getScheduler().unscheduleGoal(id);
    const removed = yield getGoalStore().removeGoal(id);
    return { success: removed };
}));
electron_1.ipcMain.handle('scheduler-pause-goal', (_event, id) => __awaiter(void 0, void 0, void 0, function* () {
    const { getGoalStore, getScheduler } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
    yield getGoalStore().setStatus(id, 'paused');
    getScheduler().unscheduleGoal(id);
    return { success: true };
}));
electron_1.ipcMain.handle('scheduler-resume-goal', (_event, id) => __awaiter(void 0, void 0, void 0, function* () {
    const { getGoalStore, getScheduler } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
    const goal = yield getGoalStore().updateGoal(id, { status: 'active' });
    if (goal)
        getScheduler().scheduleGoal(goal);
    return { success: true };
}));
electron_1.ipcMain.handle('scheduler-run-now', (_event, id) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { getScheduler } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
        yield getScheduler().runNow(id);
        return { success: true };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}));
electron_1.ipcMain.handle('scheduler-get-runs', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { goalId, limit }) {
    const { getGoalStore } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
    return getGoalStore().getRunsForGoal(goalId, limit || 10);
}));
electron_1.ipcMain.handle('scheduler-get-status', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getScheduler, getRunningCount } = yield Promise.resolve().then(() => __importStar(require('./scheduler')));
    const status = getScheduler().getStatus();
    return Object.assign(Object.assign({}, status), { runningJobs: getRunningCount() });
}));
electron_1.ipcMain.handle('scheduler-set-auto-launch', (_event, enabled) => __awaiter(void 0, void 0, void 0, function* () {
    electron_1.app.setLoginItemSettings({
        openAtLogin: enabled,
        args: enabled ? ['--background'] : [],
    });
    return { success: true, enabled };
}));
electron_1.ipcMain.handle('scheduler-get-auto-launch', () => __awaiter(void 0, void 0, void 0, function* () {
    const settings = electron_1.app.getLoginItemSettings();
    return { enabled: settings.openAtLogin };
}));
// ============================================================================
// IPC: Brain (SQLite FTS5 + Knowledge Graph)
// ============================================================================
electron_1.ipcMain.handle('brain-get-graph', () => __awaiter(void 0, void 0, void 0, function* () {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { nodes: [], edges: [] };
    return brain.getFullGraph();
}));
electron_1.ipcMain.handle('brain-get-subgraph', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { nodeId, depth }) {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { nodes: [], edges: [] };
    return brain.getSubgraph(nodeId, depth !== null && depth !== void 0 ? depth : 1);
}));
electron_1.ipcMain.handle('brain-search', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { query, types, limit }) {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return [];
    return brain.search(query, { types: types, limit });
}));
electron_1.ipcMain.handle('brain-get-stats', () => __awaiter(void 0, void 0, void 0, function* () {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { nodeCount: 0, edgeCount: 0, byType: {} };
    return brain.getStats();
}));
electron_1.ipcMain.handle('brain-get-node', (_event, nodeId) => __awaiter(void 0, void 0, void 0, function* () {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return null;
    return brain.getNode(nodeId);
}));
electron_1.ipcMain.handle('brain-run-dream', () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { runDream } = yield Promise.resolve().then(() => __importStar(require('./brain/dream')));
        const brain = (0, brain_1.getBrain)();
        return yield runDream(brain);
    }
    catch (err) {
        console.error('[Brain] Dream falhou:', err);
        return { error: err.message };
    }
}));
electron_1.ipcMain.handle('brain-export', () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { exportBrain } = yield Promise.resolve().then(() => __importStar(require('./brain/brain-export')));
        const brain = (0, brain_1.getBrain)();
        return yield exportBrain(brain);
    }
    catch (err) {
        console.error('[Brain] Export falhou:', err);
        return { error: err.message };
    }
}));
electron_1.ipcMain.handle('brain-import', (_event, zipPath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { importBrain } = yield Promise.resolve().then(() => __importStar(require('./brain/brain-export')));
        const brain = (0, brain_1.getBrain)();
        return yield importBrain(brain, zipPath);
    }
    catch (err) {
        console.error('[Brain] Import falhou:', err);
        return { error: err.message };
    }
}));
electron_1.ipcMain.handle('brain-render-markdown', () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { renderBrainMarkdown } = yield Promise.resolve().then(() => __importStar(require('./brain/brain-renderer')));
        const brain = (0, brain_1.getBrain)();
        return yield renderBrainMarkdown(brain);
    }
    catch (err) {
        console.error('[Brain] Render falhou:', err);
        return { error: err.message };
    }
}));
// ============================================================================
// IPC: DataJud Pipeline
// ============================================================================
electron_1.ipcMain.handle('datajud-get-profile', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getProfile } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    return getProfile();
}));
electron_1.ipcMain.handle('datajud-save-profile', (_event, profile) => __awaiter(void 0, void 0, void 0, function* () {
    const { saveProfile } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    yield saveProfile(profile);
    return { success: true };
}));
electron_1.ipcMain.handle('datajud-set-api-key', (_event, key) => __awaiter(void 0, void 0, void 0, function* () {
    const { setDataJudApiKey, getSyncEngine } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    yield setDataJudApiKey(key);
    // Reinicia sync engine com a nova key
    const engine = getSyncEngine();
    if (engine)
        yield engine.restart();
    return { success: true };
}));
electron_1.ipcMain.handle('datajud-has-api-key', () => __awaiter(void 0, void 0, void 0, function* () {
    const { hasDataJudApiKey } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    return hasDataJudApiKey();
}));
electron_1.ipcMain.handle('datajud-add-processo', (_event, processo) => __awaiter(void 0, void 0, void 0, function* () {
    const { addMonitoredProcesso } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    yield addMonitoredProcesso(processo);
    return { success: true };
}));
electron_1.ipcMain.handle('datajud-remove-processo', (_event, numero) => __awaiter(void 0, void 0, void 0, function* () {
    const { removeMonitoredProcesso } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    yield removeMonitoredProcesso(numero);
    return { success: true };
}));
electron_1.ipcMain.handle('datajud-list-processos', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getMonitoredProcessos } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    return getMonitoredProcessos();
}));
electron_1.ipcMain.handle('datajud-search', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { numero, tribunal }) {
    const { getSyncEngine } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    const engine = getSyncEngine();
    if (!engine)
        return { error: 'Pipeline não inicializado' };
    const result = yield engine.queryCold(numero, tribunal);
    return result || { error: 'Processo não encontrado' };
}));
electron_1.ipcMain.handle('datajud-trigger-hot', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getSyncEngine } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    const engine = getSyncEngine();
    if (!engine)
        return { error: 'Pipeline não inicializado' };
    return engine.runHotSync();
}));
electron_1.ipcMain.handle('datajud-trigger-warm', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getSyncEngine } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    const engine = getSyncEngine();
    if (!engine)
        return { error: 'Pipeline não inicializado' };
    return engine.runWarmSync();
}));
electron_1.ipcMain.handle('datajud-get-sync-state', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getSyncEngine } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    const engine = getSyncEngine();
    if (!engine)
        return null;
    return engine.getState();
}));
electron_1.ipcMain.handle('datajud-get-stats', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getProfile, hasDataJudApiKey, getProcessoStoreStats, getJurisprudenciaStats, getSyncEngine } = yield Promise.resolve().then(() => __importStar(require('./datajud')));
    const profile = yield getProfile();
    const hasKey = yield hasDataJudApiKey();
    const processoStats = getProcessoStoreStats();
    const jurispStats = getJurisprudenciaStats();
    const engine = getSyncEngine();
    const state = engine === null || engine === void 0 ? void 0 : engine.getState();
    return {
        profileConfigured: profile.tribunais.length > 0 || profile.areasAtuacao.length > 0,
        hasApiKey: hasKey,
        processosMonitorados: profile.processosMonitorados.length,
        processosAtivos: profile.processosMonitorados.filter(p => p.ativo).length,
        decisoesArmazenadas: jurispStats.total,
        processosArmazenados: processoStats.total,
        lastHotSync: (state === null || state === void 0 ? void 0 : state.lastHotSync) || null,
        lastWarmSync: (state === null || state === void 0 ? void 0 : state.lastWarmSync) || null,
        consecutiveErrors: (state === null || state === void 0 ? void 0 : state.consecutiveErrors) || 0,
    };
}));
// ============================================================================
// IPC: Knowledge Base de Documentos (Fase 3.5.3)
// ============================================================================
// Schemas
electron_1.ipcMain.handle('doc-kb-list-schemas', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getAllSchemas } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return getAllSchemas();
}));
electron_1.ipcMain.handle('doc-kb-get-schema', (_, id) => __awaiter(void 0, void 0, void 0, function* () {
    const { getSchema } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return getSchema(id);
}));
electron_1.ipcMain.handle('doc-kb-search-schemas', (_, query) => __awaiter(void 0, void 0, void 0, function* () {
    const { searchSchemas } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return searchSchemas(query);
}));
electron_1.ipcMain.handle('doc-kb-get-categories', () => __awaiter(void 0, void 0, void 0, function* () {
    const { listCategories } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return listCategories();
}));
electron_1.ipcMain.handle('doc-kb-schemas-by-category', (_, cat) => __awaiter(void 0, void 0, void 0, function* () {
    const { getSchemasByCategory } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return getSchemasByCategory(cat);
}));
// Examples
electron_1.ipcMain.handle('doc-kb-get-examples', (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { schemaId, limit }) {
    const { getExamples } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-examples')));
    return getExamples(schemaId, limit);
}));
electron_1.ipcMain.handle('doc-kb-search-examples', (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { query, limit }) {
    const { searchExamples } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-examples')));
    return searchExamples(query, limit);
}));
electron_1.ipcMain.handle('doc-kb-get-stats', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getExampleStats } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-examples')));
    const { getSchemaStats } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return {
        schemas: getSchemaStats(),
        examples: getExampleStats(),
    };
}));
// Import
electron_1.ipcMain.handle('doc-kb-import-folder', (_, folderPath) => __awaiter(void 0, void 0, void 0, function* () {
    const { importFolder } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-importer')));
    return importFolder(folderPath, (msg) => {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('doc-kb-import-progress', msg);
    });
}));
electron_1.ipcMain.handle('doc-kb-import-file', (_, filePath) => __awaiter(void 0, void 0, void 0, function* () {
    const { importFile } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-importer')));
    return importFile(filePath);
}));
electron_1.ipcMain.handle('doc-kb-select-and-import', () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Selecionar pasta com documentos jurídicos',
    });
    if (result.canceled || !result.filePaths[0])
        return { imported: 0, skipped: 0, errors: [] };
    const { importFolder } = yield Promise.resolve().then(() => __importStar(require('./legal/doc-importer')));
    return importFolder(result.filePaths[0], (msg) => {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('doc-kb-import-progress', msg);
    });
}));
// ============================================================================
// IPC: Batch Petitioning (Produção em Lote)
// ============================================================================
electron_1.ipcMain.handle('batch-list-lotes', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getLoteStore } = yield Promise.resolve().then(() => __importStar(require('./batch')));
    return getLoteStore().getAllLotes();
}));
electron_1.ipcMain.handle('batch-get-lote', (_event, id) => __awaiter(void 0, void 0, void 0, function* () {
    const { getLoteStore } = yield Promise.resolve().then(() => __importStar(require('./batch')));
    return getLoteStore().getLote(id);
}));
electron_1.ipcMain.handle('batch-remove-lote', (_event, id) => __awaiter(void 0, void 0, void 0, function* () {
    const { getLoteStore, unregisterPipeline } = yield Promise.resolve().then(() => __importStar(require('./batch')));
    unregisterPipeline(id);
    return getLoteStore().removeLote(id);
}));
electron_1.ipcMain.handle('batch-create-lote', (_event, params) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        yield ensureAgentInitialized(); // Skills precisam estar registradas
        const { createBatchLote, registerPipeline } = yield Promise.resolve().then(() => __importStar(require('./batch')));
        // Ler conteúdo dos documentos anexados e adicionar ao contexto
        if (params.attachedDocs && params.attachedDocs.length > 0) {
            const fs = yield Promise.resolve().then(() => __importStar(require('fs')));
            const path = yield Promise.resolve().then(() => __importStar(require('path')));
            const docContents = [];
            for (const docPath of params.attachedDocs) {
                try {
                    const ext = path.extname(docPath).toLowerCase();
                    let text = '';
                    if (ext === '.txt' || ext === '.md') {
                        text = fs.readFileSync(docPath, 'utf-8');
                    }
                    else if (ext === '.docx') {
                        const mammoth = yield Promise.resolve().then(() => __importStar(require('mammoth')));
                        const result = yield mammoth.extractRawText({ path: docPath });
                        text = result.value;
                    }
                    else if (ext === '.pdf') {
                        const pdfParseModule = yield Promise.resolve().then(() => __importStar(require('pdf-parse')));
                        const buf = fs.readFileSync(docPath);
                        const pdfParseFn = (_a = pdfParseModule === null || pdfParseModule === void 0 ? void 0 : pdfParseModule.default) !== null && _a !== void 0 ? _a : pdfParseModule;
                        if (typeof pdfParseFn === 'function') {
                            const data = yield pdfParseFn(buf);
                            text = data.text;
                        }
                    }
                    if (text && text.length > 50) {
                        const name = path.basename(docPath);
                        docContents.push(`--- [${name}] ---\n${text.substring(0, 8000)}`);
                        console.log(`[Batch] Documento anexado: ${name} (${text.length} chars)`);
                    }
                }
                catch (e) {
                    console.warn(`[Batch] Erro ao ler doc anexado ${docPath}: ${e.message}`);
                }
            }
            if (docContents.length > 0) {
                const docContext = '\n\n## DOCUMENTOS DE REFERÊNCIA (anexados pelo advogado)\n\n' + docContents.join('\n\n');
                params.tese = (params.tese || '') + docContext;
            }
        }
        const { lote, pipeline } = yield createBatchLote(params);
        // Forward pipeline events to renderer
        pipeline.on('event', (event) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('batch-event', event);
            }
        });
        registerPipeline(lote.id, pipeline);
        // Start pipeline (async — não espera)
        pipeline.run().catch((err) => {
            console.error('[Batch] Pipeline error:', err.message);
        });
        return { success: true, loteId: lote.id, strategy: lote.strategy };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}));
electron_1.ipcMain.handle('batch-approve-strategy', (_event, loteId) => __awaiter(void 0, void 0, void 0, function* () {
    const { getActivePipeline } = yield Promise.resolve().then(() => __importStar(require('./batch')));
    const pipeline = getActivePipeline(loteId);
    if (!pipeline)
        return { success: false, error: 'Pipeline não encontrado' };
    yield pipeline.approveStrategy('app');
    return { success: true };
}));
electron_1.ipcMain.handle('batch-approve-wave', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { loteId, waveIndex, redraftIds }) {
    const { getActivePipeline } = yield Promise.resolve().then(() => __importStar(require('./batch')));
    const pipeline = getActivePipeline(loteId);
    if (!pipeline)
        return { success: false, error: 'Pipeline não encontrado' };
    yield pipeline.approveWave(waveIndex, 'app', redraftIds);
    return { success: true };
}));
electron_1.ipcMain.handle('batch-approve-protocol', (_event, loteId) => __awaiter(void 0, void 0, void 0, function* () {
    const { getActivePipeline } = yield Promise.resolve().then(() => __importStar(require('./batch')));
    const pipeline = getActivePipeline(loteId);
    if (!pipeline)
        return { success: false, error: 'Pipeline não encontrado' };
    yield pipeline.approveProtocol('app');
    return { success: true };
}));
electron_1.ipcMain.handle('batch-pause', (_event, loteId) => __awaiter(void 0, void 0, void 0, function* () {
    const { getActivePipeline } = yield Promise.resolve().then(() => __importStar(require('./batch')));
    const pipeline = getActivePipeline(loteId);
    if (!pipeline)
        return { success: false, error: 'Pipeline não encontrado' };
    yield pipeline.pause();
    return { success: true };
}));
electron_1.ipcMain.handle('batch-resume', (_event, loteId) => __awaiter(void 0, void 0, void 0, function* () {
    const { getActivePipeline } = yield Promise.resolve().then(() => __importStar(require('./batch')));
    const pipeline = getActivePipeline(loteId);
    if (!pipeline)
        return { success: false, error: 'Pipeline não encontrado' };
    yield pipeline.resume();
    return { success: true };
}));
electron_1.ipcMain.handle('batch-cancel', (_event, loteId) => __awaiter(void 0, void 0, void 0, function* () {
    const { getActivePipeline } = yield Promise.resolve().then(() => __importStar(require('./batch')));
    const pipeline = getActivePipeline(loteId);
    if (!pipeline)
        return { success: false, error: 'Pipeline não encontrado' };
    yield pipeline.cancel();
    return { success: true };
}));
// ─── Batch: Leitura/Escrita de petição (editor) ──────────────────
electron_1.ipcMain.handle('batch-read-peticao', (_event, filePath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const fs = yield Promise.resolve().then(() => __importStar(require('fs')));
        if (!fs.existsSync(filePath))
            return { success: false, error: 'Arquivo não encontrado' };
        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true, content };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}));
electron_1.ipcMain.handle('batch-save-peticao', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { filePath, content }) {
    try {
        const fs = yield Promise.resolve().then(() => __importStar(require('fs')));
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}));
electron_1.ipcMain.handle('batch-open-folder', (_event, folderPath) => __awaiter(void 0, void 0, void 0, function* () {
    const { shell } = yield Promise.resolve().then(() => __importStar(require('electron')));
    shell.openPath(folderPath);
    return { success: true };
}));
// ─── Batch: Export DOCX ──────────────────────────────────────────
electron_1.ipcMain.handle('batch-export-docx', (_event, filePath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const fs = yield Promise.resolve().then(() => __importStar(require('fs')));
        if (!fs.existsSync(filePath))
            return { success: false, error: 'Arquivo não encontrado' };
        const htmlContent = fs.readFileSync(filePath, 'utf-8');
        const outputPath = filePath.replace(/\.html?$/i, '.doc');
        // HTML-as-DOC: Word/LibreOffice open this natively
        const docContent = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
${htmlContent.replace(/<!DOCTYPE[^>]*>/i, '').replace(/<\/?html[^>]*>/gi, '')}
</html>`;
        fs.writeFileSync(outputPath, docContent, 'utf-8');
        const { shell } = yield Promise.resolve().then(() => __importStar(require('electron')));
        shell.showItemInFolder(outputPath);
        return { success: true, path: outputPath };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}));
// ─── Batch: Export PDF (via Chromium printToPDF) ─────────────────
electron_1.ipcMain.handle('batch-export-pdf', (_event, filePath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const fs = yield Promise.resolve().then(() => __importStar(require('fs')));
        const pathModule = yield Promise.resolve().then(() => __importStar(require('path')));
        if (!fs.existsSync(filePath))
            return { success: false, error: 'Arquivo não encontrado' };
        const htmlContent = fs.readFileSync(filePath, 'utf-8');
        const outputPath = filePath.replace(/\.html?$/i, '.pdf');
        // Use a hidden BrowserWindow to render HTML and print to PDF
        const { BrowserWindow: BW } = yield Promise.resolve().then(() => __importStar(require('electron')));
        const pdfWin = new BW({ show: false, width: 794, height: 1123 });
        // Load HTML content
        const tempPath = pathModule.join(pathModule.dirname(filePath), '_temp_pdf.html');
        fs.writeFileSync(tempPath, htmlContent, 'utf-8');
        yield pdfWin.loadFile(tempPath);
        const pdfBuffer = yield pdfWin.webContents.printToPDF({
            pageSize: 'A4',
            margins: { marginType: 'default' },
            printBackground: true,
        });
        fs.writeFileSync(outputPath, pdfBuffer);
        pdfWin.close();
        // Cleanup temp
        try {
            fs.unlinkSync(tempPath);
        }
        catch (_a) { }
        const { shell } = yield Promise.resolve().then(() => __importStar(require('electron')));
        shell.showItemInFolder(outputPath);
        return { success: true, path: outputPath };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}));
// ============================================================================
// IPC: Plugins (Phase 3 AIOS — Integrações Externas)
// ============================================================================
electron_1.ipcMain.handle('plugins-list', () => __awaiter(void 0, void 0, void 0, function* () {
    const { getPluginManager } = yield Promise.resolve().then(() => __importStar(require('./plugins')));
    return getPluginManager().listPlugins();
}));
electron_1.ipcMain.handle('plugins-get-status', (_event, pluginId) => __awaiter(void 0, void 0, void 0, function* () {
    const { getPluginManager } = yield Promise.resolve().then(() => __importStar(require('./plugins')));
    return getPluginManager().getPluginStatus(pluginId);
}));
electron_1.ipcMain.handle('plugins-get-auth-config', (_event, pluginId) => __awaiter(void 0, void 0, void 0, function* () {
    const { getPluginManager } = yield Promise.resolve().then(() => __importStar(require('./plugins')));
    return getPluginManager().getPluginAuthConfig(pluginId);
}));
electron_1.ipcMain.handle('plugins-start-oauth', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { pluginId, apiKey }) {
    try {
        const { getPluginManager } = yield Promise.resolve().then(() => __importStar(require('./plugins')));
        const pm = getPluginManager();
        const plugin = pm.getPlugin(pluginId);
        if (!plugin)
            return { success: false, error: 'Plugin não encontrado' };
        const auth = plugin.manifest.auth;
        // Desktop plugins sem auth — ativar direto
        if (!auth) {
            try {
                yield pm.connectPlugin(pluginId, { accessToken: 'local' });
                return { success: true };
            }
            catch (e) {
                return { success: false, error: `Erro ao ativar plugin local: ${e.message}` };
            }
        }
        // API Key auth — apiKey contém a chave
        if (auth.type === 'api_key') {
            if (!apiKey)
                return { success: false, error: 'API key obrigatória' };
            yield pm.connectPlugin(pluginId, { accessToken: apiKey });
            return { success: true };
        }
        // OAuth2 — usa credenciais embarcadas do providerGroup
        if (!auth.oauth2)
            return { success: false, error: 'Plugin não suporta OAuth' };
        const { getEmbeddedCredentials } = yield Promise.resolve().then(() => __importStar(require('./plugins/credentials')));
        const group = plugin.manifest.providerGroup;
        const embedded = group ? getEmbeddedCredentials(group) : null;
        const clientId = (embedded === null || embedded === void 0 ? void 0 : embedded.clientId) || auth.oauth2.clientId || '';
        const clientSecret = embedded === null || embedded === void 0 ? void 0 : embedded.clientSecret;
        if (!clientId) {
            return { success: false, error: `Credenciais não configuradas para o provedor "${group || pluginId}". Contate o desenvolvedor.` };
        }
        const { runOAuthFlow } = yield Promise.resolve().then(() => __importStar(require('./plugins/oauth-flow')));
        const oauthOpts = {
            authorizationUrl: auth.oauth2.authorizationUrl,
            tokenUrl: auth.oauth2.tokenUrl,
            clientId,
            scopes: auth.oauth2.scopes,
        };
        if (clientSecret)
            oauthOpts.clientSecret = clientSecret;
        if (auth.oauth2.pkce != null)
            oauthOpts.pkce = auth.oauth2.pkce;
        if (auth.oauth2.additionalParams)
            oauthOpts.additionalParams = auth.oauth2.additionalParams;
        const result = yield runOAuthFlow(oauthOpts);
        if (!result.success || !result.tokens) {
            return { success: false, error: result.error || 'OAuth falhou' };
        }
        yield pm.connectPlugin(pluginId, result.tokens, clientId, clientSecret);
        return { success: true };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}));
electron_1.ipcMain.handle('plugins-disconnect', (_event, pluginId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { getPluginManager } = yield Promise.resolve().then(() => __importStar(require('./plugins')));
        yield getPluginManager().disconnectPlugin(pluginId);
        return { success: true };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}));
// ============================================================================
// IPC: Auth / Licença
// ============================================================================
electron_1.ipcMain.handle('auth-sign-in', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { email, password }) {
    return (0, license_1.authSignIn)(email, password);
}));
electron_1.ipcMain.handle('auth-sign-up', (_event_1, _a) => __awaiter(void 0, [_event_1, _a], void 0, function* (_event, { email, password }) {
    return (0, license_1.authSignUp)(email, password);
}));
electron_1.ipcMain.handle('auth-sign-out', () => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, license_1.authSignOut)();
    return { ok: true };
}));
electron_1.ipcMain.handle('auth-google', () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const http = yield Promise.resolve().then(() => __importStar(require('http')));
        // Cria servidor local para capturar o callback
        const { port, tokenPromise, server } = yield new Promise((resolve, reject) => {
            let resolveToken;
            const tokenPromise = new Promise(r => { resolveToken = r; });
            const server = http.createServer((req, res) => {
                const url = new URL(req.url || '/', 'http://localhost');
                if (url.pathname === '/auth/callback') {
                    // Supabase retorna tokens no hash fragment, mas o server não recebe fragments.
                    // Servimos um HTML que lê o fragment e envia de volta via query string.
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<html><body><script>
                        const hash = window.location.hash.substring(1);
                        if (hash) {
                            fetch('/auth/tokens?' + hash).then(() => {
                                document.body.innerHTML = '<h2 style="font-family:sans-serif;text-align:center;margin-top:40px">Login realizado! Pode fechar esta aba.</h2>';
                            });
                        } else {
                            document.body.innerHTML = '<h2 style="font-family:sans-serif;text-align:center;margin-top:40px;color:red">Erro no login. Tente novamente.</h2>';
                        }
                    </script></body></html>`);
                }
                else if (url.pathname === '/auth/tokens') {
                    const accessToken = url.searchParams.get('access_token');
                    const refreshToken = url.searchParams.get('refresh_token');
                    res.writeHead(200);
                    res.end('ok');
                    if (accessToken) {
                        resolveToken(`access_token=${accessToken}&refresh_token=${refreshToken || ''}`);
                    }
                    else {
                        resolveToken(null);
                    }
                }
                else {
                    res.writeHead(404);
                    res.end('Not found');
                }
            });
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address();
                const port = typeof addr === 'object' && addr ? addr.port : 0;
                resolve({ port, tokenPromise, server });
            });
            server.on('error', reject);
        });
        const redirectTo = `http://localhost:${port}/auth/callback`;
        // Gera URL OAuth via Supabase com redirect para nosso server local
        const { getSupabase } = yield Promise.resolve().then(() => __importStar(require('./auth/supabase-client')));
        const sb = getSupabase();
        const { data, error } = yield sb.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
                skipBrowserRedirect: true,
            },
        });
        if (error || !(data === null || data === void 0 ? void 0 : data.url)) {
            server.close();
            return { ok: false, error: (error === null || error === void 0 ? void 0 : error.message) || 'Falha ao gerar URL de login' };
        }
        // Abre no navegador do sistema (Chrome, Edge, etc.) onde o usuário já está logado
        electron_1.shell.openExternal(data.url);
        // Timeout de 5 minutos
        const timeout = setTimeout(() => { server.close(); }, 5 * 60 * 1000);
        const tokenString = yield tokenPromise;
        clearTimeout(timeout);
        server.close();
        if (!tokenString) {
            return { ok: false, error: 'Login cancelado ou falhou' };
        }
        // Seta sessão no Supabase
        const params = new URLSearchParams(tokenString);
        const accessToken = params.get('access_token') || '';
        const refreshToken = params.get('refresh_token') || '';
        const { error: sessionError } = yield sb.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });
        if (sessionError) {
            return { ok: false, error: sessionError.message };
        }
        // Garante perfil no banco
        const { data: { user } } = yield sb.auth.getUser();
        if (user) {
            yield sb.from('profiles').upsert({ id: user.id, email: user.email, trial_started_at: new Date().toISOString(), plan: 'trial' }, { onConflict: 'id', ignoreDuplicates: true });
        }
        return { ok: true };
    }
    catch (err) {
        console.error('[Auth] Google OAuth error:', err);
        return { ok: false, error: err.message };
    }
}));
electron_1.ipcMain.handle('auth-check-license', () => __awaiter(void 0, void 0, void 0, function* () {
    return (0, license_1.checkLicense)();
}));
electron_1.ipcMain.handle('auth-refresh-license', () => __awaiter(void 0, void 0, void 0, function* () {
    (0, license_1.refreshLicense)();
    return (0, license_1.checkLicense)();
}));
electron_1.ipcMain.handle('auth-get-profile', () => __awaiter(void 0, void 0, void 0, function* () {
    return (0, license_1.getProfile)();
}));
electron_1.ipcMain.handle('update-install-now', () => {
    electron_updater_1.autoUpdater.quitAndInstall();
});
// Setup event forwarding after window is created
// We'll call this in createWindow
//# sourceMappingURL=main.js.map