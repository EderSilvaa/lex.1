import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { getKnownPJeHosts } from './pje/tribunal-urls';
import { closeBrowser, getActivePage, reInitBrowser, setUserDataDir } from './browser-manager';
import { initMemoryDir } from './agent/memory';
import { initRouteMemory, flush as flushRouteMemory } from './pje/route-memory';
import { startBackend, stopBackend, rpcCall, backendEvents, syncConfigToBackend, isBackendAlive } from './backend-client';
import { encryptApiKey, safeDecrypt, isEncrypted, initCryptoStoreSalt } from './crypto-store';
import { getDocIndex } from './agent/doc-index';
import { downloadIncremental, downloadTudo, getLegislacaoStats, verificarDesatualizados } from './agent/legislacao-downloader';
import { PROVIDER_PRESETS, setActiveConfig, getActiveConfig, type ProviderId } from './provider-config';
import { initSupabase } from './auth/supabase-client';
import { authSignIn, authSignUp, authSignOut, checkLicense, refreshLicense } from './auth/license';
import { getAnalytics } from './analytics';
import { autoUpdater } from 'electron-updater';
import {
    initConsentManager, initAuditLog, flushAuditLog,
    getConsentConfig, setDefaultLevel, setProviderConsent,
    completeOnboarding, isOnboardingCompleted, revokeAllConsent,
    getEffectiveLevel, getAuditSummary
} from './privacy';
import {
    getOllamaStatus, isOllamaRunning, listModels as ollamaListModels, pullModel,
    deleteModel, getRecommendedModelsWithStatus, ollamaEmitter,
    RECOMMENDED_MODELS
} from './ollama-manager';

// Suprime EPIPE (pipe quebrado ao rodar via terminal/background) — evita crash dialog
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code === 'EPIPE') return })
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code === 'EPIPE') return })

// Desabilita GPU do Electron para evitar conflito com Chrome externo e sandbox issues
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu-sandbox')

// Agent module loaded dynamically after app ready
let agentModule: {
    initializeAgent: () => Promise<void>;
    runAgentLoop: (objetivo: string, config: any, tenantConfig: any, sessionId?: string) => Promise<string>;
    cancelAgentLoop: (runId?: string) => boolean;
    agentEmitter: import('events').EventEmitter;
    getDefaultTenantConfig: () => any;
    getSessionManager: () => any;
} | null = null;
const AGENT_SESSION_ID = randomUUID();

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

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayModeActive = false;
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

const ALLOWED_AUTOMATION_HOSTS = new Set(getKnownPJeHosts());
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
        if (!isAllowedAutomationHost(parsed.hostname)) return null;
        return parsed.toString();
    } catch (_error) {
        return null;
    }
}

function isAllowedAutomationHost(hostname: string): boolean {
    const host = String(hostname || '').toLowerCase().trim();
    if (!host) return false;
    if (ALLOWED_AUTOMATION_HOSTS.has(host)) return true;
    if (!host.endsWith('.jus.br')) return false;
    return host.includes('pje');
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

/**
 * Sincroniza o provider ativo no runtime (ai-handler + env vars).
 */
async function syncProvider(providerId: ProviderId, apiKey: string, agentModel?: string, visionModel?: string): Promise<void> {
    const preset = PROVIDER_PRESETS[providerId];
    const resolvedAgent = agentModel || preset.defaultAgentModel;
    const resolvedVision = visionModel || preset.defaultVisionModel;

    const config = {
        providerId,
        apiKey,
        agentModel: resolvedAgent,
        visionModel: resolvedVision,
    };
    const { initAI } = await import('./ai-handler');
    initAI(config);

    // Sincroniza config com o backend (se conectado)
    syncConfigToBackend(config);
}

/**
 * Carrega chave do store para um provider.
 * Se o valor estiver em plaintext legado, migra para criptografado imediatamente.
 */
function loadApiKey(providerId: ProviderId): string {
    if (!store) return '';
    const apiKeys = (store.get('apiKeys', {}) as Record<string, string>);
    const raw = String(apiKeys[providerId] || '').trim();
    if (!raw) return '';
    if (!isEncrypted(raw)) {
        // Chave legada em plaintext — criptografa e persiste agora
        saveApiKey(providerId, raw);
        return raw;
    }
    return safeDecrypt(raw);
}

/**
 * Persiste chave encriptada no store para um provider.
 */
function saveApiKey(providerId: ProviderId, key: string): void {
    if (!store) return;
    const apiKeys = (store.get('apiKeys', {}) as Record<string, string>);
    apiKeys[providerId] = key ? encryptApiKey(key) : '';
    store.set('apiKeys', apiKeys);
}

async function initStore() {
    // @ts-ignore
    const { default: Store } = await import('electron-store');
    store = new Store();

    // ── Migração legada: anthropicKey → apiKeys.anthropic ──
    const legacyRaw = String(store.get('anthropicKey', '') || '').trim();
    if (legacyRaw) {
        const legacyKey = safeDecrypt(legacyRaw);
        if (legacyKey) {
            saveApiKey('anthropic', legacyKey);
            store.delete('anthropicKey');
        }
    }

    // ── Carrega config do provider ──
    const savedProvider = store.get('aiProvider', null) as {
        providerId: ProviderId;
        agentModel: string;
        visionModel: string;
    } | null;

    const providerId: ProviderId = savedProvider?.providerId ?? 'anthropic';
    const apiKey = loadApiKey(providerId);
    const preset = PROVIDER_PRESETS[providerId];

    // Migra visionModel: Claude 4.x pode causar problemas em browser automation
    // agentModel não é migrado — Claude 4.x funciona fine com generateText no SDK principal
    const LEGACY_VISION_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'];
    const savedVision = savedProvider?.visionModel ?? preset.defaultVisionModel;
    const visionModel = (providerId === 'anthropic' && LEGACY_VISION_MODELS.includes(savedVision))
        ? preset.defaultVisionModel : savedVision;

    await syncProvider(providerId, apiKey, savedProvider?.agentModel ?? preset.defaultAgentModel, visionModel);
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC — Configuração de Provider/API Keys
// ─────────────────────────────────────────────────────────────────────────────

/** Define provider ativo + modelos. Re-inicia browser em background. */
ipcMain.handle('store-set-provider', async (_event, cfg: { providerId: ProviderId; agentModel: string; visionModel: string }) => {
    if (!store) return { error: 'Store not initialized' };
    store.set('aiProvider', cfg);
    const apiKey = loadApiKey(cfg.providerId);
    await syncProvider(cfg.providerId, apiKey, cfg.agentModel, cfg.visionModel);
    reInitBrowser().catch(e => console.error('[Browser] Erro ao re-inicializar após troca de provider:', e));
    return { success: true };
});

/** Retorna provider ativo + status da chave. A apiKey nunca é enviada ao renderer. */
ipcMain.handle('store-get-provider', async () => {
    const cfg = getActiveConfig();
    const hasKey = cfg.apiKey.length > 0;
    const { apiKey: _omit, ...safe } = cfg;
    return { ...safe, hasKey };
});

/** Salva chave API para um provider. */
ipcMain.handle('store-set-api-key', async (_event, { providerId, key }: { providerId: ProviderId; key: string }) => {
    if (!store) return { error: 'Store not initialized' };
    const normalizedKey = String(key || '').trim();
    saveApiKey(providerId, normalizedKey);

    // Se é o provider ativo, re-sincroniza imediatamente
    const current = getActiveConfig();
    if (current.providerId === providerId) {
        await syncProvider(providerId, normalizedKey, current.agentModel, current.visionModel);
        reInitBrowser().catch(e => console.error('[Browser] Erro ao re-inicializar após nova chave:', e));
    }
    return { success: true, configured: normalizedKey.length > 0 };
});

/** Retorna status da chave para um provider. */
ipcMain.handle('store-get-api-key-status', async (_event, providerId: ProviderId) => {
    const key = loadApiKey(providerId);
    return {
        configured: key.length > 0,
        preview: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : '',
    };
});

/** Retorna catálogo de providers/modelos para a UI de configurações. */
ipcMain.handle('store-get-provider-presets', () => {
    return PROVIDER_PRESETS;
});

// ── Privacy / Consent ──────────────────────────────────────────────────────

ipcMain.handle('privacy-get-config', () => {
    return getConsentConfig();
});

ipcMain.handle('privacy-set-level', (_event, level: 0 | 1 | 2 | 3) => {
    setDefaultLevel(level);
    return { success: true };
});

ipcMain.handle('privacy-set-provider-consent', (_event, { providerId, level, consented }: { providerId: string; level: 0 | 1 | 2 | 3; consented: boolean }) => {
    setProviderConsent(providerId, level, consented);
    return { success: true };
});

ipcMain.handle('privacy-complete-onboarding', (_event, level: 0 | 1 | 2 | 3) => {
    completeOnboarding(level);
    return { success: true };
});

ipcMain.handle('privacy-is-onboarding-completed', () => {
    return isOnboardingCompleted();
});

ipcMain.handle('privacy-revoke-all', () => {
    revokeAllConsent();
    return { success: true };
});

ipcMain.handle('privacy-get-effective-level', (_event, providerId?: string) => {
    return getEffectiveLevel(providerId);
});

ipcMain.handle('privacy-get-audit-summary', (_event, days?: number) => {
    return getAuditSummary(days ?? 7);
});

// ── Ollama (Modelo Local) ──────────────────────────────────────────────────

ipcMain.handle('ollama-status', async () => {
    try {
        return await getOllamaStatus();
    } catch (e: any) {
        console.error('[IPC] ollama-status error:', e.message);
        return { running: false, models: [], error: e.message };
    }
});

ipcMain.handle('ollama-list-models', async () => {
    try {
        return await ollamaListModels();
    } catch (e: any) {
        console.error('[IPC] ollama-list-models error:', e.message);
        return [];
    }
});

ipcMain.handle('ollama-recommended', async () => {
    try {
        return await getRecommendedModelsWithStatus();
    } catch (e: any) {
        console.error('[IPC] ollama-recommended error:', e.message);
        return [];
    }
});

ipcMain.handle('ollama-pull', async (_event, modelName: string) => {
    // Forward de progresso para o renderer
    const onProgress = (data: any) => {
        if (mainWindow) mainWindow.webContents.send('ollama-pull-progress', data);
    };
    const onComplete = (data: any) => {
        if (mainWindow) mainWindow.webContents.send('ollama-pull-complete', data);
        ollamaEmitter.off('pull-progress', onProgress);
        ollamaEmitter.off('pull-complete', onComplete);
        ollamaEmitter.off('pull-error', onError);
    };
    const onError = (data: any) => {
        if (mainWindow) mainWindow.webContents.send('ollama-pull-error', data);
        ollamaEmitter.off('pull-progress', onProgress);
        ollamaEmitter.off('pull-complete', onComplete);
        ollamaEmitter.off('pull-error', onError);
    };

    ollamaEmitter.on('pull-progress', onProgress);
    ollamaEmitter.on('pull-complete', onComplete);
    ollamaEmitter.on('pull-error', onError);

    return pullModel(modelName);
});

ipcMain.handle('ollama-delete', async (_event, modelName: string) => {
    return deleteModel(modelName);
});

ipcMain.handle('ollama-get-recommended-list', () => {
    return RECOMMENDED_MODELS;
});

ipcMain.handle('ollama-is-running', async () => {
    try {
        return await isOllamaRunning();
    } catch {
        return false;
    }
});

ipcMain.handle('ollama-download-installer', async () => {
    const url = process.platform === 'darwin'
        ? 'https://ollama.com/download/Ollama-darwin.zip'
        : 'https://ollama.com/download/OllamaSetup.exe';
    const fileName = process.platform === 'darwin' ? 'Ollama-darwin.zip' : 'OllamaSetup.exe';
    const destPath = path.join(app.getPath('temp'), fileName);

    try {
        // Notifica progresso
        if (mainWindow) mainWindow.webContents.send('ollama-install-progress', { status: 'downloading', percent: 0 });

        const res = await fetch(url);
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const total = Number(res.headers.get('content-length') || 0);
        let downloaded = 0;
        const chunks: Buffer[] = [];
        const reader = res.body.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
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

        if (mainWindow) mainWindow.webContents.send('ollama-install-progress', { status: 'opening', percent: 100 });

        // Abre o installer para o usuário
        await shell.openPath(destPath);

        return { success: true, path: destPath };
    } catch (e: any) {
        console.error('[Ollama] Erro ao baixar installer:', e.message);
        if (mainWindow) mainWindow.webContents.send('ollama-install-progress', { status: 'error', error: e.message });
        return { success: false, error: e.message };
    }
});

// ── Aliases legados (retrocompat com código antigo) ──
ipcMain.handle('store-set-anthropic-key', async (_event, key: string) => {
    if (!store) return { error: 'Store not initialized' };
    const normalizedKey = String(key || '').trim();
    saveApiKey('anthropic', normalizedKey);
    const current = getActiveConfig();
    if (current.providerId === 'anthropic') {
        await syncProvider('anthropic', normalizedKey, current.agentModel, current.visionModel);
    }
    return { success: true, configured: normalizedKey.length > 0 };
});

ipcMain.handle('store-get-anthropic-key-status', async () => {
    const key = loadApiKey('anthropic');
    return {
        configured: key.length > 0,
        preview: key ? `${key.slice(0, 7)}...${key.slice(-4)}` : '',
    };
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
                } catch (e) {
                    console.warn('[Validation] JSON parse failed after basic cleanup. Falling back to raw response', e);
                    throw e; // goes to outer catch
                }

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

function createTray() {
    // Tenta ícone da build, cai para empty se não existir
    const candidates = [
        path.join(__dirname, '../build-assets/icon.ico'),
        path.join(__dirname, '../build-assets/icon.png'),
        path.join(process.cwd(), 'build-assets/icon.ico'),
        path.join(process.cwd(), 'build-assets/icon.png'),
    ];
    const iconPath = candidates.find(p => fs.existsSync(p));
    const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

    tray = new Tray(icon);
    tray.setToolTip('LEX — Assistente Jurídico (24/7)');
    refreshTrayMenu();

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        } else {
            createWindow();
        }
    });
}

function refreshTrayMenu() {
    if (!tray) return;
    const botRunning = isBotRunning();
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Abrir LEX',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                } else {
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
                app.quit();
            }
        }
    ]);
    tray.setContextMenu(contextMenu);
}

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

    // Note: We REMOVED the default injection on mainWindow, because it loads Dashboard.
}

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

        // Re-indexa RAG em background após salvar documento
        const wsRoots = getWorkspaceRoots();
        if (wsRoots.length > 0) {
            getDocIndex().indexarWorkspace(wsRoots).catch(e =>
                console.warn('[files-save-document] RAG re-index falhou:', e.message)
            );
        }

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

}

import { registerCrawlerHandlers } from './crawler';

// ... (existing code)

app.whenReady().then(async () => {
    // Configura userDataDir para módulos desacoplados do Electron
    const userData = app.getPath('userData');
    setUserDataDir(userData);
    initMemoryDir(userData);
    // Inicializa salt de criptografia antes de qualquer encrypt/decrypt
    initCryptoStoreSalt(userData);
    // Inicializa módulos de privacidade
    initConsentManager(userData);
    initAuditLog(userData);
    // Inicializa índice RAG (carrega índice persistido do disco)
    getDocIndex().init(userData);
    await initStore();
    initSupabase(store);
    createWindow();
    registerCrawlerHandlers();

    initRouteMemory(userData);

    // Inicia backend Node.js separado (agent + browser + skills)
    try {
        await startBackend(userData);
        // Forward de eventos do backend → renderer
        backendEvents.on('agent-event', (event: any) => {
            console.log('[Agent Event via Backend]', event.type);
            if (mainWindow) {
                mainWindow.webContents.send('agent-event', event);
            }
        });
        // Sincroniza config de provider/API key com o backend (já foi carregada no initStore)
        const cfg = getActiveConfig();
        await syncConfigToBackend(cfg);
        console.log('[Main] Backend conectado e config sincronizada');
    } catch (err: any) {
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

    // Sync de legislação em background (não bloqueia boot)
    initLegislacaoSync();

    // Inicia watchers nos workspaces para auto re-indexar RAG
    startWorkspaceWatchers();

    // Analytics — rastreia sessão e tempo ativo
    const analytics = getAnalytics();
    analytics.syncConversationCount(store);
    analytics.startSession();

    // Track focus/blur para tempo ativo
    if (mainWindow) {
        mainWindow.on('focus', () => analytics.trackFocus());
        mainWindow.on('blur', () => analytics.trackBlur());
    }

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

function initAutoUpdater() {
    // Em dev não verifica atualizações
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', () => {
        mainWindow?.webContents.send('update-available');
    });

    autoUpdater.on('update-downloaded', () => {
        mainWindow?.webContents.send('update-downloaded');
    });

    autoUpdater.on('error', (err) => {
        console.error('[Updater]', err.message);
    });

    autoUpdater.checkForUpdates().catch(() => {});
}

const LEGISLACAO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Inicia o ciclo automático de sync de legislação:
 *  - 15s após boot: baixa o que falta / está desatualizado
 *  - A cada 24h: re-verifica e atualiza
 */
function initLegislacaoSync(): void {
    async function runSync(label: string) {
        const userDataDir = app.getPath('userData');
        const pendentes = verificarDesatualizados(userDataDir);
        if (pendentes.length === 0) {
            console.log(`[Legislação] ${label} — tudo em dia`);
            return;
        }
        console.log(`[Legislação] ${label} — ${pendentes.length} arquivo(s) para atualizar`);
        mainWindow?.webContents.send('rag-legislacao-progress', `Atualizando legislação (${pendentes.length} arquivo(s))…`);

        const result = await downloadIncremental(userDataDir, (msg: string) => {
            console.log('[Legislação]', msg);
            mainWindow?.webContents.send('rag-legislacao-progress', msg);
        });

        if (result.sucesso > 0) {
            // Garante que a pasta está nos workspaces e re-indexa
            const legDir = result.dir;
            const workspaces = store.get('workspaces', []) as string[];
            if (!workspaces.includes(legDir)) {
                workspaces.push(legDir);
                store.set('workspaces', workspaces);
            }
            await getDocIndex().indexarWorkspace([legDir, ...workspaces.filter(w => w !== legDir)]);
            console.log(`[Legislação] ${result.sucesso} arquivo(s) atualizados e re-indexados`);
        }
    }

    // Boot: aguarda 15s para não competir com a inicialização da janela
    setTimeout(() => runSync('boot').catch(e => console.error('[Legislação] Erro no boot sync:', e)), 15_000);

    // Verificação diária
    setInterval(() => runSync('daily').catch(e => console.error('[Legislação] Erro no daily sync:', e)), LEGISLACAO_CHECK_INTERVAL_MS);
}

app.on('window-all-closed', async function () {
    // Finaliza sessão de analytics
    getAnalytics().endSession();

    // Flush audit log de privacidade
    await flushAuditLog();

    // No modo 24/7 com tray ativo, não encerra o processo
    if (trayModeActive) return;

    // Encerra backend (flush + close browser + sessions)
    await stopBackend();

    // Fallback local caso backend não estivesse rodando
    flushRouteMemory();
    await closeBrowser();
    try {
        if (agentModule) {
            const sm = agentModule.getSessionManager();
            if (sm?.flush) await sm.flush();
        }
    } catch (e) { /* non-critical */ }
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

// ============================================================================
// CONVERSATIONS (multi-session persistence)
// ============================================================================

ipcMain.handle('conversations-list', async () => {
    const convs = (store?.get('conversations', {}) as Record<string, any>) || {};
    return Object.values(convs)
        .map((c: any) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages?.length || 0 }))
        .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
        .slice(0, 50);
});

ipcMain.handle('conversations-save', async (_event, conv) => {
    const MAX_CONV_SIZE = 2_000_000; // 2 MB por conversa
    if (!conv || typeof conv.id !== 'string') return { success: false, error: 'Conversa inválida.' };
    if (JSON.stringify(conv).length > MAX_CONV_SIZE) return { success: false, error: 'Conversa muito grande para salvar (limite 2 MB).' };
    const convs = (store?.get('conversations', {}) as Record<string, any>) || {};
    const isNew = !convs[conv.id];
    convs[conv.id] = conv;
    store?.set('conversations', convs);
    if (isNew) getAnalytics().trackConversation();
    return { success: true };
});

ipcMain.handle('conversations-load', async (_event, id: string) => {
    const convs = (store?.get('conversations', {}) as Record<string, any>) || {};
    return convs[id] || null;
});

ipcMain.handle('conversations-delete', async (_event, id: string) => {
    const convs = (store?.get('conversations', {}) as Record<string, any>) || {};
    delete convs[id];
    store?.set('conversations', convs);
    return { success: true };
});

// Pre-seed agent session with saved messages (for context on conversation reload)
ipcMain.handle('session-seed', async (_event, sessionId: string, messages: any[]) => {
    if (typeof sessionId !== 'string' || !sessionId) return { success: false, error: 'sessionId inválido.' };
    if (!Array.isArray(messages)) return { success: false, error: 'messages inválido.' };
    const agent = await loadAgentModule();
    const sm = agent.getSessionManager();
    sm.getOrCreate(sessionId);
    for (const msg of messages.slice(-8)) {
        const role: 'user' | 'assistant' = msg.role === 'user' ? 'user' : 'assistant';
        sm.addMessage(sessionId, role, msg.content);
    }
    return { success: true };
});

// ============================================================================
// ANALYTICS
// ============================================================================

ipcMain.handle('analytics-summary', async () => {
    return getAnalytics().getSummary();
});

ipcMain.handle('analytics-track-message', async () => {
    getAnalytics().trackMessage();
    return { success: true };
});

ipcMain.handle('save-preferences', async (_event, prefs) => {
    if (store) store.set('userPreferences', prefs);
    return { success: true };
});

ipcMain.handle('get-preferences', async () => {
    return store ? store.get('userPreferences', {}) : {};
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
    startWorkspaceWatchers(); // Reinicia watchers com novo workspace
    return { success: true, workspaces };
});

ipcMain.handle('workspace-remove', async (_event, path) => {
    if (!store) return { success: false };
    const selectedPath = normalizeFsPath(path);
    let workspaces = store.get('workspaces', []) as string[];
    workspaces = workspaces.filter(w => normalizeFsPath(w) !== selectedPath);
    store.set('workspaces', workspaces);
    startWorkspaceWatchers(); // Reinicia watchers sem workspace removido
    return { success: true, workspaces };
});

/** Re-indexa todos os documentos dos workspaces para o RAG. */
ipcMain.handle('rag-index-workspace', async () => {
    const workspaces = getWorkspaceRoots();
    if (workspaces.length === 0) return { success: false, error: 'Nenhum workspace configurado.' };
    const result = await getDocIndex().indexarWorkspace(workspaces);
    return { success: true, ...result };
});

/** Retorna estatísticas do índice RAG atual. */
ipcMain.handle('rag-stats', async () => {
    return getDocIndex().getStats();
});

// ============================================================================
// FILE WATCHER — auto re-indexa RAG quando arquivos mudam nos workspaces
// ============================================================================
const activeWatchers: fs.FSWatcher[] = [];
let ragReindexTimer: ReturnType<typeof setTimeout> | null = null;
const RAG_DEBOUNCE_MS = 5000; // 5s debounce para agrupar mudanças rápidas

function scheduleRagReindex() {
    if (ragReindexTimer) clearTimeout(ragReindexTimer);
    ragReindexTimer = setTimeout(async () => {
        ragReindexTimer = null;
        const ws = getWorkspaceRoots();
        if (ws.length === 0) return;
        try {
            const result = await getDocIndex().indexarWorkspace(ws);
            console.log(`[FileWatcher] RAG re-indexado: ${result.chunks} chunks, ${result.arquivos} arquivos`);
        } catch (e: any) {
            console.warn('[FileWatcher] RAG re-index falhou:', e.message);
        }
    }, RAG_DEBOUNCE_MS);
}

const WATCHED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.docx', '.doc']);

function startWorkspaceWatchers() {
    // Limpa watchers anteriores
    for (const w of activeWatchers) { try { w.close(); } catch {} }
    activeWatchers.length = 0;

    const workspaces = getWorkspaceRoots();
    for (const wsPath of workspaces) {
        try {
            const watcher = fs.watch(wsPath, { recursive: true }, (_event, filename) => {
                if (!filename) return;
                const ext = path.extname(filename).toLowerCase();
                if (WATCHED_EXTENSIONS.has(ext)) {
                    console.log(`[FileWatcher] Mudança detectada: ${filename}`);
                    scheduleRagReindex();
                }
            });
            activeWatchers.push(watcher);
        } catch (e: any) {
            console.warn(`[FileWatcher] Não foi possível monitorar ${wsPath}:`, e.message);
        }
    }
    if (activeWatchers.length > 0) {
        console.log(`[FileWatcher] Monitorando ${activeWatchers.length} workspace(s)`);
    }
}


/** Baixa os códigos de legislação do Planalto e re-indexa o RAG. */
ipcMain.handle('rag-download-legislacao', async (_e, forcar = false) => {
    const userDataDir = app.getPath('userData');
    const fn = forcar ? downloadTudo : downloadIncremental;

    const result = await fn(userDataDir, (msg: string) => {
        mainWindow?.webContents.send('rag-legislacao-progress', msg);
    });

    // Garante que a pasta de legislação está nos workspaces
    const legDir = result.dir;
    const workspaces = store.get('workspaces', []) as string[];
    if (!workspaces.includes(legDir)) {
        workspaces.push(legDir);
        store.set('workspaces', workspaces);
    }

    const indexResult = await getDocIndex().indexarWorkspace(
        [legDir, ...workspaces.filter(w => w !== legDir)]
    );

    return { ...result, indexResult };
});

/** Retorna estatísticas dos arquivos de legislação já baixados. */
ipcMain.handle('rag-legislacao-stats', async () => {
    return getLegislacaoStats(app.getPath('userData'));
});

// Check PJe status via browser
ipcMain.handle('check-pje', async () => {
    try {
        const page = getActivePage();
        const url = page?.url() ?? null;
        const isPje = typeof url === 'string' && url.includes('pje.');
        return { connected: !!url, isPje, url };
    } catch {
        return { connected: false, isPje: false, url: null };
    }
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
        // Injeta dialog nativo do Electron para confirmação de ações perigosas
        const { setConfirmDialog } = await import('./skills/os/sistema');
        setConfirmDialog(async (titulo: string, detalhe: string) => {
            const { response } = await dialog.showMessageBox({
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

function normalizeIntentText(raw: string): string {
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
function injectDisambiguationIfNeeded(objetivo: string): string {
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

type ModeRouteDecision = {
    useAgent: boolean;
    reason: string;
    source: 'heuristic' | 'semantic' | 'fallback';
    confidence?: number;
};

type HeuristicModeResult = {
    decided: boolean;
    useAgent: boolean;
    reason: string;
};

function heuristicRouteForObjective(
    objetivoRaw: string,
    activeUrl?: string | null
): HeuristicModeResult {
    const objetivo = normalizeIntentText(objetivoRaw);
    const isPJeActive = Boolean(activeUrl && /pje\./i.test(activeUrl));
    if (!objetivo) return { decided: true, useAgent: false, reason: 'objetivo_vazio' };

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

function parseSemanticModeResponse(raw: string): ModeRouteDecision | null {
    const text = String(raw || '').trim();
    if (!text) return null;

    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i)
        || text.match(/```\s*([\s\S]*?)\s*```/i);
    const candidate = (fenced && fenced[1])
        ? fenced[1].trim()
        : (text.includes('{') && text.includes('}') ? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1) : text);

    try {
        const parsed = JSON.parse(candidate) as any;
        const mode = String(parsed?.mode || '').toLowerCase();
        const confidenceRaw = Number(parsed?.confidence);
        const confidence = Number.isFinite(confidenceRaw)
            ? Math.max(0, Math.min(1, confidenceRaw))
            : undefined;
        const reason = String(parsed?.reason || 'semantic_router').trim();

        if (mode === 'agent') {
            return { useAgent: true, reason, source: 'semantic', ...(confidence !== undefined ? { confidence } : {}) };
        }
        if (mode === 'chat') {
            return { useAgent: false, reason, source: 'semantic', ...(confidence !== undefined ? { confidence } : {}) };
        }
        return null;
    } catch {
        return null;
    }
}

async function semanticRouteForObjective(
    objetivoRaw: string,
    activeUrl?: string | null
): Promise<ModeRouteDecision | null> {
    const objective = String(objetivoRaw || '').trim();
    if (!objective) return null;

    try {
        const { callAI } = await import('./ai-handler');
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

        const response = await callAI({
            system,
            user,
            temperature: 0,
            maxTokens: 140,
            // Usa o agentModel do provider ativo (não hardcodar modelo específico)
        });

        return parseSemanticModeResponse(response);
    } catch (error: any) {
        console.warn('[Router] Semantic routing failed:', error?.message || error);
        return null;
    }
}

async function shouldUseAgentLoopForObjective(
    objetivoRaw: string,
    activeUrl?: string | null
): Promise<ModeRouteDecision> {
    const heuristic = heuristicRouteForObjective(objetivoRaw, activeUrl);
    if (heuristic.decided) {
        return {
            useAgent: heuristic.useAgent,
            reason: heuristic.reason,
            source: 'heuristic'
        };
    }

    const semantic = await semanticRouteForObjective(objetivoRaw, activeUrl);
    if (semantic) {
        return semantic;
    }

    return {
        useAgent: false,
        reason: 'fallback_chat',
        source: 'fallback'
    };
}

ipcMain.handle('agent-should-handle', async (_event, objetivo: string) => {
    let activeUrl: string | null = null;
    try { activeUrl = getActivePage()?.url() ?? null; } catch {}
    return await shouldUseAgentLoopForObjective(objetivo, activeUrl);
});

// ============================================================================
// TELEGRAM BOT (Modo 24/7)
// ============================================================================

import { startBot, stopBot, isBotRunning, sendMessage as telegramSend } from './telegram-bot';
import { setNotifyFn } from './user-input';

function loadTelegramToken(): string {
    if (!store) return '';
    const raw = String(store.get('telegramToken', '') || '').trim();
    if (!raw) return '';
    if (!isEncrypted(raw)) {
        // Token legado em plaintext — migra para criptografado imediatamente
        store.set('telegramToken', encryptApiKey(raw));
        return raw;
    }
    return safeDecrypt(raw);
}

async function initTelegramBotIfConfigured(): Promise<void> {
    if (!store) return;
    const enabled = store.get('telegramEnabled', false) as boolean;
    if (!enabled) return;

    const token = loadTelegramToken();
    const userId = store.get('telegramUserId', 0) as number;
    if (!token || !userId) return;

    try {
        await startBot({ token, authorizedUserId: userId }, runAgentForTelegram);
        setNotifyFn((prompt) => telegramSend(userId, prompt));
        trayModeActive = true;
        if (!tray) createTray();
        console.log('[Telegram] Bot iniciado automaticamente (modo 24/7 ativo)');
    } catch (e: any) {
        console.error('[Telegram] Falha ao iniciar bot:', e.message);
    }
}

async function runAgentForTelegram(text: string, sessionId: string): Promise<string> {
    const agent = await ensureAgentInitialized();
    const tenantConfig = agent.getDefaultTenantConfig();
    const objetivoFinal = injectDisambiguationIfNeeded(text);
    return await agent.runAgentLoop(
        objetivoFinal,
        { maxIterations: 8, timeoutMs: 120000 },
        tenantConfig,
        sessionId
    );
}

/** Retorna config do Telegram (sem o token completo) */
ipcMain.handle('telegram-get-config', () => {
    if (!store) return { enabled: false, hasToken: false, userId: 0 };
    const token = loadTelegramToken();
    const userId = store.get('telegramUserId', 0) as number;
    const enabled = store.get('telegramEnabled', false) as boolean;
    return {
        enabled,
        hasToken: token.length > 0,
        tokenPreview: token ? `${token.slice(0, 8)}...${token.slice(-4)}` : '',
        userId,
        running: isBotRunning()
    };
});

/** Salva token + userId do Telegram */
ipcMain.handle('telegram-set-config', async (_event, { token, userId }: { token: string; userId: number }) => {
    if (!store) return { error: 'Store não inicializado' };
    const normalizedToken = String(token || '').trim();
    const normalizedUserId = Number(userId) || 0;
    store.set('telegramToken', normalizedToken ? encryptApiKey(normalizedToken) : '');
    store.set('telegramUserId', normalizedUserId);
    return { success: true };
});

/** Ativa o modo 24/7 (liga o bot + tray) */
ipcMain.handle('telegram-enable', async () => {
    if (!store) return { error: 'Store não inicializado' };
    const token = loadTelegramToken();
    const userId = store.get('telegramUserId', 0) as number;

    if (!token || !userId) {
        return { error: 'Configure o token e o ID do usuário antes de ativar.' };
    }

    try {
        await startBot({ token, authorizedUserId: userId }, runAgentForTelegram);
        setNotifyFn((prompt) => telegramSend(userId, prompt));
        store.set('telegramEnabled', true);
        refreshTrayMenu();
        return { success: true, running: true };
    } catch (e: any) {
        return { error: `Falha ao iniciar bot: ${e.message}` };
    }
});

/** Desativa o modo 24/7 (desliga o bot + remove comportamento de tray) */
ipcMain.handle('telegram-disable', async () => {
    await stopBot();
    if (store) store.set('telegramEnabled', false);
    refreshTrayMenu();
    return { success: true, running: false };
});

/** Retorna status em tempo real */
ipcMain.handle('telegram-get-status', () => ({
    running: isBotRunning(),
    trayActive: trayModeActive
}));

// IPC: Run Agent Loop — proxy para backend (com fallback local)
ipcMain.handle('agent-run', async (_event, objetivo: string, config?: any, sessionId?: string) => {
    // Verificar licença antes de executar
    const license = await checkLicense();
    if (license.status === 'not_authenticated') {
        return { success: false, error: 'not_authenticated' };
    }
    if (license.status === 'trial_expired') {
        return { success: false, error: 'trial_expired' };
    }

    const objetivoFinal = injectDisambiguationIfNeeded(objetivo);
    const maxIter = Math.min(Math.max(Number(config?.maxIterations) || 5, 1), 10);
    const timeoutMs = Math.min(Math.max(Number(config?.timeoutMs) || 60000, 10000), 120000);

    // Tenta via backend (processo separado)
    if (isBackendAlive()) {
        try {
            const resposta = await rpcCall('agent-run', {
                objetivo: objetivoFinal,
                config: { maxIterations: maxIter, timeoutMs },
                sessionId: sessionId || AGENT_SESSION_ID,
            });
            return { success: true, resposta };
        } catch (error: any) {
            console.error('[Agent via Backend] Erro:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Fallback: executa localmente (compatibilidade)
    try {
        const agent = await ensureAgentInitialized();
        const tenantConfig = agent.getDefaultTenantConfig();
        const resposta = await agent.runAgentLoop(objetivoFinal, {
            maxIterations: maxIter,
            timeoutMs
        }, tenantConfig, sessionId || AGENT_SESSION_ID);
        return { success: true, resposta };
    } catch (error: any) {
        console.error('[Agent Local] Erro:', error);
        return { success: false, error: error.message };
    }
});

// IPC: Cancel Agent Loop — proxy para backend (com fallback local)
ipcMain.handle('agent-cancel', async () => {
    if (isBackendAlive()) {
        try {
            await rpcCall('agent-cancel');
            return { success: true };
        } catch { /* fallback */ }
    }
    const agent = await loadAgentModule();
    agent.cancelAgentLoop();
    return { success: true };
});

// ============================================================================
// IPC: Auth / Licença
// ============================================================================

ipcMain.handle('auth-sign-in', async (_event, { email, password }: { email: string; password: string }) => {
    return authSignIn(email, password);
});

ipcMain.handle('auth-sign-up', async (_event, { email, password }: { email: string; password: string }) => {
    return authSignUp(email, password);
});

ipcMain.handle('auth-sign-out', async () => {
    await authSignOut();
    return { ok: true };
});

ipcMain.handle('auth-check-license', async () => {
    return checkLicense();
});

ipcMain.handle('auth-refresh-license', async () => {
    refreshLicense();
    return checkLicense();
});

ipcMain.handle('update-install-now', () => {
    autoUpdater.quitAndInstall();
});

// Setup event forwarding after window is created
// We'll call this in createWindow
