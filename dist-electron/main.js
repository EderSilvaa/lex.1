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
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const tribunal_urls_1 = require("./pje/tribunal-urls");
const browser_manager_1 = require("./browser-manager");
const memory_1 = require("./agent/memory");
const brain_1 = require("./brain");
const route_memory_1 = require("./pje/route-memory");
const backend_client_1 = require("./backend-client");
const crypto_store_1 = require("./crypto-store");
const doc_index_1 = require("./agent/doc-index");
const legislacao_downloader_1 = require("./agent/legislacao-downloader");
const provider_config_1 = require("./provider-config");
const supabase_client_1 = require("./auth/supabase-client");
const license_1 = require("./auth/license");
const analytics_1 = require("./analytics");
const lex_desktop_bridge_1 = require("./lex-desktop-bridge");
const lex_engine_1 = require("./lex-engine");
const hermes_skills_catalog_1 = require("./hermes-skills-catalog");
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
let backendEventWiringReady = false;
let agoraBoardWatchListener = null;
let agoraDispatcherTimer = null;
let agoraDispatcherBusy = false;
const approvedWorkspaceSelections = new Set();
const approvedFileSelections = new Set();
const singleInstanceLock = electron_1.app.requestSingleInstanceLock();
if (!singleInstanceLock) {
    console.warn('[Main] Outra instancia detectada. Encerrando esta instancia.');
    electron_1.app.quit();
}
electron_1.app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized())
            mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        return;
    }
    createWindow();
});
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
    return String(value ?? '').trim().slice(0, MAX_STEP_STRING_LENGTH);
}
function sanitizeExecutionPlan(plan) {
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps)) {
        return { ok: false, error: 'Plano inválido: steps ausente' };
    }
    if (plan.steps.length === 0 || plan.steps.length > MAX_PLAN_STEPS) {
        return { ok: false, error: `Plano inválido: steps deve ter entre 1 e ${MAX_PLAN_STEPS}` };
    }
    const sanitizedSteps = [];
    for (let i = 0; i < plan.steps.length; i++) {
        const rawStep = plan.steps[i];
        const stepType = normalizeStepString(rawStep?.type);
        const order = Number.isFinite(rawStep?.order) ? Number(rawStep.order) : i + 1;
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
                const key = normalizeStepString(item?.key || `field_${idx + 1}`);
                const selector = normalizeStepString(item?.selector);
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
            const content = String(rawStep.content ?? '');
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
/**
 * Sincroniza o provider ativo no runtime (ai-handler + env vars).
 */
async function syncProvider(providerId, apiKey, agentModel, visionModel) {
    const preset = provider_config_1.PROVIDER_PRESETS[providerId];
    const resolvedAgent = agentModel || preset.defaultAgentModel;
    const resolvedVision = visionModel || preset.defaultVisionModel;
    const config = {
        providerId,
        apiKey,
        agentModel: resolvedAgent,
        visionModel: resolvedVision,
    };
    const { initAI } = await Promise.resolve().then(() => __importStar(require('./ai-handler')));
    initAI(config);
    // Sincroniza config com o backend (se conectado)
    (0, backend_client_1.syncConfigToBackend)(config);
    try {
        await (0, lex_engine_1.syncLexEngineProviderConfig)(config);
    }
    catch (error) {
        console.warn('[Provider] Falha ao sincronizar com Hermes; credenciais omitidas do log.');
    }
}
function normalizeProviderSelection(providerId, agentModel, visionModel) {
    const preset = provider_config_1.PROVIDER_PRESETS[providerId];
    return {
        providerId,
        agentModel: (agentModel || '').trim() || preset.defaultAgentModel,
        visionModel: (visionModel || '').trim() || preset.defaultVisionModel,
    };
}
async function resolveCanonicalProviderSelectionFromHermes(fallback) {
    const normalizedFallback = normalizeProviderSelection(fallback.providerId, fallback.agentModel, fallback.visionModel);
    try {
        const snapshot = await (0, lex_engine_1.getLexEngineProviderSnapshot)();
        if (snapshot?.available && snapshot.desktopProviderId) {
            return {
                ...normalizeProviderSelection(snapshot.desktopProviderId, snapshot.agentModel, snapshot.visionModel),
                source: 'hermes',
            };
        }
    }
    catch (error) {
        console.warn('[Provider] Nao foi possivel ler snapshot canonico do Hermes no boot:', error?.message || error);
    }
    return {
        ...normalizedFallback,
        source: 'fallback',
    };
}
/**
 * Reaplica estado do browser após alteração de provider/chave.
 * Se backend está vivo, reinit ocorre no processo backend (fonte da verdade do browser).
 * Fallback local mantém compatibilidade quando backend não está disponível.
 */
async function refreshBrowserRuntime(reason) {
    if ((0, backend_client_1.isBackendAlive)()) {
        try {
            await (0, backend_client_1.rpcCall)('browser-reinit');
            console.log(`[Browser] Reinit no backend concluído (${reason})`);
            return;
        }
        catch (err) {
            console.warn(`[Browser] Falha ao reinit no backend (${reason}), usando fallback local:`, err?.message || err);
        }
    }
    (0, browser_manager_1.reInitBrowser)().catch(e => console.error(`[Browser] Erro ao re-inicializar localmente (${reason}):`, e));
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
    console.log(`[loadApiKey] provider=${providerId}, configured=${Boolean(raw)}, encrypted=${(0, crypto_store_1.isEncrypted)(raw)}`);
    if (!raw)
        return '';
    if (!(0, crypto_store_1.isEncrypted)(raw)) {
        saveApiKey(providerId, raw);
        return raw;
    }
    const decrypted = (0, crypto_store_1.safeDecrypt)(raw);
    console.log(`[loadApiKey] decrypted=${Boolean(decrypted)}`);
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
function getProviderRuntimeEnv(providerId, apiKey) {
    const key = String(apiKey || '').trim();
    if (!key)
        return {};
    switch (providerId) {
        case 'anthropic':
            return {
                ANTHROPIC_API_KEY: key,
                ANTHROPIC_TOKEN: '',
            };
        case 'openai':
            return { OPENAI_API_KEY: key };
        case 'openrouter':
            return { OPENROUTER_API_KEY: key };
        case 'google':
            return { GOOGLE_API_KEY: key };
        case 'groq':
            return { GROQ_API_KEY: key };
        case 'ollama':
            return { OPENAI_API_KEY: 'ollama' };
        default:
            return {};
    }
}
async function testProviderApiKey(providerId, key) {
    const normalizedKey = String(key || '').replace(/[^\x20-\x7E]/g, '').trim();
    if (providerId === 'ollama') {
        const status = await (0, ollama_manager_1.getOllamaStatus)();
        return status.running
            ? { success: true }
            : { success: false, error: status.error || 'Ollama nao esta rodando.' };
    }
    if (!normalizedKey)
        return { success: false, error: 'Cole uma chave antes de testar.' };
    const signal = AbortSignal.timeout(15000);
    let url = '';
    const headers = {};
    if (providerId === 'anthropic') {
        url = 'https://api.anthropic.com/v1/models';
        headers['x-api-key'] = normalizedKey;
        headers['anthropic-version'] = '2023-06-01';
    }
    else if (providerId === 'openai') {
        url = 'https://api.openai.com/v1/models';
        headers['Authorization'] = `Bearer ${normalizedKey}`;
    }
    else if (providerId === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/models';
        headers['Authorization'] = `Bearer ${normalizedKey}`;
    }
    else if (providerId === 'groq') {
        url = 'https://api.groq.com/openai/v1/models';
        headers['Authorization'] = `Bearer ${normalizedKey}`;
    }
    else if (providerId === 'google') {
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(normalizedKey)}`;
    }
    else {
        return { success: false, error: `Provider nao suportado: ${providerId}` };
    }
    try {
        const response = await fetch(url, { headers, signal });
        if (response.ok)
            return { success: true };
        let body = '';
        try {
            body = await response.text();
        }
        catch {
            body = '';
        }
        const compact = body.replace(/\s+/g, ' ').slice(0, 220);
        return { success: false, error: `HTTP ${response.status}${compact ? `: ${compact}` : ''}` };
    }
    catch (error) {
        return { success: false, error: error?.message || String(error) };
    }
}
function normalizeConversationContent(content) {
    if (typeof content === 'string')
        return content.trim();
    if (content == null)
        return '';
    try {
        return JSON.stringify(content);
    }
    catch {
        return String(content);
    }
}
function makeConversationTitle(content) {
    return content.replace(/\s+/g, ' ').slice(0, 50) || 'Nova conversa';
}
function persistTerminalConversationMessage(payload) {
    if (!store || payload?.source !== 'terminal')
        return;
    const id = String(payload.conversationId || payload.sessionId || '').trim();
    const role = payload.role === 'assistant' ? 'assistant' : payload.role === 'user' ? 'user' : null;
    const content = normalizeConversationContent(payload.content);
    if (!id || !role || !content)
        return;
    const timestamp = Number(payload.timestamp) || Date.now();
    const convs = store.get('conversations', {}) || {};
    const existing = convs[id] || {};
    const messages = Array.isArray(existing.messages) ? existing.messages : [];
    const isNew = !convs[id];
    convs[id] = {
        id,
        title: existing.title || (role === 'user' ? makeConversationTitle(content) : 'Nova conversa'),
        createdAt: existing.createdAt || timestamp,
        updatedAt: timestamp,
        source: 'terminal',
        messages: [
            ...messages,
            {
                role,
                content,
                timestamp,
                source: 'terminal',
                runId: typeof payload.runId === 'string' ? payload.runId : undefined,
            },
        ],
    };
    store.set('conversations', convs);
    if (isNew)
        (0, analytics_1.getAnalytics)().trackConversation();
    mainWindow?.webContents.send('conversations-updated', {
        id,
        title: convs[id].title,
        updatedAt: convs[id].updatedAt,
        messageCount: convs[id].messages.length,
    });
}
async function initStore() {
    // @ts-ignore
    const { default: Store } = await Promise.resolve().then(() => __importStar(require('electron-store')));
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
    const savedProviderId = savedProvider?.providerId ?? 'anthropic';
    const preset = provider_config_1.PROVIDER_PRESETS[savedProviderId];
    // Migra modelos removidos/legacy para defaults atuais
    const LEGACY_VISION_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'];
    const REMOVED_OPENROUTER_MODELS = [
        'mistralai/mistral-small-3.1-24b-instruct:free',
        'meta-llama/llama-4-maverick:free',
        'microsoft/phi-4-multimodal-instruct:free',
        'google/gemma-4-27b-it:free',
        'deepseek/deepseek-v3-0324:free',
        'deepseek/deepseek-r1-0528:free',
    ];
    const savedVision = savedProvider?.visionModel ?? preset.defaultVisionModel;
    const savedAgent = savedProvider?.agentModel ?? preset.defaultAgentModel;
    const visionModel = (savedProviderId === 'anthropic' && LEGACY_VISION_MODELS.includes(savedVision))
        ? preset.defaultVisionModel
        : REMOVED_OPENROUTER_MODELS.includes(savedVision)
            ? preset.defaultVisionModel
            : savedVision;
    const agentModel = REMOVED_OPENROUTER_MODELS.includes(savedAgent)
        ? preset.defaultAgentModel
        : savedAgent;
    if (visionModel !== savedVision || agentModel !== savedAgent) {
        console.log(`[Provider] Migrado modelos removidos: agent=${savedAgent}->${agentModel}, vision=${savedVision}->${visionModel}`);
    }
    const canonical = await resolveCanonicalProviderSelectionFromHermes({
        providerId: savedProviderId,
        agentModel,
        visionModel,
    });
    const apiKey = loadApiKey(canonical.providerId);
    store.set('aiProvider', {
        providerId: canonical.providerId,
        agentModel: canonical.agentModel,
        visionModel: canonical.visionModel,
    });
    await syncProvider(canonical.providerId, apiKey, canonical.agentModel, canonical.visionModel);
}
// ─────────────────────────────────────────────────────────────────────────────
// IPC — Configuração de Provider/API Keys
// ─────────────────────────────────────────────────────────────────────────────
/** Define provider ativo + modelos. Re-inicia browser no backend quando disponível. */
electron_1.ipcMain.handle('store-set-provider', async (_event, cfg) => {
    if (!store)
        return { error: 'Store not initialized' };
    const desired = normalizeProviderSelection(cfg.providerId, cfg.agentModel, cfg.visionModel);
    store.set('aiProvider', desired);
    const apiKey = loadApiKey(desired.providerId);
    console.log(`[Provider] setProvider: ${desired.providerId}, configured=${Boolean(apiKey)}, agent=${desired.agentModel}, vision=${desired.visionModel}`);
    await syncProvider(desired.providerId, apiKey, desired.agentModel, desired.visionModel);
    const canonical = await resolveCanonicalProviderSelectionFromHermes(desired);
    store.set('aiProvider', {
        providerId: canonical.providerId,
        agentModel: canonical.agentModel,
        visionModel: canonical.visionModel,
    });
    (0, provider_config_1.setActiveConfig)({
        providerId: canonical.providerId,
        apiKey: loadApiKey(canonical.providerId),
        agentModel: canonical.agentModel,
        visionModel: canonical.visionModel,
    });
    return { success: true, provider: canonical };
});
/** Retorna provider ativo + status da chave. A apiKey nunca é enviada ao renderer. */
electron_1.ipcMain.handle('store-get-provider', async () => {
    const current = (0, provider_config_1.getActiveConfig)();
    const canonical = await resolveCanonicalProviderSelectionFromHermes({
        providerId: current.providerId,
        agentModel: current.agentModel,
        visionModel: current.visionModel,
    });
    const cfg = canonical.source === 'hermes'
        ? {
            ...current,
            providerId: canonical.providerId,
            agentModel: canonical.agentModel,
            visionModel: canonical.visionModel,
            apiKey: loadApiKey(canonical.providerId),
        }
        : current;
    const hasKey = cfg.apiKey.length > 0;
    const { apiKey: _omit, ...safe } = cfg;
    return { ...safe, hasKey };
});
/** Salva chave API para um provider. */
electron_1.ipcMain.handle('store-set-api-key', async (_event, { providerId, key }) => {
    if (!store)
        return { error: 'Store not initialized' };
    // Remove zero-width chars, BOM, e qualquer non-ASCII que colar junto
    const normalizedKey = String(key || '').replace(/[^\x20-\x7E]/g, '').trim();
    saveApiKey(providerId, normalizedKey);
    // Se é o provider ativo, atualiza a cópia em memória e re-sincroniza.
    // Sem o setActiveConfig aqui, o spawn do Console Lex (terminal-create-engine)
    // continuaria injetando a chave antiga no env do Hermes mesmo após restart.
    const current = (0, provider_config_1.getActiveConfig)();
    if (current.providerId === providerId) {
        (0, provider_config_1.setActiveConfig)({ ...current, apiKey: normalizedKey });
        await syncProvider(providerId, normalizedKey, current.agentModel, current.visionModel);
    }
    return { success: true, configured: normalizedKey.length > 0 };
});
/** Retorna status da chave para um provider. */
electron_1.ipcMain.handle('store-get-api-key-status', async (_event, providerId) => {
    const key = loadApiKey(providerId);
    return {
        configured: key.length > 0,
        preview: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : '',
    };
});
/** Retorna catálogo de providers/modelos para a UI de configurações. */
electron_1.ipcMain.handle('store-test-api-key', async (_event, { providerId, key }) => {
    const candidate = String(key || '').trim() || loadApiKey(providerId);
    return await testProviderApiKey(providerId, candidate);
});
electron_1.ipcMain.handle('store-get-provider-presets', () => {
    return provider_config_1.PROVIDER_PRESETS;
});
electron_1.ipcMain.handle('lex-engine-provider-snapshot', async () => {
    return await (0, lex_engine_1.getLexEngineProviderSnapshot)();
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
    return (0, privacy_1.getAuditSummary)(days ?? 7);
});
// ── Ollama (Modelo Local) ──────────────────────────────────────────────────
electron_1.ipcMain.handle('ollama-status', async () => {
    try {
        return await (0, ollama_manager_1.getOllamaStatus)();
    }
    catch (e) {
        console.error('[IPC] ollama-status error:', e.message);
        return { running: false, models: [], error: e.message };
    }
});
electron_1.ipcMain.handle('ollama-list-models', async () => {
    try {
        return await (0, ollama_manager_1.listModels)();
    }
    catch (e) {
        console.error('[IPC] ollama-list-models error:', e.message);
        return [];
    }
});
electron_1.ipcMain.handle('ollama-recommended', async () => {
    try {
        return await (0, ollama_manager_1.getRecommendedModelsWithStatus)();
    }
    catch (e) {
        console.error('[IPC] ollama-recommended error:', e.message);
        return [];
    }
});
electron_1.ipcMain.handle('ollama-pull', async (_event, modelName) => {
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
});
electron_1.ipcMain.handle('ollama-delete', async (_event, modelName) => {
    return (0, ollama_manager_1.deleteModel)(modelName);
});
electron_1.ipcMain.handle('ollama-get-recommended-list', () => {
    return ollama_manager_1.RECOMMENDED_MODELS;
});
electron_1.ipcMain.handle('ollama-is-running', async () => {
    try {
        return await (0, ollama_manager_1.isOllamaRunning)();
    }
    catch {
        return false;
    }
});
electron_1.ipcMain.handle('ollama-download-installer', async () => {
    const url = process.platform === 'darwin'
        ? 'https://ollama.com/download/Ollama-darwin.zip'
        : 'https://ollama.com/download/OllamaSetup.exe';
    const fileName = process.platform === 'darwin' ? 'Ollama-darwin.zip' : 'OllamaSetup.exe';
    const destPath = path.join(electron_1.app.getPath('temp'), fileName);
    try {
        // Notifica progresso
        if (mainWindow)
            mainWindow.webContents.send('ollama-install-progress', { status: 'downloading', percent: 0 });
        const res = await fetch(url);
        if (!res.ok || !res.body)
            throw new Error(`HTTP ${res.status}`);
        const total = Number(res.headers.get('content-length') || 0);
        let downloaded = 0;
        const chunks = [];
        const reader = res.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
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
        await electron_1.shell.openPath(destPath);
        return { success: true, path: destPath };
    }
    catch (e) {
        console.error('[Ollama] Erro ao baixar installer:', e.message);
        if (mainWindow)
            mainWindow.webContents.send('ollama-install-progress', { status: 'error', error: e.message });
        return { success: false, error: e.message };
    }
});
// ── Aliases legados (retrocompat com código antigo) ──
electron_1.ipcMain.handle('store-set-anthropic-key', async (_event, key) => {
    if (!store)
        return { error: 'Store not initialized' };
    const normalizedKey = String(key || '').trim();
    saveApiKey('anthropic', normalizedKey);
    const current = (0, provider_config_1.getActiveConfig)();
    if (current.providerId === 'anthropic') {
        await syncProvider('anthropic', normalizedKey, current.agentModel, current.visionModel);
    }
    return { success: true, configured: normalizedKey.length > 0 };
});
electron_1.ipcMain.handle('store-get-anthropic-key-status', async () => {
    const key = loadApiKey('anthropic');
    return {
        configured: key.length > 0,
        preview: key ? `${key.slice(0, 7)}...${key.slice(-4)}` : '',
    };
});
// AI Chat Handler
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
    // Deep-link: --view=<tab> abre direto na aba correta (ex: --view=brain)
    const viewArg = process.argv.find(a => a.startsWith('--view='));
    if (viewArg) {
        const viewId = viewArg.split('=')[1];
        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow?.webContents.send('navigate-to', viewId);
        });
    }
    // Modo 24/7: minimiza para bandeja em vez de fechar
    mainWindow.on('close', (event) => {
        if (trayModeActive) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    syncUserInputNotifier();
    // Note: We REMOVED the default injection on mainWindow, because it loads Dashboard.
}
// File System Handlers
electron_1.ipcMain.handle('files-select-folder', async () => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
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
});
electron_1.ipcMain.handle('files-list', async (_event, folderPath) => {
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
});
// Lê arquivo e extrai texto (.txt, .docx, .pdf)
electron_1.ipcMain.handle('files-read', async (_event, filePath) => {
    try {
        const normalizedFilePath = normalizeFsPath(filePath);
        if (!isPathApprovedForRead(normalizedFilePath)) {
            return { success: false, error: 'Acesso negado ao arquivo fora de workspace autorizado' };
        }
        const ext = path.extname(normalizedFilePath).toLowerCase();
        if (ext === '.docx') {
            const mammoth = await Promise.resolve().then(() => __importStar(require('mammoth')));
            const result = await mammoth.extractRawText({ path: normalizedFilePath });
            return { success: true, text: result.value, type: 'docx' };
        }
        if (ext === '.pdf') {
            const pdfParseModule = await Promise.resolve().then(() => __importStar(require('pdf-parse')));
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
    }
    catch (e) {
        console.error('[Files] Erro ao ler arquivo:', e);
        return { success: false, error: e.message };
    }
});
// Retorna file:// URL para preview de arquivos (PDF, imagens)
electron_1.ipcMain.handle('files-get-url', async (_event, filePath) => {
    const normalizedFilePath = normalizeFsPath(filePath);
    if (!isPathApprovedForRead(normalizedFilePath)) {
        return null;
    }
    // Converte caminho Windows para file:// URL
    const fileUrl = `file:///${normalizedFilePath.replace(/\\/g, '/').replace(/^\//, '')}`;
    return fileUrl;
});
// Seleciona arquivo (dialog)
electron_1.ipcMain.handle('files-select-file', async (_event, filters) => {
    if (!mainWindow)
        return null;
    const workspaces = getWorkspaceRoots();
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
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
});
// Salva texto como .txt na pasta de documentos do escritório
electron_1.ipcMain.handle('files-save-document', async (_event, { name, content }) => {
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
        const result = await electron_1.dialog.showSaveDialog(mainWindow, {
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
        await fs.promises.writeFile(result.filePath, content, 'utf8');
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
});
// Escreve conteúdo em arquivo existente
electron_1.ipcMain.handle('files-write', async (_event, { path: filePath, content }) => {
    try {
        const normalizedFilePath = normalizeFsPath(filePath);
        if (!isPathApprovedForWrite(normalizedFilePath)) {
            return { success: false, error: 'Acesso negado ao caminho fora de workspace autorizado' };
        }
        await fs.promises.writeFile(normalizedFilePath, content, 'utf8');
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
});
async function injectLexScripts(target) {
    const webContents = 'webContents' in target ? target.webContents : target;
    const currentUrl = webContents.getURL();
    console.log('Checking injection for:', currentUrl);
    // Inject Polyfill FIRST
    try {
        const polyfillPath = path.join(__dirname, 'polyfill.js');
        if (fs.existsSync(polyfillPath)) {
            const polyfillContent = fs.readFileSync(polyfillPath, 'utf8');
            await webContents.executeJavaScript(polyfillContent);
        }
        else {
            // If running from dist-electron, polyfill might be in ../electron/polyfill.js or we need to copy it
            // Let's try to resolve it. If __dirname is dist-electron, polyfill.js might not be there unless copied.
            // We should check ../electron/polyfill.js too
            const polyfillSrcPath = path.join(__dirname, '../electron/polyfill.js');
            if (fs.existsSync(polyfillSrcPath)) {
                const polyfillContent = fs.readFileSync(polyfillSrcPath, 'utf8');
                await webContents.executeJavaScript(polyfillContent);
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
            await webContents.executeJavaScript(js);
            console.log('✅ Overlay JS Injected from:', overlayJsPath);
        }
        else {
            console.error('❌ Overlay JS not found at:', overlayJsPath);
        }
    }
    catch (e) {
        console.error('Error injecting overlay:', e);
    }
}
const crawler_1 = require("./crawler");
// ... (existing code)
electron_1.app.whenReady().then(async () => {
    if (!singleInstanceLock)
        return;
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
    await initStore();
    (0, supabase_client_1.initSupabase)(store);
    createWindow();
    (0, crawler_1.registerCrawlerHandlers)();
    (0, lex_desktop_bridge_1.startLexDesktopBridge)();
    startAgoraBoardWatcher();
    startAgoraDispatcher();
    electron_1.ipcMain.handle('lex-engine-status', async () => {
        try {
            return { success: true, data: { ...(await (0, lex_engine_1.getLexEngineStatus)()), bridge: (0, lex_desktop_bridge_1.getLexDesktopBridgeState)() } };
        }
        catch (err) {
            return { success: false, error: err.message || String(err) };
        }
    });
    electron_1.ipcMain.handle('lex-engine-ask', async (_event, { prompt }) => {
        try {
            return { success: true, data: await (0, lex_engine_1.askLexEngine)(prompt) };
        }
        catch (err) {
            return { success: false, error: err.message || String(err) };
        }
    });
    // Terminal embutido (xterm.js + node-pty)
    // Registrado logo após createWindow — o renderer chama createLex nos primeiros 200ms.
    try {
        const { initTerminal, getPtyManager } = await Promise.resolve().then(() => __importStar(require('./terminal')));
        initTerminal();
        const ptyMgr = getPtyManager();
        electron_1.ipcMain.handle('terminal-create', async (_, opts) => {
            try {
                await ptyMgr.createSession(opts.sessionId, opts);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        });
        electron_1.ipcMain.handle('terminal-write', async (_, { sessionId, data, paste }) => {
            try {
                ptyMgr.write(sessionId, data, { paste });
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        });
        electron_1.ipcMain.handle('terminal-resize', async (_, { sessionId, cols, rows }) => {
            try {
                ptyMgr.resize(sessionId, cols, rows);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        });
        electron_1.ipcMain.handle('terminal-kill', async (_, sessionId) => {
            try {
                ptyMgr.killSession(sessionId);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        });
        electron_1.ipcMain.handle('terminal-list-sessions', async () => {
            return { success: true, data: ptyMgr.listSessions() };
        });
        electron_1.ipcMain.handle('user-input-resolve', async (_event, { answer }) => {
            try {
                return {
                    success: true,
                    resolved: (0, user_input_1.resolveUserInput)(String(answer ?? '')),
                };
            }
            catch (err) {
                return {
                    success: false,
                    error: err?.message || 'Falha ao entregar resposta ao agente.',
                };
            }
        });
        // Sessão especial: roda o LEX CLI dentro do PTY
        electron_1.ipcMain.handle('terminal-create-engine', async (_, opts) => {
            try {
                const activeProvider = (0, provider_config_1.getActiveConfig)();
                const activeProviderKey = activeProvider.apiKey || loadApiKey(activeProvider.providerId);
                await syncProvider(activeProvider.providerId, activeProviderKey, activeProvider.agentModel, activeProvider.visionModel);
                const prefs = (store?.get('userPreferences', {}) || {});
                const desktopUserName = String(prefs['displayName'] || prefs['fullName'] || '').trim();
                const desktopUserRole = String(prefs['role'] || '').trim();
                const desktopEnv = {
                    ...(desktopUserName ? { LEX_DESKTOP_USER_NAME: desktopUserName } : {}),
                    ...(desktopUserRole ? { LEX_DESKTOP_USER_ROLE: desktopUserRole } : {}),
                    LEX_DESKTOP_HITL_CAPABILITY: (0, lex_desktop_bridge_1.getLexDesktopHitlCapability)(),
                    ...getProviderRuntimeEnv(activeProvider.providerId, activeProviderKey),
                };
                const spawn = (0, lex_engine_1.getLexEngineConsoleSpawn)(opts.sessionId, desktopEnv);
                await ptyMgr.createSession(opts.sessionId, {
                    shell: spawn.shell,
                    args: spawn.args,
                    cwd: spawn.cwd,
                    cols: opts.cols,
                    rows: opts.rows,
                    mode: 'engine',
                    env: {
                        ...spawn.env,
                        NODE_OPTIONS: '--max-old-space-size=4096',
                    },
                });
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        });
        // Forward PTY events para renderer
        ptyMgr.on('data', (sessionId, data) => {
            mainWindow?.webContents.send('terminal-data', { sessionId, data });
        });
        ptyMgr.on('exit', (sessionId, exitCode) => {
            mainWindow?.webContents.send('terminal-exit', { sessionId, exitCode });
        });
        // Cleanup no quit
        electron_1.app.on('before-quit', () => ptyMgr.killAll());
        console.log('[Terminal] IPC handlers registrados');
    }
    catch (err) {
        console.error('[Terminal] Falha ao inicializar:', err.message);
    }
    (0, route_memory_1.initRouteMemory)(userData);
    // Brain (SQLite FTS5 + grafo de conhecimento)
    try {
        (0, brain_1.initBrain)(userData);
        console.log('[Main] Brain inicializado');
    }
    catch (err) {
        console.error('[Main] Falha ao iniciar Brain:', err.message);
    }
    // Forward de eventos do backend → renderer (inicializa uma vez)
    if (!backendEventWiringReady) {
        backendEventWiringReady = true;
        backend_client_1.backendEvents.on('agent-event', (event) => {
            console.log('[Agent Event via Backend]', event.type);
            if (mainWindow) {
                mainWindow.webContents.send('agent-event', event);
            }
        });
        backend_client_1.backendEvents.on('backend-log', (entry) => {
            if (mainWindow) {
                mainWindow.webContents.send('backend-log', entry);
            }
        });
        // CLI → UI: navegar para aba e/ou abrir recurso específico
        // Terminal transcript -> sidebar conversation persistence
        backend_client_1.backendEvents.on('conversation-message', (payload) => {
            persistTerminalConversationMessage(payload);
        });
        backend_client_1.backendEvents.on('ui-navigate', ({ tab, payload }) => {
            if (mainWindow) {
                if (tab)
                    mainWindow.webContents.send('navigate-to', tab);
                if (payload)
                    mainWindow.webContents.send('ui-payload', payload);
            }
        });
        backend_client_1.backendEvents.on('backend-status', async (status) => {
            const st = String(status?.status || '');
            console.log('[Backend Status]', st, status);
            if (mainWindow) {
                mainWindow.webContents.send('backend-status', status);
            }
            // Sempre que backend reconecta/reinicia, reaplica config ativa.
            if (st === 'connected' || st === 'restarted') {
                try {
                    await (0, backend_client_1.syncConfigToBackend)((0, provider_config_1.getActiveConfig)());
                }
                catch (err) {
                    console.warn('[Main] Falha ao re-sincronizar config após reconexão do backend:', err?.message || err);
                }
            }
        });
    }
    // Inicia backend Node.js separado (agent + browser + skills)
    try {
        await (0, backend_client_1.startBackend)(userData);
        // Sincroniza config de provider/API key com o backend (já foi carregada no initStore)
        const cfg = (0, provider_config_1.getActiveConfig)();
        await (0, backend_client_1.syncConfigToBackend)(cfg);
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
    // Legal Store — base jurídica dinâmica (seed no primeiro uso)
    try {
        const { initLegalStore } = await Promise.resolve().then(() => __importStar(require('./legal/legal-store')));
        initLegalStore();
    }
    catch (err) {
        console.warn('[LegalStore] Falha ao inicializar:', err.message);
    }
    // DataJud Pipeline — data pipeline jurídica (async, não bloqueia boot)
    try {
        const { initDataPipeline } = await Promise.resolve().then(() => __importStar(require('./datajud')));
        await initDataPipeline();
    }
    catch (err) {
        console.warn('[DataPipeline] Falha ao inicializar:', err.message);
    }
    // Knowledge Base de Documentos — schemas + exemplos + seed pipeline
    try {
        const { initDocSchemaRegistry } = await Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
        const { initDocExamples } = await Promise.resolve().then(() => __importStar(require('./legal/doc-examples')));
        const { seedIfEmpty } = await Promise.resolve().then(() => __importStar(require('./legal/doc-seed-pipeline')));
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
        const { initPythonEnv, getPythonEnv } = await Promise.resolve().then(() => __importStar(require('./python')));
        initPythonEnv();
        getPythonEnv().setup()
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
});
function initAutoUpdater() {
    // Em dev não verifica atualizações
    if (!electron_1.app.isPackaged)
        return;
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on('update-available', () => {
        mainWindow?.webContents.send('update-available');
    });
    electron_updater_1.autoUpdater.on('update-downloaded', () => {
        mainWindow?.webContents.send('update-downloaded');
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
    async function runSync(label) {
        const userDataDir = electron_1.app.getPath('userData');
        const pendentes = (0, legislacao_downloader_1.verificarDesatualizados)(userDataDir);
        if (pendentes.length === 0) {
            console.log(`[Legislação] ${label} — tudo em dia`);
            return;
        }
        console.log(`[Legislação] ${label} — ${pendentes.length} arquivo(s) para atualizar`);
        mainWindow?.webContents.send('rag-legislacao-progress', `Atualizando legislação (${pendentes.length} arquivo(s))…`);
        const result = await (0, legislacao_downloader_1.downloadIncremental)(userDataDir, (msg) => {
            console.log('[Legislação]', msg);
            mainWindow?.webContents.send('rag-legislacao-progress', msg);
        });
        if (result.sucesso > 0) {
            // Garante que a pasta está nos workspaces e re-indexa
            const legDir = result.dir;
            const workspaces = store.get('workspaces', []);
            if (!workspaces.includes(legDir)) {
                workspaces.push(legDir);
                store.set('workspaces', workspaces);
            }
            await (0, doc_index_1.getDocIndex)().indexarWorkspace([legDir, ...workspaces.filter(w => w !== legDir)]);
            console.log(`[Legislação] ${result.sucesso} arquivo(s) atualizados e re-indexados`);
        }
    }
    // Boot: aguarda 15s para não competir com a inicialização da janela
    setTimeout(() => runSync('boot').catch(e => console.error('[Legislação] Erro no boot sync:', e)), 15000);
    // Verificação diária
    setInterval(() => runSync('daily').catch(e => console.error('[Legislação] Erro no daily sync:', e)), LEGISLACAO_CHECK_INTERVAL_MS);
}
electron_1.app.on('window-all-closed', async function () {
    // Finaliza sessão de analytics
    (0, analytics_1.getAnalytics)().endSession();
    // Flush audit log de privacidade
    await (0, privacy_1.flushAuditLog)();
    // No modo 24/7 com tray ativo, não encerra o processo
    if (trayModeActive)
        return;
    // Encerra backend (flush + close browser + sessions)
    (0, lex_desktop_bridge_1.stopLexDesktopBridge)();
    stopAgoraBoardWatcher();
    stopAgoraDispatcher();
    await (0, backend_client_1.stopBackend)();
    // Fallback local caso backend não estivesse rodando
    (0, route_memory_1.flush)();
    (0, brain_1.closeBrain)();
    await (0, browser_manager_1.closeBrowser)();
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// IPC Handlers
electron_1.ipcMain.handle('save-history', async (_event, messages) => {
    if (store)
        store.set('chatHistory', messages);
    return { success: true };
});
electron_1.ipcMain.handle('get-history', async () => {
    return store ? store.get('chatHistory', []) : [];
});
// ============================================================================
// CONVERSATIONS (multi-session persistence)
// ============================================================================
electron_1.ipcMain.handle('conversations-list', async () => {
    const convs = store?.get('conversations', {}) || {};
    return Object.values(convs)
        .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages?.length || 0 }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 50);
});
electron_1.ipcMain.handle('conversations-save', async (_event, conv) => {
    const MAX_CONV_SIZE = 2000000; // 2 MB por conversa
    if (!conv || typeof conv.id !== 'string')
        return { success: false, error: 'Conversa inválida.' };
    if (JSON.stringify(conv).length > MAX_CONV_SIZE)
        return { success: false, error: 'Conversa muito grande para salvar (limite 2 MB).' };
    const convs = store?.get('conversations', {}) || {};
    const isNew = !convs[conv.id];
    convs[conv.id] = conv;
    store?.set('conversations', convs);
    if (isNew)
        (0, analytics_1.getAnalytics)().trackConversation();
    mainWindow?.webContents.send('conversations-updated', {
        id: conv.id,
        title: conv.title,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages?.length || 0,
    });
    return { success: true };
});
electron_1.ipcMain.handle('conversations-load', async (_event, id) => {
    const convs = store?.get('conversations', {}) || {};
    return convs[id] || null;
});
electron_1.ipcMain.handle('conversations-delete', async (_event, id) => {
    const convs = store?.get('conversations', {}) || {};
    delete convs[id];
    store?.set('conversations', convs);
    return { success: true };
});
// ============================================================================
// ANALYTICS
// ============================================================================
electron_1.ipcMain.handle('analytics-summary', async () => {
    return (0, analytics_1.getAnalytics)().getSummary();
});
electron_1.ipcMain.handle('analytics-track-message', async () => {
    (0, analytics_1.getAnalytics)().trackMessage();
    return { success: true };
});
electron_1.ipcMain.handle('save-preferences', async (_event, prefs) => {
    if (store)
        store.set('userPreferences', prefs);
    return { success: true };
});
electron_1.ipcMain.handle('get-preferences', async () => {
    return store ? store.get('userPreferences', {}) : {};
});
// Workspace Management
electron_1.ipcMain.handle('workspace-get', async () => {
    return store ? getWorkspaceRoots() : [];
});
electron_1.ipcMain.handle('workspace-add', async (_event, path) => {
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
});
electron_1.ipcMain.handle('workspace-remove', async (_event, path) => {
    if (!store)
        return { success: false };
    const selectedPath = normalizeFsPath(path);
    let workspaces = store.get('workspaces', []);
    workspaces = workspaces.filter(w => normalizeFsPath(w) !== selectedPath);
    store.set('workspaces', workspaces);
    startWorkspaceWatchers(); // Reinicia watchers sem workspace removido
    return { success: true, workspaces };
});
/** Re-indexa todos os documentos dos workspaces para o RAG. */
electron_1.ipcMain.handle('rag-index-workspace', async () => {
    const workspaces = getWorkspaceRoots();
    if (workspaces.length === 0)
        return { success: false, error: 'Nenhum workspace configurado.' };
    const result = await (0, doc_index_1.getDocIndex)().indexarWorkspace(workspaces);
    return { success: true, ...result };
});
/** Retorna estatísticas do índice RAG atual. */
electron_1.ipcMain.handle('rag-stats', async () => {
    return (0, doc_index_1.getDocIndex)().getStats();
});
// ============================================================================
// FILE WATCHER — auto re-indexa RAG quando arquivos mudam nos workspaces
// ============================================================================
const activeWatchers = [];
let ragReindexTimer = null;
const RAG_DEBOUNCE_MS = 5000; // 5s debounce para agrupar mudanças rápidas
function scheduleRagReindex() {
    if (ragReindexTimer)
        clearTimeout(ragReindexTimer);
    ragReindexTimer = setTimeout(async () => {
        ragReindexTimer = null;
        const ws = getWorkspaceRoots();
        if (ws.length === 0)
            return;
        try {
            const result = await (0, doc_index_1.getDocIndex)().indexarWorkspace(ws);
            console.log(`[FileWatcher] RAG re-indexado: ${result.chunks} chunks, ${result.arquivos} arquivos`);
        }
        catch (e) {
            console.warn('[FileWatcher] RAG re-index falhou:', e.message);
        }
    }, RAG_DEBOUNCE_MS);
}
const WATCHED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.docx', '.doc']);
function startWorkspaceWatchers() {
    // Limpa watchers anteriores
    for (const w of activeWatchers) {
        try {
            w.close();
        }
        catch { }
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
electron_1.ipcMain.handle('rag-download-legislacao', async (_e, forcar = false) => {
    const userDataDir = electron_1.app.getPath('userData');
    const fn = forcar ? legislacao_downloader_1.downloadTudo : legislacao_downloader_1.downloadIncremental;
    const result = await fn(userDataDir, (msg) => {
        mainWindow?.webContents.send('rag-legislacao-progress', msg);
    });
    // Garante que a pasta de legislação está nos workspaces
    const legDir = result.dir;
    const workspaces = store.get('workspaces', []);
    if (!workspaces.includes(legDir)) {
        workspaces.push(legDir);
        store.set('workspaces', workspaces);
    }
    const indexResult = await (0, doc_index_1.getDocIndex)().indexarWorkspace([legDir, ...workspaces.filter(w => w !== legDir)]);
    return { ...result, indexResult };
});
/** Retorna estatísticas dos arquivos de legislação já baixados. */
electron_1.ipcMain.handle('rag-legislacao-stats', async () => {
    return (0, legislacao_downloader_1.getLegislacaoStats)(electron_1.app.getPath('userData'));
});
// Check PJe status via browser
electron_1.ipcMain.handle('check-pje', async () => {
    if ((0, backend_client_1.isBackendAlive)()) {
        try {
            const backendStatus = await (0, backend_client_1.rpcCall)('browser-check-pje');
            return backendStatus;
        }
        catch (err) {
            console.warn('[check-pje] Falha ao consultar backend, usando fallback local:', err?.message || err);
        }
    }
    try {
        const page = (0, browser_manager_1.getActivePage)();
        const url = page?.url() ?? null;
        const isPje = typeof url === 'string' && url.includes('pje.');
        // Detecta tribunal pela URL (ex: pje.tjpa.jus.br → TJPA, pje.trt8.jus.br → TRT8)
        let tribunalAtivo = null;
        if (isPje && url) {
            const match = url.match(/pje\.([a-z0-9]+)\.jus\.br/i);
            if (match?.[1])
                tribunalAtivo = match[1].toUpperCase();
        }
        // Tribunal preferido salvo na memória do usuário
        const mem = (0, memory_1.getMemory)();
        const [memoriaData, usuario] = await Promise.all([mem.carregar(), mem.getUsuario()]);
        const pref = memoriaData.preferencias?.['tribunal_preferido'] || usuario.tribunal_preferido || null;
        return {
            connected: !!url,
            isPje,
            url,
            tribunalAtivo,
            tribunalPreferido: pref,
            contextSummary: null,
            environment: null,
        };
    }
    catch {
        return {
            connected: false,
            isPje: false,
            url: null,
            tribunalAtivo: null,
            tribunalPreferido: null,
            contextSummary: null,
            environment: null,
        };
    }
});
// Tenta trazer a aba de automação do browser para frente.
electron_1.ipcMain.handle('browser-focus', async () => {
    if ((0, backend_client_1.isBackendAlive)()) {
        try {
            return await (0, backend_client_1.rpcCall)('browser-focus');
        }
        catch (err) {
            console.warn('[browser-focus] Falha ao focar via backend, usando fallback local:', err?.message || err);
        }
    }
    // Fallback local: NÃO chama ensureBrowser() — se Chrome não está aberto, não tem o que focar.
    // ensureBrowser() aqui causava Chrome abrindo aleatoriamente sempre que o renderer
    // recebia um evento de skill PJe (requestBrowserAutoExpand).
    try {
        const page = (0, browser_manager_1.getActivePage)();
        if (page) {
            try {
                await page.bringToFront();
            }
            catch (err) {
                console.warn('[browser-focus] bringToFront falhou (fallback local):', err?.message || err);
            }
        }
        const status = await (async () => {
            const active = (0, browser_manager_1.getActivePage)();
            const url = active?.url() ?? null;
            const isPje = typeof url === 'string' && url.includes('pje.');
            let tribunalAtivo = null;
            if (isPje && url) {
                const match = url.match(/pje\.([a-z0-9]+)\.jus\.br/i);
                if (match?.[1])
                    tribunalAtivo = match[1].toUpperCase();
            }
            const mem = (0, memory_1.getMemory)();
            const [memoriaData, usuario] = await Promise.all([mem.carregar(), mem.getUsuario()]);
            const pref = memoriaData.preferencias?.['tribunal_preferido'] || usuario.tribunal_preferido || null;
            return {
                connected: !!url,
                isPje,
                url,
                tribunalAtivo,
                tribunalPreferido: pref,
                contextSummary: null,
                environment: null,
            };
        })();
        return { ok: !!page, status };
    }
    catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
});
// ============================================================================
// LEX AGENT LOOP INTEGRATION
// ============================================================================
// Initialize agent on app ready
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
function emitDesktopUserInputRequest(prompt) {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    mainWindow.webContents.send('user-input-requested', {
        prompt,
        createdAt: Date.now(),
    });
}
function syncUserInputNotifier() {
    (0, user_input_1.setNotifyFn)(async (prompt) => {
        const normalizedPrompt = String(prompt || '').trim();
        if (!normalizedPrompt)
            return;
        emitDesktopUserInputRequest(normalizedPrompt);
        const telegramEnabled = Boolean(store?.get('telegramEnabled', false));
        const userId = Number(store?.get('telegramUserId', 0)) || 0;
        const token = loadTelegramToken();
        if (!telegramEnabled || !userId || !token || !(0, telegram_bot_1.isBotRunning)())
            return;
        try {
            await (0, telegram_bot_1.sendMessage)(userId, normalizedPrompt);
        }
        catch (error) {
            console.warn('[UserInput] Falha ao notificar Telegram:', error?.message || error);
        }
    });
}
async function initTelegramBotIfConfigured() {
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
        await (0, telegram_bot_1.startBot)({ token, authorizedUserId: userId }, runAgentForTelegram);
        trayModeActive = true;
        if (!tray)
            createTray();
        syncUserInputNotifier();
        console.log('[Telegram] Bot iniciado automaticamente (modo 24/7 ativo)');
    }
    catch (e) {
        console.error('[Telegram] Falha ao iniciar bot:', e.message);
    }
}
async function runAgentForTelegram(_text, _sessionId) {
    // Roteamento via Telegram ficou desconectado quando o agent loop legado foi
    // removido. O caminho novo (Hermes/MCP) ainda nao esta wired ao bot.
    return 'Telegram desconectado do motor atual. Use o Console Lex no Desktop.';
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
electron_1.ipcMain.handle('telegram-set-config', async (_event, { token, userId }) => {
    if (!store)
        return { error: 'Store não inicializado' };
    const normalizedToken = String(token || '').trim();
    const normalizedUserId = Number(userId) || 0;
    store.set('telegramToken', normalizedToken ? (0, crypto_store_1.encryptApiKey)(normalizedToken) : '');
    store.set('telegramUserId', normalizedUserId);
    return { success: true };
});
/** Ativa o modo 24/7 (liga o bot + tray) */
electron_1.ipcMain.handle('telegram-enable', async () => {
    if (!store)
        return { error: 'Store não inicializado' };
    const token = loadTelegramToken();
    const userId = store.get('telegramUserId', 0);
    if (!token || !userId) {
        return { error: 'Configure o token e o ID do usuário antes de ativar.' };
    }
    try {
        await (0, telegram_bot_1.startBot)({ token, authorizedUserId: userId }, runAgentForTelegram);
        store.set('telegramEnabled', true);
        syncUserInputNotifier();
        refreshTrayMenu();
        return { success: true, running: true };
    }
    catch (e) {
        return { error: `Falha ao iniciar bot: ${e.message}` };
    }
});
/** Desativa o modo 24/7 (desliga o bot + remove comportamento de tray) */
electron_1.ipcMain.handle('telegram-disable', async () => {
    await (0, telegram_bot_1.stopBot)();
    if (store)
        store.set('telegramEnabled', false);
    syncUserInputNotifier();
    refreshTrayMenu();
    return { success: true, running: false };
});
/** Retorna status em tempo real */
electron_1.ipcMain.handle('telegram-get-status', () => ({
    running: (0, telegram_bot_1.isBotRunning)(),
    trayActive: trayModeActive
}));
// IPC: Run Agent Loop — proxy para backend (com fallback local)
// ============================================================================
// IPC: Brain (SQLite FTS5 + Knowledge Graph)
// ============================================================================
electron_1.ipcMain.handle('brain-get-graph', async () => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { nodes: [], edges: [] };
    return brain.getFullGraph();
});
electron_1.ipcMain.handle('brain-get-subgraph', async (_event, { nodeId, depth }) => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { nodes: [], edges: [] };
    return brain.getSubgraph(nodeId, depth ?? 1);
});
electron_1.ipcMain.handle('brain-search', async (_event, { query, types, limit }) => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return [];
    return brain.search(query, { types: types, limit });
});
electron_1.ipcMain.handle('brain-get-stats', async () => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { nodeCount: 0, edgeCount: 0, byType: {} };
    return brain.getStats();
});
electron_1.ipcMain.handle('brain-dashboard', async (_event, opts) => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return null;
    const { getDashboardOverview } = await Promise.resolve().then(() => __importStar(require('./brain/dashboard')));
    return getDashboardOverview(brain, {
        windowDays: opts?.windowDays ?? 7,
        topFlowsLimit: opts?.topFlowsLimit ?? 10,
    });
});
electron_1.ipcMain.handle('brain-promotion-preview', async (_event, payload) => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { ok: false, error: 'brain_not_initialized' };
    const { buildPromotionPreview } = await Promise.resolve().then(() => __importStar(require('./brain/dashboard')));
    return buildPromotionPreview(brain, String(payload?.flowId || ''), payload?.target);
});
async function writePromotionDraftFromPreview(workspaceRoot, preview) {
    if (!preview?.ok || !preview.markdown || !preview.flowId) {
        return { ok: false, error: 'promotion_preview_unavailable' };
    }
    const targetDirName = preview.target === 'skill'
        ? 'skills'
        : preview.target === 'playbook'
            ? 'playbooks'
            : 'notas';
    const targetDir = path.join(workspaceRoot, 'docs', 'promotions', targetDirName);
    const toSlug = (value, fallback = 'promotion-draft') => {
        const raw = String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return raw || fallback;
    };
    const dateStamp = new Date().toISOString().slice(0, 10);
    const baseName = `${dateStamp}-${toSlug(preview.label, 'promotion-draft')}`;
    let filePath = path.join(targetDir, `${baseName}.md`);
    let counter = 2;
    while (fs.existsSync(filePath)) {
        filePath = path.join(targetDir, `${baseName}-${counter}.md`);
        counter += 1;
    }
    const quoteYaml = (value) => JSON.stringify(String(value || '').replace(/\r?\n/g, ' ').trim());
    const frontmatter = [
        '---',
        `lex_generated: true`,
        `promotion_target: ${quoteYaml(preview.target || 'nota')}`,
        `source: ${quoteYaml('brain_dashboard')}`,
        `flow_id: ${quoteYaml(preview.flowId)}`,
        `tribunal: ${quoteYaml(preview.tribunal || '?')}`,
        `pje_context: ${quoteYaml(preview.pjeContext || 'nao_identificado')}`,
        `generated_at: ${quoteYaml(new Date().toISOString())}`,
        '---',
        '',
        '> Rascunho gerado com curadoria manual a partir de um candidato de promocao do Brain.',
        '> Este arquivo ainda nao altera skills ativas do Hermes nem publica conhecimento automaticamente.',
        '',
    ].join('\n');
    try {
        await fs.promises.mkdir(targetDir, { recursive: true });
        await fs.promises.writeFile(filePath, `${frontmatter}${preview.markdown.trim()}\n`, 'utf8');
        return {
            ok: true,
            path: filePath,
            relativePath: path.relative(workspaceRoot, filePath).replace(/\\/g, '/'),
            target: preview.target,
        };
    }
    catch (error) {
        return { ok: false, error: error?.message || 'promotion_draft_write_failed' };
    }
}
electron_1.ipcMain.handle('brain-promotion-save-draft', async (_event, payload) => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { ok: false, error: 'brain_not_initialized' };
    const workspaceRoot = getWorkspaceRoots()[0];
    if (!workspaceRoot) {
        return { ok: false, error: 'workspace_not_available' };
    }
    const { buildPromotionPreview } = await Promise.resolve().then(() => __importStar(require('./brain/dashboard')));
    const preview = buildPromotionPreview(brain, String(payload?.flowId || ''), payload?.target);
    return writePromotionDraftFromPreview(workspaceRoot, preview);
});
electron_1.ipcMain.handle('brain-promotion-curate', async (_event, payload) => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { ok: false, error: 'brain_not_initialized' };
    const flowId = String(payload?.flowId || '').trim();
    const action = payload?.action;
    if (!flowId || !action) {
        return { ok: false, error: 'promotion_action_required' };
    }
    const { buildPromotionPreview, setPromotionDecision } = await Promise.resolve().then(() => __importStar(require('./brain/dashboard')));
    if (action === 'brain_only' || action === 'discarded') {
        setPromotionDecision(brain, flowId, {
            action,
            at: new Date().toISOString(),
        });
        return { ok: true, action };
    }
    const workspaceRoot = getWorkspaceRoots()[0];
    if (!workspaceRoot) {
        return { ok: false, error: 'workspace_not_available' };
    }
    const preview = buildPromotionPreview(brain, flowId, action);
    const saved = await writePromotionDraftFromPreview(workspaceRoot, preview);
    if (!saved?.ok)
        return saved;
    setPromotionDecision(brain, flowId, {
        action,
        at: new Date().toISOString(),
        path: String(saved.relativePath || saved.path || ''),
    });
    return {
        ok: true,
        action,
        path: saved.path,
        relativePath: saved.relativePath,
    };
});
electron_1.ipcMain.handle('brain-trace', async (_event, traceId) => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return null;
    const { getTrace } = await Promise.resolve().then(() => __importStar(require('./brain/trace-query')));
    return getTrace(brain, traceId);
});
electron_1.ipcMain.handle('brain-detect-flows', async () => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { error: 'brain não inicializado' };
    const { detectFlows } = await Promise.resolve().then(() => __importStar(require('./brain/flow-detector')));
    return detectFlows(brain);
});
electron_1.ipcMain.handle('brain-get-preference', async (_event, key, fallback) => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return fallback;
    return brain.getPreference(key, fallback);
});
electron_1.ipcMain.handle('brain-set-preference', async (_event, key, value) => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return { ok: false, error: 'brain não inicializado' };
    brain.setPreference(key, value);
    return { ok: true };
});
electron_1.ipcMain.handle('brain-export-patterns', async () => {
    try {
        const { exportBrain } = await Promise.resolve().then(() => __importStar(require('./brain/brain-export')));
        const brain = (0, brain_1.getBrain)();
        return await exportBrain(brain, { mode: 'patterns' });
    }
    catch (err) {
        return { error: err?.message || String(err) };
    }
});
electron_1.ipcMain.handle('brain-get-node', async (_event, nodeId) => {
    const brain = (0, brain_1.getBrainSafe)();
    if (!brain)
        return null;
    return brain.getNode(nodeId);
});
electron_1.ipcMain.handle('brain-run-dream', async (_event, opts) => {
    try {
        const { runDream } = await Promise.resolve().then(() => __importStar(require('./brain/dream')));
        const brain = (0, brain_1.getBrain)();
        return await runDream(brain, opts || {});
    }
    catch (err) {
        console.error('[Brain] Dream falhou:', err);
        return { error: err.message };
    }
});
electron_1.ipcMain.handle('brain-dream-history', async () => {
    try {
        const { getDreamHistory } = await Promise.resolve().then(() => __importStar(require('./brain/dream')));
        const brain = (0, brain_1.getBrain)();
        return getDreamHistory(brain);
    }
    catch (err) {
        console.error('[Brain] Dream history falhou:', err);
        return [];
    }
});
electron_1.ipcMain.handle('brain-restore-dream-snapshot', async (_event, snapshotPath) => {
    try {
        const { restoreDreamSnapshot } = await Promise.resolve().then(() => __importStar(require('./brain/dream')));
        const brain = (0, brain_1.getBrain)();
        return restoreDreamSnapshot(brain, snapshotPath);
    }
    catch (err) {
        console.error('[Brain] Dream restore falhou:', err);
        return { ok: false, snapshotPath, restoredAt: new Date().toISOString(), nodesRestored: 0, edgesRestored: 0, error: err.message };
    }
});
electron_1.ipcMain.handle('brain-export', async () => {
    try {
        const { exportBrain } = await Promise.resolve().then(() => __importStar(require('./brain/brain-export')));
        const brain = (0, brain_1.getBrain)();
        return await exportBrain(brain);
    }
    catch (err) {
        console.error('[Brain] Export falhou:', err);
        return { error: err.message };
    }
});
electron_1.ipcMain.handle('brain-import', async (_event, zipPath) => {
    try {
        const { importBrain } = await Promise.resolve().then(() => __importStar(require('./brain/brain-export')));
        const brain = (0, brain_1.getBrain)();
        return await importBrain(brain, zipPath);
    }
    catch (err) {
        console.error('[Brain] Import falhou:', err);
        return { error: err.message };
    }
});
electron_1.ipcMain.handle('brain-render-markdown', async () => {
    try {
        const { renderBrainMarkdown } = await Promise.resolve().then(() => __importStar(require('./brain/brain-renderer')));
        const brain = (0, brain_1.getBrain)();
        return await renderBrainMarkdown(brain);
    }
    catch (err) {
        console.error('[Brain] Render falhou:', err);
        return { error: err.message };
    }
});
// ============================================================================
// IPC: DataJud Pipeline
// ============================================================================
electron_1.ipcMain.handle('datajud-get-profile', async () => {
    const { getProfile } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    return getProfile();
});
electron_1.ipcMain.handle('datajud-save-profile', async (_event, profile) => {
    const { saveProfile } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    await saveProfile(profile);
    return { success: true };
});
electron_1.ipcMain.handle('datajud-set-api-key', async (_event, key) => {
    const { setDataJudApiKey, getSyncEngine } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    await setDataJudApiKey(key);
    // Reinicia sync engine com a nova key
    const engine = getSyncEngine();
    if (engine)
        await engine.restart();
    return { success: true };
});
electron_1.ipcMain.handle('datajud-has-api-key', async () => {
    const { hasDataJudApiKey } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    return hasDataJudApiKey();
});
electron_1.ipcMain.handle('datajud-add-processo', async (_event, processo) => {
    const { addMonitoredProcesso } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    await addMonitoredProcesso(processo);
    return { success: true };
});
electron_1.ipcMain.handle('datajud-remove-processo', async (_event, numero) => {
    const { removeMonitoredProcesso } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    await removeMonitoredProcesso(numero);
    return { success: true };
});
electron_1.ipcMain.handle('datajud-list-processos', async () => {
    const { getMonitoredProcessos } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    return getMonitoredProcessos();
});
electron_1.ipcMain.handle('datajud-search', async (_event, { numero, tribunal }) => {
    const { getSyncEngine } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    const engine = getSyncEngine();
    if (!engine)
        return { error: 'Pipeline não inicializado' };
    const result = await engine.queryCold(numero, tribunal);
    return result || { error: 'Processo não encontrado' };
});
electron_1.ipcMain.handle('datajud-trigger-hot', async () => {
    const { getSyncEngine } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    const engine = getSyncEngine();
    if (!engine)
        return { error: 'Pipeline não inicializado' };
    return engine.runHotSync();
});
electron_1.ipcMain.handle('datajud-trigger-warm', async () => {
    const { getSyncEngine } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    const engine = getSyncEngine();
    if (!engine)
        return { error: 'Pipeline não inicializado' };
    return engine.runWarmSync();
});
electron_1.ipcMain.handle('datajud-get-sync-state', async () => {
    const { getSyncEngine } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    const engine = getSyncEngine();
    if (!engine)
        return null;
    return engine.getState();
});
electron_1.ipcMain.handle('datajud-get-stats', async () => {
    const { getProfile, hasDataJudApiKey, getProcessoStoreStats, getJurisprudenciaStats, getSyncEngine } = await Promise.resolve().then(() => __importStar(require('./datajud')));
    const profile = await getProfile();
    const hasKey = await hasDataJudApiKey();
    const processoStats = getProcessoStoreStats();
    const jurispStats = getJurisprudenciaStats();
    const engine = getSyncEngine();
    const state = engine?.getState();
    return {
        profileConfigured: profile.tribunais.length > 0 || profile.areasAtuacao.length > 0,
        hasApiKey: hasKey,
        processosMonitorados: profile.processosMonitorados.length,
        processosAtivos: profile.processosMonitorados.filter(p => p.ativo).length,
        decisoesArmazenadas: jurispStats.total,
        processosArmazenados: processoStats.total,
        lastHotSync: state?.lastHotSync || null,
        lastWarmSync: state?.lastWarmSync || null,
        consecutiveErrors: state?.consecutiveErrors || 0,
    };
});
// ============================================================================
// IPC: Knowledge Base de Documentos (Fase 3.5.3)
// ============================================================================
// Schemas
electron_1.ipcMain.handle('doc-kb-list-schemas', async () => {
    const { getAllSchemas } = await Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return getAllSchemas();
});
electron_1.ipcMain.handle('doc-kb-get-schema', async (_, id) => {
    const { getSchema } = await Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return getSchema(id);
});
electron_1.ipcMain.handle('doc-kb-search-schemas', async (_, query) => {
    const { searchSchemas } = await Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return searchSchemas(query);
});
electron_1.ipcMain.handle('doc-kb-get-categories', async () => {
    const { listCategories } = await Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return listCategories();
});
electron_1.ipcMain.handle('doc-kb-schemas-by-category', async (_, cat) => {
    const { getSchemasByCategory } = await Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return getSchemasByCategory(cat);
});
// Examples
electron_1.ipcMain.handle('doc-kb-get-examples', async (_, { schemaId, limit }) => {
    const { getExamples } = await Promise.resolve().then(() => __importStar(require('./legal/doc-examples')));
    return getExamples(schemaId, limit);
});
electron_1.ipcMain.handle('doc-kb-search-examples', async (_, { query, limit }) => {
    const { searchExamples } = await Promise.resolve().then(() => __importStar(require('./legal/doc-examples')));
    return searchExamples(query, limit);
});
electron_1.ipcMain.handle('doc-kb-get-stats', async () => {
    const { getExampleStats } = await Promise.resolve().then(() => __importStar(require('./legal/doc-examples')));
    const { getSchemaStats } = await Promise.resolve().then(() => __importStar(require('./legal/doc-schema-registry')));
    return {
        schemas: getSchemaStats(),
        examples: getExampleStats(),
    };
});
// Import
electron_1.ipcMain.handle('doc-kb-import-folder', async (_, folderPath) => {
    const { importFolder } = await Promise.resolve().then(() => __importStar(require('./legal/doc-importer')));
    return importFolder(folderPath, (msg) => {
        mainWindow?.webContents.send('doc-kb-import-progress', msg);
    });
});
electron_1.ipcMain.handle('doc-kb-import-file', async (_, filePath) => {
    const { importFile } = await Promise.resolve().then(() => __importStar(require('./legal/doc-importer')));
    return importFile(filePath);
});
electron_1.ipcMain.handle('doc-kb-select-and-import', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Selecionar pasta com documentos jurídicos',
    });
    if (result.canceled || !result.filePaths[0])
        return { imported: 0, skipped: 0, errors: [] };
    const { importFolder } = await Promise.resolve().then(() => __importStar(require('./legal/doc-importer')));
    return importFolder(result.filePaths[0], (msg) => {
        mainWindow?.webContents.send('doc-kb-import-progress', msg);
    });
});
function emitAgoraEvent(event) {
    for (const win of electron_1.BrowserWindow.getAllWindows()) {
        win.webContents.send('agora-event', event);
    }
}
function ensureEngineAgoraBoardFile() {
    const boardPath = (0, lex_engine_1.getLexEngineAgoraBoardPath)();
    try {
        fs.mkdirSync(path.dirname(boardPath), { recursive: true });
        if (!fs.existsSync(boardPath)) {
            fs.writeFileSync(boardPath, JSON.stringify({ cards: {}, comments: {}, events: [] }, null, 2) + '\n', 'utf-8');
        }
    }
    catch (err) {
        console.warn('[Agora] Falha ao preparar board compartilhado:', err?.message || err);
    }
}
function getLexEngineKanbanDbPath() {
    return path.join((0, lex_engine_1.getLexEngineKanbanHomePath)(), 'kanban.db');
}
function ensureEngineKanbanHome() {
    try {
        fs.mkdirSync((0, lex_engine_1.getLexEngineKanbanHomePath)(), { recursive: true });
    }
    catch (err) {
        console.warn('[Agora] Falha ao preparar Kanban home:', err?.message || err);
    }
}
function startAgoraBoardWatcher() {
    if (agoraBoardWatchListener)
        return;
    ensureEngineKanbanHome();
    const boardPath = getLexEngineKanbanDbPath();
    let lastEmitAt = 0;
    agoraBoardWatchListener = (curr, prev) => {
        if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size)
            return;
        const now = Date.now();
        if (now - lastEmitAt < 150)
            return;
        lastEmitAt = now;
        emitAgoraEvent({
            type: 'board_changed',
            cardId: null,
            timestamp: new Date().toISOString(),
        });
    };
    fs.watchFile(boardPath, { interval: 750 }, agoraBoardWatchListener);
}
function stopAgoraBoardWatcher() {
    if (!agoraBoardWatchListener)
        return;
    fs.unwatchFile(getLexEngineKanbanDbPath(), agoraBoardWatchListener);
    agoraBoardWatchListener = null;
}
async function runAgoraDispatcherTick(reason = 'timer') {
    if (agoraDispatcherBusy)
        return;
    agoraDispatcherBusy = true;
    try {
        const { runKanbanBridge } = await Promise.resolve().then(() => __importStar(require('./agora/kanban-bridge')));
        const result = await runKanbanBridge('dispatch', {
            max_spawn: Number(process.env['LEX_AGORA_MAX_SPAWN'] || 1),
            failure_limit: Number(process.env['LEX_AGORA_FAILURE_LIMIT'] || 2),
        });
        const dispatch = result.dispatch || {};
        const hasActivity = dispatch.promoted
            || dispatch.reclaimed
            || dispatch.timed_out?.length
            || dispatch.crashed?.length
            || dispatch.auto_blocked?.length
            || dispatch.spawned?.length;
        if (hasActivity) {
            emitAgoraEvent({
                type: 'dispatcher_tick',
                cardId: null,
                timestamp: new Date().toISOString(),
                reason,
                dispatch,
            });
        }
    }
    catch (err) {
        console.warn('[Agora] Dispatcher tick falhou:', err?.message || err);
    }
    finally {
        agoraDispatcherBusy = false;
    }
}
function startAgoraDispatcher() {
    if (agoraDispatcherTimer || process.env['LEX_AGORA_DISPATCHER_DISABLED'] === '1')
        return;
    const interval = Math.max(10, Number(process.env['LEX_AGORA_DISPATCH_INTERVAL_SECONDS'] || 60)) * 1000;
    runAgoraDispatcherTick('startup');
    agoraDispatcherTimer = setInterval(() => {
        runAgoraDispatcherTick('timer');
    }, interval);
}
function stopAgoraDispatcher() {
    if (!agoraDispatcherTimer)
        return;
    clearInterval(agoraDispatcherTimer);
    agoraDispatcherTimer = null;
}
function readEngineAgoraCards() {
    try {
        const raw = readEngineAgoraBoard();
        const cards = Object.values(raw.cards || {});
        return cards.map((card) => ({
            ...card,
            source: card.source || 'engine',
            createdAt: card.createdAt || card.created_at,
            updatedAt: card.updatedAt || card.updated_at,
            comments: Array.isArray(raw.comments?.[card.id]) ? raw.comments[card.id] : [],
            events: Array.isArray(raw.events)
                ? raw.events.filter((event) => event.card_id === card.id).slice(-20)
                : [],
        }));
    }
    catch (err) {
        console.warn('[Agora] Falha ao ler board do Engine:', err?.message || err);
        return [];
    }
}
const AGORA_COLUMN_ORDER = ['entrada', 'especificacao', 'pronto_execucao', 'execucao', 'revisao', 'pronto'];
const AGORA_PRIORITIES = ['Alta', 'Media', 'Baixa'];
function readEngineAgoraBoard() {
    const boardPath = (0, lex_engine_1.getLexEngineAgoraBoardPath)();
    if (!fs.existsSync(boardPath))
        return { cards: {}, comments: {}, events: [] };
    const raw = JSON.parse(fs.readFileSync(boardPath, 'utf-8'));
    return {
        cards: raw && raw.cards && typeof raw.cards === 'object' ? raw.cards : {},
        comments: raw && raw.comments && typeof raw.comments === 'object' ? raw.comments : {},
        events: Array.isArray(raw?.events) ? raw.events : [],
    };
}
function writeEngineAgoraBoard(board) {
    const boardPath = (0, lex_engine_1.getLexEngineAgoraBoardPath)();
    fs.mkdirSync(path.dirname(boardPath), { recursive: true });
    fs.writeFileSync(boardPath, JSON.stringify(board, null, 2) + '\n', 'utf-8');
}
function normalizeEngineAgoraCard(card) {
    return {
        ...card,
        source: card.source || 'engine',
        createdAt: card.createdAt || card.created_at,
        updatedAt: card.updatedAt || card.updated_at,
    };
}
function cleanAgoraText(value, fallback, limit) {
    const text = String(value ?? fallback).trim() || fallback;
    return text.slice(0, limit);
}
function cleanAgoraColumn(value) {
    const column = String(value || 'entrada').trim();
    return AGORA_COLUMN_ORDER.includes(column) ? column : 'entrada';
}
function cleanAgoraPriority(value) {
    const priority = String(value || 'Media').trim();
    return AGORA_PRIORITIES.includes(priority) ? priority : 'Media';
}
function cleanAgoraProgress(value) {
    const progress = Number(value);
    if (!Number.isFinite(progress))
        return 0;
    return Math.max(0, Math.min(100, Math.round(progress)));
}
function makeEngineAgoraId(board) {
    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    let id = `agora-${stamp}`;
    let counter = 2;
    while (board.cards[id]) {
        id = `agora-${stamp}-${counter}`;
        counter += 1;
    }
    return id;
}
function appendEngineAgoraEvent(board, kind, cardId, payload) {
    board.events = Array.isArray(board.events) ? board.events : [];
    board.events.push({
        kind,
        card_id: cardId,
        payload: payload || {},
        created_at: new Date().toISOString(),
    });
    board.events = board.events.slice(-200);
}
function createEngineAgoraCard(input) {
    try {
        const board = readEngineAgoraBoard();
        const now = new Date().toISOString();
        const id = cleanAgoraText(input?.id || input?.card_id, '', 80) || makeEngineAgoraId(board);
        if (board.cards[id])
            return normalizeEngineAgoraCard(board.cards[id]);
        const card = {
            id,
            column: cleanAgoraColumn(input?.column),
            type: cleanAgoraText(input?.type, 'Tarefa', 40),
            title: cleanAgoraText(input?.title, 'Nova tarefa juridica', 160),
            summary: cleanAgoraText(input?.summary, 'Rascunho local pronto para conectar ao orquestrador.', 420),
            agent: cleanAgoraText(input?.agent, 'Orquestrador', 80),
            guardrail: cleanAgoraText(input?.guardrail, 'Aguardando escopo', 80),
            priority: cleanAgoraPriority(input?.priority),
            progress: cleanAgoraProgress(input?.progress ?? 5),
            source: 'engine',
            created_at: now,
            updated_at: now,
        };
        board.cards[id] = card;
        board.comments[id] = board.comments[id] || [];
        appendEngineAgoraEvent(board, 'card_created', id, { title: card.title });
        writeEngineAgoraBoard(board);
        return normalizeEngineAgoraCard(card);
    }
    catch (err) {
        console.warn('[Agora] Falha ao criar card no board compartilhado:', err?.message || err);
        return null;
    }
}
function updateEngineAgoraCard(id, updates) {
    try {
        const board = readEngineAgoraBoard();
        if (!board.cards[id])
            return null;
        const card = board.cards[id];
        for (const [key, limit] of Object.entries({ type: 40, title: 160, summary: 420, agent: 80, guardrail: 80 })) {
            if (updates && updates[key] !== undefined)
                card[key] = cleanAgoraText(updates[key], card[key] || '', Number(limit));
        }
        if (updates?.column !== undefined)
            card.column = cleanAgoraColumn(updates.column);
        if (updates?.priority !== undefined)
            card.priority = cleanAgoraPriority(updates.priority);
        if (updates?.progress !== undefined)
            card.progress = cleanAgoraProgress(updates.progress);
        card.updated_at = new Date().toISOString();
        appendEngineAgoraEvent(board, 'card_updated', id);
        writeEngineAgoraBoard(board);
        return normalizeEngineAgoraCard(card);
    }
    catch (err) {
        console.warn('[Agora] Falha ao atualizar card do board compartilhado:', err?.message || err);
        return null;
    }
}
function moveEngineAgoraCard(id, direction) {
    try {
        const raw = readEngineAgoraBoard();
        if (!raw || !raw.cards || !raw.cards[id])
            return null;
        const card = raw.cards[id];
        const current = AGORA_COLUMN_ORDER.includes(card.column) ? card.column : 'entrada';
        const index = AGORA_COLUMN_ORDER.indexOf(current);
        const next = AGORA_COLUMN_ORDER[index + Number(direction || 0)];
        if (!next)
            return normalizeEngineAgoraCard(card);
        card.column = next;
        card.progress = Math.max(5, Math.min(100, Number(card.progress || 0) + (direction > 0 ? 20 : -20)));
        if (next === 'pronto')
            card.progress = 100;
        card.updated_at = new Date().toISOString();
        raw.events = Array.isArray(raw.events) ? raw.events : [];
        raw.events.push({
            kind: 'card_moved',
            card_id: id,
            payload: { from: current, to: next },
            created_at: new Date().toISOString(),
        });
        writeEngineAgoraBoard(raw);
        return normalizeEngineAgoraCard(card);
    }
    catch (err) {
        console.warn('[Agora] Falha ao mover card do Engine:', err?.message || err);
        return null;
    }
}
function removeEngineAgoraCard(id) {
    try {
        const board = readEngineAgoraBoard();
        if (!board.cards[id])
            return false;
        const card = board.cards[id];
        delete board.cards[id];
        delete board.comments[id];
        appendEngineAgoraEvent(board, 'card_removed', id, { title: card.title });
        writeEngineAgoraBoard(board);
        return true;
    }
    catch (err) {
        console.warn('[Agora] Falha ao remover card do board compartilhado:', err?.message || err);
        return false;
    }
}
function commentEngineAgoraCard(id, body, author = 'Electron') {
    try {
        const board = readEngineAgoraBoard();
        if (!board.cards[id])
            return null;
        const comment = {
            author: cleanAgoraText(author, 'Electron', 80),
            body: cleanAgoraText(body, '', 2000),
            created_at: new Date().toISOString(),
        };
        if (!comment.body)
            return null;
        board.comments[id] = Array.isArray(board.comments[id]) ? board.comments[id] : [];
        board.comments[id].push(comment);
        board.cards[id].updated_at = new Date().toISOString();
        appendEngineAgoraEvent(board, 'comment_added', id, { author: comment.author });
        writeEngineAgoraBoard(board);
        return {
            ...normalizeEngineAgoraCard(board.cards[id]),
            comments: board.comments[id],
            events: board.events.filter((event) => event.card_id === id).slice(-20),
        };
    }
    catch (err) {
        console.warn('[Agora] Falha ao comentar card do board compartilhado:', err?.message || err);
        return null;
    }
}
electron_1.ipcMain.handle('agora-list-cards', async () => {
    try {
        const { runKanbanBridge } = await Promise.resolve().then(() => __importStar(require('./agora/kanban-bridge')));
        const result = await runKanbanBridge('list');
        if (result.ok && Array.isArray(result.cards))
            return result.cards;
    }
    catch (err) {
        console.warn('[Agora] Kanban oficial indisponivel, usando fallback JSON/local:', err?.message || err);
    }
    const { getAgoraStore } = await Promise.resolve().then(() => __importStar(require('./agora')));
    const localCards = await getAgoraStore().getAllCards();
    const engineCards = readEngineAgoraCards();
    const seen = new Set(localCards.map((card) => card.id));
    return [
        ...engineCards.filter((card) => card && card.id && !seen.has(card.id)),
        ...localCards,
    ];
});
electron_1.ipcMain.handle('agora-get-card', async (_event, id) => {
    try {
        const { runKanbanBridge } = await Promise.resolve().then(() => __importStar(require('./agora/kanban-bridge')));
        const result = await runKanbanBridge('get', { id });
        if (result.ok && result.card)
            return result.card;
    }
    catch (err) {
        console.warn('[Agora] Kanban get falhou, usando fallback:', err?.message || err);
    }
    const { getAgoraStore } = await Promise.resolve().then(() => __importStar(require('./agora')));
    const engineCard = readEngineAgoraCards().find((card) => card.id === id);
    return engineCard || getAgoraStore().getCard(id);
});
electron_1.ipcMain.handle('agora-create-card', async (_event, input) => {
    try {
        const { runKanbanBridge } = await Promise.resolve().then(() => __importStar(require('./agora/kanban-bridge')));
        const result = await runKanbanBridge('create', input || {});
        if (result.ok && result.card) {
            emitAgoraEvent({ type: 'card_created', cardId: result.card.id, card: result.card, timestamp: new Date().toISOString() });
            return result.card;
        }
    }
    catch (err) {
        console.warn('[Agora] Kanban create falhou, usando fallback:', err?.message || err);
    }
    const { getAgoraStore } = await Promise.resolve().then(() => __importStar(require('./agora')));
    const card = createEngineAgoraCard(input || {}) || await getAgoraStore().addCard(input || {});
    emitAgoraEvent({ type: 'card_created', cardId: card.id, card, timestamp: new Date().toISOString() });
    return card;
});
electron_1.ipcMain.handle('agora-update-card', async (_event, { id, updates }) => {
    try {
        const { runKanbanBridge } = await Promise.resolve().then(() => __importStar(require('./agora/kanban-bridge')));
        const result = await runKanbanBridge('update', { id, updates: updates || {} });
        if (result.ok && result.card) {
            emitAgoraEvent({ type: 'card_updated', cardId: result.card.id, card: result.card, timestamp: new Date().toISOString() });
            return result.card;
        }
    }
    catch (err) {
        console.warn('[Agora] Kanban update falhou, usando fallback:', err?.message || err);
    }
    const { getAgoraStore } = await Promise.resolve().then(() => __importStar(require('./agora')));
    const card = updateEngineAgoraCard(id, updates || {}) || await getAgoraStore().updateCard(id, updates || {});
    if (card)
        emitAgoraEvent({ type: 'card_updated', cardId: card.id, card, timestamp: new Date().toISOString() });
    return card;
});
electron_1.ipcMain.handle('agora-move-card', async (_event, { id, direction }) => {
    try {
        const { runKanbanBridge } = await Promise.resolve().then(() => __importStar(require('./agora/kanban-bridge')));
        const result = await runKanbanBridge('move', { id, direction: Number(direction || 0) });
        if (result.ok && result.card) {
            emitAgoraEvent({ type: 'card_moved', cardId: result.card.id, card: result.card, timestamp: new Date().toISOString() });
            return result.card;
        }
    }
    catch (err) {
        console.warn('[Agora] Kanban move falhou, usando fallback:', err?.message || err);
    }
    const { getAgoraStore } = await Promise.resolve().then(() => __importStar(require('./agora')));
    const card = moveEngineAgoraCard(id, Number(direction || 0)) || await getAgoraStore().moveCard(id, Number(direction || 0));
    if (card)
        emitAgoraEvent({ type: 'card_moved', cardId: card.id, card, timestamp: new Date().toISOString() });
    return card;
});
electron_1.ipcMain.handle('agora-remove-card', async (_event, id) => {
    try {
        const { runKanbanBridge } = await Promise.resolve().then(() => __importStar(require('./agora/kanban-bridge')));
        const result = await runKanbanBridge('remove', { id });
        if (result.ok && result.removed) {
            emitAgoraEvent({ type: 'card_removed', cardId: id, timestamp: new Date().toISOString() });
            return true;
        }
    }
    catch (err) {
        console.warn('[Agora] Kanban remove falhou, usando fallback:', err?.message || err);
    }
    const { getAgoraStore } = await Promise.resolve().then(() => __importStar(require('./agora')));
    const removed = removeEngineAgoraCard(id) || await getAgoraStore().removeCard(id);
    if (removed)
        emitAgoraEvent({ type: 'card_removed', cardId: id, timestamp: new Date().toISOString() });
    return removed;
});
electron_1.ipcMain.handle('agora-comment-card', async (_event, { id, body, author }) => {
    try {
        const { runKanbanBridge } = await Promise.resolve().then(() => __importStar(require('./agora/kanban-bridge')));
        const result = await runKanbanBridge('comment', { id, body, author: author || 'Electron' });
        if (result.ok && result.card) {
            emitAgoraEvent({ type: 'comment_added', cardId: id, card: result.card, timestamp: new Date().toISOString() });
            return result.card;
        }
    }
    catch (err) {
        console.warn('[Agora] Kanban comment falhou, usando fallback:', err?.message || err);
    }
    const card = commentEngineAgoraCard(id, body, author || 'Electron');
    if (card)
        emitAgoraEvent({ type: 'comment_added', cardId: id, card, timestamp: new Date().toISOString() });
    return card;
});
electron_1.ipcMain.handle('agora-get-runs', async (_event, id) => {
    try {
        const { runKanbanBridge } = await Promise.resolve().then(() => __importStar(require('./agora/kanban-bridge')));
        const result = await runKanbanBridge('runs', { id });
        if (result.ok)
            return { runs: result.runs || [], log: result.log || '' };
    }
    catch (err) {
        console.warn('[Agora] Kanban runs falhou:', err?.message || err);
    }
    return { runs: [], log: '' };
});
electron_1.ipcMain.handle('skills-catalog-list', async () => {
    try {
        return {
            success: true,
            catalog: (0, hermes_skills_catalog_1.listHermesSkillsCatalog)(electron_1.app.getAppPath()),
        };
    }
    catch (error) {
        return {
            success: false,
            error: error?.message || 'Falha ao carregar catalogo de habilidades.',
        };
    }
});
electron_1.ipcMain.handle('skills-runtime-snapshot', async () => {
    try {
        return {
            success: true,
            snapshot: await (0, lex_engine_1.getLexEngineSkillsRuntimeSnapshot)(),
        };
    }
    catch (error) {
        return {
            success: false,
            error: error?.message || 'Falha ao consultar runtime de habilidades.',
        };
    }
});
electron_1.ipcMain.handle('skills-connectors-snapshot', async () => {
    try {
        return {
            success: true,
            snapshot: await (0, lex_engine_1.getLexEngineConnectorsSnapshot)(),
        };
    }
    catch (error) {
        return {
            success: false,
            error: error?.message || 'Falha ao consultar connectors do Hermes.',
        };
    }
});
electron_1.ipcMain.handle('skills-read-file', async (_event, skillPath) => {
    try {
        const requestedPath = path.resolve(String(skillPath || ''));
        const catalog = (0, hermes_skills_catalog_1.listHermesSkillsCatalog)(electron_1.app.getAppPath());
        const entry = catalog.entries.find((item) => path.resolve(item.path) === requestedPath);
        if (!entry) {
            return {
                success: false,
                error: 'Skill nao encontrada no catalogo atual.',
            };
        }
        return {
            success: true,
            content: fs.readFileSync(entry.path, 'utf-8'),
            path: entry.path,
        };
    }
    catch (error) {
        return {
            success: false,
            error: error?.message || 'Falha ao ler arquivo da skill.',
        };
    }
});
// ============================================================================
// IPC: Auth / Licença
// ============================================================================
electron_1.ipcMain.handle('auth-sign-in', async (_event, { email, password }) => {
    return (0, license_1.authSignIn)(email, password);
});
electron_1.ipcMain.handle('auth-sign-up', async (_event, { email, password }) => {
    return (0, license_1.authSignUp)(email, password);
});
electron_1.ipcMain.handle('auth-sign-out', async () => {
    await (0, license_1.authSignOut)();
    return { ok: true };
});
electron_1.ipcMain.handle('auth-google', async (_event, opts) => {
    try {
        const http = await Promise.resolve().then(() => __importStar(require('http')));
        const mode = opts?.mode === 'embedded' ? 'embedded' : 'system';
        let authWindow = null;
        // Cria servidor local para capturar o callback
        const { port, tokenPromise, server } = await new Promise((resolve, reject) => {
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
                        const callbackBase = 'http://127.0.0.1:${port}';
                        if (hash) {
                            fetch(callbackBase + '/auth/tokens?' + hash)
                                .then(() => {
                                    document.body.innerHTML = '<h2 style="font-family:sans-serif;text-align:center;margin-top:40px">Login realizado! Pode fechar esta aba.</h2>';
                                })
                                .catch((err) => {
                                    document.body.innerHTML = '<h2 style="font-family:sans-serif;text-align:center;margin-top:40px;color:red">Falha ao finalizar login localmente.</h2><pre style="white-space:pre-wrap;max-width:720px;margin:20px auto;color:#444">' + String(err && err.message || err || 'fetch failed') + '</pre>';
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
        const redirectTo = `http://127.0.0.1:${port}/auth/callback`;
        // Gera URL OAuth via Supabase com redirect para nosso server local
        const { getSupabase } = await Promise.resolve().then(() => __importStar(require('./auth/supabase-client')));
        const sb = getSupabase();
        const { data, error } = await sb.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
                skipBrowserRedirect: true,
                ...(mode === 'embedded' ? { queryParams: { prompt: 'select_account' } } : {}),
            },
        });
        if (error || !data?.url) {
            server.close();
            return { ok: false, error: error?.message || 'Falha ao gerar URL de login' };
        }
        // Abre no navegador do sistema (Chrome, Edge, etc.) onde o usuário já está logado
        if (mode === 'embedded') {
            authWindow = new electron_1.BrowserWindow({
                width: 540,
                height: 760,
                minWidth: 480,
                minHeight: 640,
                show: false,
                autoHideMenuBar: true,
                title: 'Entrar na Lex',
                parent: mainWindow || undefined,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    partition: 'persist:lex-auth',
                },
            });
            authWindow.once('ready-to-show', () => authWindow?.show());
            authWindow.on('closed', () => {
                authWindow = null;
            });
            await authWindow.loadURL(data.url);
        }
        else {
            await electron_1.shell.openExternal(data.url);
        }
        // Timeout de 5 minutos
        const timeout = setTimeout(() => {
            try {
                authWindow?.close();
            }
            catch { }
            server.close();
        }, 5 * 60 * 1000);
        const tokenString = await tokenPromise;
        clearTimeout(timeout);
        try {
            authWindow?.close();
        }
        catch { }
        server.close();
        if (!tokenString) {
            return { ok: false, error: 'Login cancelado ou falhou' };
        }
        // Seta sessão no Supabase
        const params = new URLSearchParams(tokenString);
        const accessToken = params.get('access_token') || '';
        const refreshToken = params.get('refresh_token') || '';
        const { error: sessionError } = await sb.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });
        if (sessionError) {
            return { ok: false, error: sessionError.message };
        }
        // Garante perfil no banco, mas nao invalida um login ja concluido
        // por uma chamada secundaria de rede no bootstrap do perfil.
        try {
            const { data: { user }, error: userError } = await sb.auth.getUser();
            if (userError) {
                console.warn('[Auth] Google OAuth: sessao criada, mas getUser falhou:', userError.message);
            }
            else if (user) {
                const { error: profileError } = await sb.from('profiles').upsert({ id: user.id, email: user.email, trial_started_at: new Date().toISOString(), plan: 'trial' }, { onConflict: 'id', ignoreDuplicates: true });
                if (profileError) {
                    console.warn('[Auth] Google OAuth: sessao criada, mas upsert de profile falhou:', profileError.message);
                }
            }
        }
        catch (profileBootstrapError) {
            console.warn('[Auth] Google OAuth: sessao criada, mas bootstrap de profile falhou:', profileBootstrapError?.message || profileBootstrapError);
        }
        return { ok: true };
    }
    catch (err) {
        console.error('[Auth] Google OAuth error:', err);
        return { ok: false, error: err.message };
    }
});
electron_1.ipcMain.handle('auth-check-license', async () => {
    return (0, license_1.checkLicense)();
});
electron_1.ipcMain.handle('auth-refresh-license', async () => {
    (0, license_1.refreshLicense)();
    return (0, license_1.checkLicense)();
});
electron_1.ipcMain.handle('auth-get-profile', async () => {
    return (0, license_1.getProfile)();
});
electron_1.ipcMain.handle('update-install-now', () => {
    electron_updater_1.autoUpdater.quitAndInstall();
});
// Setup event forwarding after window is created
// We'll call this in createWindow
//# sourceMappingURL=main.js.map