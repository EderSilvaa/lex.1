/**
 * Lex Backend Server
 *
 * Processo Node.js standalone que roda toda a lógica de agente + browser.
 * Comunica com o Electron main via WebSocket RPC.
 *
 * Protocolo:
 *   Request:  { id: string, method: string, params?: any }
 *   Response: { id: string, result?: any, error?: string }
 *   Event:    { event: string, data: any }  (streaming, sem id)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { setUserDataDir, getActivePage, ensureBrowser } from '../browser-manager';
import { initMemoryDir, getMemory } from '../agent/memory';
import { initRouteMemory, flush as flushRouteMemory } from '../pje/route-memory';
import { initCheckpointStore } from '../agent/checkpoint-store';
import { initSessionManager } from '../agent/session';
import { setActiveConfig, getActiveConfig, type ActiveProviderConfig } from '../provider-config';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import { initPythonEnv, ensurePythonEnvSetup, getPythonEnv } from '../python';
import { randomUUID } from 'crypto';

// ── Config via env vars (passadas pelo Electron main ao spawnar) ──
const PORT = parseInt(process.env['LEX_BACKEND_PORT'] || '19876', 10);
const USER_DATA_DIR = process.env['LEX_USER_DATA'] || '';

if (!USER_DATA_DIR) {
    console.error('[Backend] LEX_USER_DATA não definido');
    process.exit(1);
}

// ── Inicializa módulos desacoplados ──
setUserDataDir(USER_DATA_DIR);
initMemoryDir(USER_DATA_DIR);
initRouteMemory(USER_DATA_DIR);
initCheckpointStore(USER_DATA_DIR);
initSessionManager(USER_DATA_DIR);

// MCP Manager: cria template e conecta servers declarados em ~/.lex/mcp.json.
// Best-effort — falhas individuais não travam o backend.
(async () => {
    try {
        const { getMcpManager } = await import('../mcp-manager');
        const mcp = getMcpManager();
        mcp.ensureConfigTemplate();
        if (mcp.hasServers()) await mcp.init();
    } catch (err: any) {
        console.warn(`[Backend] MCP init falhou: ${err?.message || String(err)}`);
    }
})();

// Brain (SQLite knowledge graph) — lazy init para não bloquear startup
let brainModule: typeof import('../brain') | null = null;
async function ensureBrain() {
    if (!brainModule) {
        brainModule = await import('../brain');
        brainModule.initBrain(USER_DATA_DIR);
        console.log('[Backend] Brain inicializado');
    }
    return brainModule;
}

console.log('[Backend] Módulos inicializados. userData:', USER_DATA_DIR);

// ── Kill processo anterior que pode estar segurando a porta ──
function killProcessOnPort(port: number): void {
    try {
        let pids: Set<number>;

        if (process.platform === 'win32') {
            const out = execSync(
                `netstat -ano | findstr "LISTENING" | findstr ":${port}"`,
                { encoding: 'utf8', timeout: 3000 }
            ).trim();
            pids = new Set(
                out.split(/\r?\n/).filter(Boolean).map(line => {
                    const parts = line.trim().split(/\s+/);
                    return parseInt(parts[parts.length - 1] ?? '', 10);
                }).filter(pid => pid && pid !== process.pid)
            );
            for (const pid of pids) {
                console.warn(`[Backend] Matando processo anterior na porta ${port}: PID ${pid}`);
                try { execSync(`taskkill /F /PID ${pid}`, { timeout: 3000 }); } catch { /* ignore */ }
            }
        } else {
            // Mac / Linux: lsof -ti
            const out = execSync(
                `lsof -ti tcp:${port}`,
                { encoding: 'utf8', timeout: 3000 }
            ).trim();
            pids = new Set(
                out.split(/\s+/).filter(Boolean).map(Number)
                   .filter(pid => pid && pid !== process.pid)
            );
            for (const pid of pids) {
                console.warn(`[Backend] Matando processo anterior na porta ${port}: PID ${pid}`);
                try { execSync(`kill -9 ${pid}`, { timeout: 3000 }); } catch { /* ignore */ }
            }
        }

        if (pids.size > 0) {
            const waitUntil = Date.now() + 2000;
            while (Date.now() < waitUntil) { /* busy wait */ }
        }
    } catch {
        // porta provavelmente livre
    }
}

killProcessOnPort(PORT);

// ── Python + BrowserUse bootstrap (backend também precisa disso) ──
let pythonBootstrapPromise: Promise<void> | null = null;

async function bootstrapPythonForBrowserUse(): Promise<void> {
    if (pythonBootstrapPromise) return pythonBootstrapPromise;

    pythonBootstrapPromise = (async () => {
        try {
            initPythonEnv();
            await ensurePythonEnvSetup();
        } catch (err: any) {
            console.warn('[Backend] Setup Python falhou:', err?.message || err);
        }

        const pyEnv = getPythonEnv();
        if (!pyEnv.isReady()) {
            console.warn('[Backend] Python indisponível — BrowserUse ficará em fallback.');
            return;
        }

        try {
            const { ensureBrowserUseInstalled } = await import('../browser/browser-use-setup');
            const ok = await ensureBrowserUseInstalled();
            console.log(ok
                ? '[Backend] BrowserUse pronto no backend.'
                : '[Backend] BrowserUse indisponível no backend (fallback ativo).'
            );
        } catch (err: any) {
            console.warn('[Backend] Falha ao preparar BrowserUse:', err?.message || err);
        }
    })();

    return pythonBootstrapPromise;
}

// Warm-up em background para reduzir fallback na primeira chamada do agente
void bootstrapPythonForBrowserUse();

// ── Agent module (lazy load) ──
let agentModule: any = null;
let agentInitialized = false;

// Orquestrador ativo (para cancel)
let _activeOrchestrator: any = null;

async function ensureAgent() {
    if (!agentModule) {
        agentModule = await import('../agent');
    }
    if (!agentInitialized) {
        await agentModule.initializeAgent();
        agentInitialized = true;
        console.log('[Backend] Agent inicializado');
    }
    return agentModule;
}

// ── WebSocket Server ──
const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });
const connectedClients = new Map<WebSocket, string>();
const runOwners = new Map<string, string>();
let _activeOrchestratorOwnerId: string | null = null;

// Handler de erro no WSS — previne crash por EADDRINUSE e outros erros de rede
wss.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`[Backend] WSS error: ${err.code || err.message}`);
    if (err.code === 'EADDRINUSE') {
        console.error(`[Backend] Porta ${PORT} em uso — encerrando processo`);
        process.exit(1);
    }
});

console.log(`[Backend] WebSocket server escutando em ws://127.0.0.1:${PORT}`);

function getClientId(ws: WebSocket): string {
    const existing = connectedClients.get(ws);
    if (existing) return existing;
    const created = randomUUID().slice(0, 8);
    connectedClients.set(ws, created);
    return created;
}

function sendEventToClient(ws: WebSocket, event: string, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event, data }));
    }
}

// Envia evento para todos os clients conectados (streaming)
function sendEvent(event: string, data: any): void {
    for (const ws of connectedClients.keys()) {
        sendEventToClient(ws, event, data);
    }
}

function releaseRunOwnerships(clientId: string): void {
    for (const [runId, ownerId] of runOwners) {
        if (ownerId === clientId) {
            runOwners.delete(runId);
        }
    }
    if (_activeOrchestratorOwnerId === clientId) {
        _activeOrchestratorOwnerId = null;
    }
}

function resolveOwnedRunId(
    activeRuns: Array<{ runId: string }>,
    clientId: string,
    requestedRunId?: string,
): string | null {
    const activeRunIds = activeRuns.map(r => r.runId);

    if (requestedRunId) {
        if (!activeRunIds.includes(requestedRunId)) return null;
        const ownerId = runOwners.get(requestedRunId);
        if (ownerId && ownerId !== clientId) {
            throw new Error('Este run está sendo controlado por outro cliente conectado.');
        }
        if (!ownerId) {
            runOwners.set(requestedRunId, clientId);
        }
        return requestedRunId;
    }

    const ownedRuns = activeRunIds.filter(runId => runOwners.get(runId) === clientId);
    if (ownedRuns.length === 1) return ownedRuns[0]!;
    if (ownedRuns.length > 1) {
        throw new Error('Mais de um run ativo para este cliente. Informe o runId.');
    }

    const unownedRuns = activeRunIds.filter(runId => !runOwners.has(runId));
    if (unownedRuns.length === 1) {
        const runId = unownedRuns[0]!;
        runOwners.set(runId, clientId);
        return runId;
    }

    if (activeRunIds.length === 1) {
        throw new Error('O run ativo pertence a outro cliente conectado.');
    }

    return null;
}

// Envia resposta RPC
function sendResponse(ws: WebSocket, id: string, result?: any, error?: string): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(error ? { id, error } : { id, result }));
    }
}

wss.on('connection', (ws) => {
    const clientId = getClientId(ws);
    console.log(`[Backend] Client conectado: ${clientId}`);

    ws.on('message', async (raw) => {
        let msg: { id: string; method: string; params?: any };
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            return;
        }

        const { id, method, params } = msg;

        try {
            const result = await handleRPC(ws, method, params ?? {});
            sendResponse(ws, id, result);
        } catch (err: any) {
            console.error(`[Backend] RPC error (${method}):`, err.message);
            sendResponse(ws, id, undefined, err.message);
        }
    });

    ws.on('close', () => {
        const disconnectedId = connectedClients.get(ws) || clientId;
        connectedClients.delete(ws);
        releaseRunOwnerships(disconnectedId);
        console.log(`[Backend] Client desconectado: ${disconnectedId}`);
    });

    ws.on('error', (err) => {
        console.error('[Backend] WS error:', err.message);
    });
});

// ── Forward agent events → WebSocket ──
let eventForwardingSetup = false;

async function setupEventForwarding(): Promise<void> {
    if (eventForwardingSetup) return;
    const agent = await ensureAgent();
    (agent.agentEmitter as EventEmitter).on('agent-event', (event: any) => {
        sendEvent('agent-event', event);
    });
    eventForwardingSetup = true;
}
function detectTribunalFromUrl(url: string | null): string | null {
    if (!url || !url.includes('pje.')) return null;
    const match = url.match(/pje\.([a-z0-9]+)\.jus\.br/i);
    return match?.[1] ? match[1].toUpperCase() : null;
}

async function buildPjeStatus(): Promise<{
    connected: boolean;
    isPje: boolean;
    url: string | null;
    tribunalAtivo: string | null;
    tribunalPreferido: string | null;
}> {
    try {
        const page = getActivePage();
        const url = page?.url() ?? null;
        const isPje = typeof url === 'string' && url.includes('pje.');
        const tribunalAtivo = isPje ? detectTribunalFromUrl(url) : null;

        const mem = getMemory();
        const [memoriaData, usuario] = await Promise.all([mem.carregar(), mem.getUsuario()]);
        const pref = memoriaData.preferencias?.['tribunal_preferido'] || usuario.tribunal_preferido || null;

        return { connected: !!url, isPje, url, tribunalAtivo, tribunalPreferido: pref };
    } catch {
        return { connected: false, isPje: false, url: null, tribunalAtivo: null, tribunalPreferido: null };
    }
}

// ── RPC Handlers ──
async function handleRPC(ws: WebSocket, method: string, params: any): Promise<any> {
    const clientId = getClientId(ws);
    switch (method) {
        // ── Agent ──
        case 'agent-run': {
            // Garante Python + browser-use também no processo backend.
            await bootstrapPythonForBrowserUse();
            const agent = await ensureAgent();
            await setupEventForwarding();
            const { objetivo, config, tenantConfig, sessionId } = params;

            // Goals compostos → Orchestrator (multi-agent paralelo)
            const { shouldUsePlanner } = await import('../agent/planner');
            if (shouldUsePlanner(objetivo)) {
                console.log('[Backend] Goal composto detectado — usando Orchestrator');
                const { Orchestrator } = await import('../agent/orchestrator');
                const orchestrator = new Orchestrator();
                _activeOrchestrator = orchestrator;
                _activeOrchestratorOwnerId = clientId;
                orchestrator.on('event', (evt: any) => {
                    sendEvent('agent-event', { type: 'orchestrator', data: evt });
                });
                try {
                    const result = await orchestrator.execute(objetivo, sessionId);
                    return result;
                } finally {
                    _activeOrchestrator = null;
                    _activeOrchestratorOwnerId = null;
                }
            }

            const runId = randomUUID();
            runOwners.set(runId, clientId);
            try {
                return await agent.runAgentLoop({
                    objetivo,
                    config: config ?? {},
                    tenantConfig: tenantConfig ?? agent.getDefaultTenantConfig(),
                    sessionId,
                    runId,
                });
            } finally {
                runOwners.delete(runId);
            }
        }

        case 'agent-cancel': {
            // Cancela orchestrator ativo (se houver) ou o agent loop
            if (_activeOrchestrator) {
                if (_activeOrchestratorOwnerId && _activeOrchestratorOwnerId !== clientId) {
                    throw new Error('A execução ativa pertence a outro cliente conectado.');
                }
                if (!_activeOrchestratorOwnerId) {
                    _activeOrchestratorOwnerId = clientId;
                }
                await _activeOrchestrator.cancel();
                _activeOrchestrator = null;
                _activeOrchestratorOwnerId = null;
                return { ok: true, kind: 'orchestrator' };
            }
            const agent = await ensureAgent();
            const runId = resolveOwnedRunId(agent.listActiveRuns(), clientId, params?.runId);
            if (!runId) return { ok: false, error: 'Nenhum run ativo encontrado.' };
            return { ok: agent.cancelAgentLoop(runId), runId, kind: 'agent' };
        }

        case 'orchestrator-cancel': {
            if (!_activeOrchestrator) return { success: false, error: 'Nenhuma execução ativa' };
            if (_activeOrchestratorOwnerId && _activeOrchestratorOwnerId !== clientId) {
                throw new Error('A execução ativa pertence a outro cliente conectado.');
            }
            if (!_activeOrchestratorOwnerId) {
                _activeOrchestratorOwnerId = clientId;
            }
            await _activeOrchestrator.cancel();
            _activeOrchestrator = null;
            _activeOrchestratorOwnerId = null;
            return { success: true };
        }

        case 'agent-respond': {
            const agent = await ensureAgent();
            const { runId, response } = params;
            if (!runId) {
                throw new Error('runId obrigatório para responder ao agente.');
            }
            const controlledRunId = resolveOwnedRunId(agent.listActiveRuns(), clientId, runId);
            if (!controlledRunId) {
                throw new Error(`Run não encontrado: ${runId}`);
            }
            const ok = agent.resolveUserResponse(controlledRunId, response);
            if (!ok) {
                throw new Error(`Nenhuma resposta pendente para o run ${controlledRunId}.`);
            }
            return { ok: true, runId: controlledRunId };
        }

        case 'agent-should-handle': {
            // Heurística simples — retorna true se parece ser tarefa de automação
            const text = String(params?.objetivo ?? '').toLowerCase();
            const keywords = ['pje', 'processo', 'abrir', 'consultar', 'petição', 'navegar',
                'movimentação', 'documento', 'tribunal', 'login', 'certificado'];
            return keywords.some(k => text.includes(k));
        }

        // ── Config ──
        case 'set-config': {
            const { initAI } = await import('../ai-handler');
            initAI(params);
            return { ok: true };
        }

        case 'get-config': {
            return getActiveConfig();
        }

        // ── AI Chat (direto, sem agent loop) ──
        case 'ai-chat-send': {
            const { callAI } = await import('../ai-handler');
            return callAI({
                system: params.system || 'Você é um assistente jurídico brasileiro especializado.',
                user: params.user || params.message,
                temperature: params.temperature ?? 0.3,
                maxTokens: params.maxTokens ?? 2000,
            });
        }

        // ── Browser ──
        case 'browser-init': {
            const { initBrowser } = await import('../browser-manager');
            await initBrowser();
            return { ok: true };
        }

        case 'browser-close': {
            const { closeBrowser } = await import('../browser-manager');
            await closeBrowser();
            return { ok: true };
        }

        case 'browser-reinit': {
            const { reInitBrowser } = await import('../browser-manager');
            await reInitBrowser();
            return { ok: true };
        }

        case 'browser-check-pje': {
            return buildPjeStatus();
        }

        case 'browser-focus': {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) {
                return { ok: false, error: 'no_active_page', status: await buildPjeStatus() };
            }
            try {
                await page.bringToFront();
            } catch (err: any) {
                console.warn('[Backend] Falha ao focar aba do browser:', err?.message || err);
            }
            return { ok: true, status: await buildPjeStatus() };
        }

        // ── Memory ──
        case 'memory-flush': {
            const { getMemory } = await import('../agent/memory');
            getMemory().flush();
            return { ok: true };
        }

        // ── Route Memory ──
        case 'route-memory-flush': {
            flushRouteMemory();
            return { ok: true };
        }

        // ── Session ──
        case 'session-list': {
            const agent = await ensureAgent();
            const sm = agent.getSessionManager();
            return sm.listSessionPreviews();
        }

        case 'session-flush': {
            const agent = await ensureAgent();
            const sm = agent.getSessionManager();
            if (sm?.flush) await sm.flush();
            return { ok: true };
        }

        // ── Brain ──
        case 'brain-search': {
            const { getBrainSafe } = await ensureBrain();
            const brain = getBrainSafe();
            if (!brain) return [];
            return brain.search(params.query || '', {
                types: params.types,
                limit: params.limit ?? 20,
            });
        }

        case 'brain-graph': {
            const brainMod2 = await ensureBrain();
            const brain2 = brainMod2.getBrainSafe();
            if (!brain2) return { nodes: [], edges: [] };
            return brain2.getFullGraph();
        }

        case 'brain-export': {
            const brainMod = await ensureBrain();
            const brain = brainMod.getBrainSafe();
            if (!brain) return { error: 'brain não inicializado' };
            const { renderBrainMarkdown } = await import('../brain/brain-renderer');
            return await renderBrainMarkdown(brain);
        }

        case 'brain-stats': {
            const { getBrainSafe } = await ensureBrain();
            const brain = getBrainSafe();
            if (!brain) return { nodeCount: 0, edgeCount: 0, byType: {} };
            return brain.getStats();
        }

        // ── Ollama ──
        case 'ollama-status': {
            const { getOllamaStatus } = await import('../ollama-manager');
            try {
                return await getOllamaStatus();
            } catch {
                return { running: false, models: [] };
            }
        }

        case 'ollama-list-models': {
            const { listModels } = await import('../ollama-manager');
            try {
                return await listModels();
            } catch {
                return [];
            }
        }

        // ── UI Navigate (CLI → Electron shell) ──
        case 'ui-navigate': {
            const { tab, payload } = params;
            // Emite como evento WS para todos os clients — o Electron main escuta
            // via backendEvents e propaga pro renderer.
            sendEvent('ui-navigate', { tab, payload });
            return { ok: true };
        }

        // ── Health ──
        case 'ping': {
            return { pong: Date.now() };
        }

        default:
            throw new Error(`Método RPC desconhecido: ${method}`);
    }
}

// ── Graceful shutdown ──
async function shutdown(): Promise<void> {
    console.log('[Backend] Encerrando...');
    flushRouteMemory();
    try {
        const { getMemory } = await import('../agent/memory');
        getMemory().flush();
    } catch { /* ok */ }
    try {
        const { closeBrowser } = await import('../browser-manager');
        await closeBrowser();
    } catch { /* ok */ }
    if (agentModule) {
        try {
            const sm = agentModule.getSessionManager();
            if (sm?.flush) await sm.flush();
        } catch { /* ok */ }
    }
    if (brainModule) {
        try { brainModule.closeBrain(); } catch { /* ok */ }
    }
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('disconnect', shutdown);

// Sinaliza que está pronto
console.log(`[Backend] READY on port ${PORT}`);


