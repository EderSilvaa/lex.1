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
import { setUserDataDir, getActivePage, ensureBrowser, attemptPassiveBrowserReconnect, getBrowserContext, setActivePage } from '../browser-manager';
import { initMemoryDir, getMemory } from '../agent/memory';
import { initRouteMemory, flush as flushRouteMemory } from '../pje/route-memory';
import { inspectPjeContext } from '../pje/context-inspector';
import { inferPjeEnvironmentContext, normalizePjeEnvironmentContext, summarizePjeEnvironmentContext } from '../pje/environment-context';
import { fillPjeProcessNumber } from '../pje/process-number-filler';
import { clickPjeSearch } from '../pje/search-clicker';
import { readPjeSearchResults } from '../pje/search-results-reader';
import { openPjeSearchResult } from '../pje/process-result-opener';
import { readPjeAutos } from '../pje/autos-reader';
import { downloadPjeCurrentDocument } from '../pje/document-downloader';
import { analyzePjeDownloadedDocument } from '../pje/document-analyzer';
import { initCheckpointStore } from '../agent/checkpoint-store';
import { initSessionManager } from '../agent/session';
import { setActiveConfig, getActiveConfig, type ActiveProviderConfig } from '../provider-config';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import { initPythonEnv, ensurePythonEnvSetup, getPythonEnv } from '../python';
import { createHash, randomUUID } from 'crypto';
import type { BrainStore } from '../brain/brain-store';
import type { BrainNode } from '../brain/types';
import { writeBatchToBrain } from '../observer/writer-brain';
import { sanitizeInput, sanitizeOutputPreview } from '../observer/privacy';
import type { Observation, ObservationAfter, ObservationBefore } from '../observer/types';

// ── Config via env vars (passadas pelo Electron main ao spawnar) ──
const PORT = parseInt(process.env['LEX_BACKEND_PORT'] || '19876', 10);
const USER_DATA_DIR = process.env['LEX_USER_DATA'] || '';
const terminalRunSessions = new Map<string, string>();

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

void attemptPassiveBrowserReconnect()
    .then((connected) => {
        if (connected) console.log('[Backend] Browser reconectado passivamente no boot');
    })
    .catch((err: any) => {
        console.warn('[Backend] Reconnect passivo do browser falhou:', err?.message || String(err));
    });

// MCP Manager: cria template e conecta servers declarados em ~/.lex/mcp.json.
// Best-effort — falhas individuais não travam o backend.
(async () => {
    try {
        const { getMcpManager } = await import('../mcp-manager');
        const mcp = getMcpManager();
        mcp.ensureConfigTemplate();
        if (mcp.hasServers()) await mcp.init();

        // Observer: intercepta callTool do MCP para gravar observações no Brain.
        // Fire-and-forget — não deve bloquear a chamada original.
        try {
            await ensureBrain();
            const { initObserver, attachToMcpManager, registerDefaultEnrichers } =
                await import('../observer');
            initObserver();
            registerDefaultEnrichers();
            attachToMcpManager(mcp);
            console.log('[Backend] Observer anexado ao McpManager');
        } catch (obsErr: any) {
            console.warn(`[Backend] Observer init falhou: ${obsErr?.message || String(obsErr)}`);
        }
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

function sendEventToClientId(clientId: string, event: string, data: any): boolean {
    for (const [ws, id] of connectedClients) {
        if (id === clientId) {
            sendEventToClient(ws, event, data);
            return true;
        }
    }
    return false;
}

// Envia evento para todos os clients conectados (streaming)
function sendEvent(event: string, data: any): void {
    for (const ws of connectedClients.keys()) {
        sendEventToClient(ws, event, data);
    }
}

function normalizeConversationText(value: any): string {
    if (typeof value === 'string') return value.trim();
    if (value == null) return '';
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function emitTerminalConversationMessage(input: {
    sessionId?: string;
    role: 'user' | 'assistant';
    content: any;
    runId?: string;
}): void {
    const sessionId = String(input.sessionId || '').trim();
    const content = normalizeConversationText(input.content);
    if (!sessionId || !content) return;

    sendEvent('conversation-message', {
        source: 'terminal',
        conversationId: sessionId,
        sessionId,
        role: input.role,
        content,
        timestamp: Date.now(),
        runId: input.runId,
    });
}

function sendAgentEvent(data: any): void {
    const runId = typeof data?.runId === 'string' ? data.runId : '';
    const ownerId = runId ? runOwners.get(runId) : null;

    if (ownerId && sendEventToClientId(ownerId, 'agent-event', data)) {
        return;
    }

    sendEvent('agent-event', data);
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
        sendAgentEvent(event);
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
    contextSummary?: string | null;
    environment?: import('../pje/environment-context').PjeEnvironmentContext | null;
}> {
    try {
        if (!getActivePage()) {
            await attemptPassiveBrowserReconnect();
        }
        const page = getActivePage();
        const url = page?.url() ?? null;
        const isPje = typeof url === 'string' && url.includes('pje.');
        const tribunalAtivo = isPje ? detectTribunalFromUrl(url) : null;
        const [title, textSample] = await Promise.all([
            page?.title().catch(() => '') ?? Promise.resolve(''),
            page?.evaluate(() => String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2000)).catch(() => '') ?? Promise.resolve(''),
        ]);

        const mem = getMemory();
        const [memoriaData, usuario] = await Promise.all([mem.carregar(), mem.getUsuario()]);
        const pref = memoriaData.preferencias?.['tribunal_preferido'] || usuario.tribunal_preferido || null;
        const environment = inferPjeEnvironmentContext({
            url: url || undefined,
            title,
            tribunal: tribunalAtivo || undefined,
            textSnippets: textSample ? [textSample] : [],
        });

        return {
            connected: !!url,
            isPje,
            url,
            tribunalAtivo,
            tribunalPreferido: pref,
            contextSummary: summarizePjeEnvironmentContext(environment) || null,
            environment,
        };
    } catch {
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
}

// ── RPC Handlers ──
async function focusPageWithoutClosingSiblings(page: any): Promise<{ focusedUrl: string | null }> {
    try {
        const context = getBrowserContext();
        const pages = context.pages();
        const targetIndex = pages.indexOf(page);
        if (targetIndex >= 0) setActivePage(targetIndex);

        try {
            await page.bringToFront();
        } catch (err: any) {
            console.warn('[focusPageWithoutClosingSiblings] bringToFront falhou:', err?.message || err);
        }

        try {
            const session = await page.context().newCDPSession(page);
            await session.send('Page.bringToFront');
            await session.detach().catch(() => undefined);
        } catch (err: any) {
            console.warn('[focusPageWithoutClosingSiblings] CDP Page.bringToFront falhou:', err?.message || err);
        }

        await page.waitForTimeout?.(250).catch(() => undefined);
        return { focusedUrl: String(page?.url?.() || '') || null };
    } catch (err: any) {
        console.warn('[focusPageWithoutClosingSiblings] Falha geral:', err?.message || err);
        return { focusedUrl: String(page?.url?.() || '') || null };
    }
}

function isAllowedPjeUrl(rawUrl: unknown): rawUrl is string {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:') return false;
        const host = parsed.hostname.toLowerCase();
        return host.startsWith('pje') && host.endsWith('.jus.br');
    } catch {
        return false;
    }
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

function compactBrainData(data: unknown, maxChars = 2500): unknown {
    const raw = JSON.stringify(data ?? {});
    if (raw.length <= maxChars) return data ?? {};
    return {
        truncated: true,
        preview: raw.slice(0, maxChars),
    };
}

function compactBrainNode(node: BrainNode | null): any {
    if (!node) return null;
    return {
        id: node.id,
        type: node.type,
        label: node.label,
        confidence: node.confidence,
        source: node.source,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        accessedAt: node.accessedAt,
        data: compactBrainData(node.data),
    };
}

function summarizeFlowNode(flow: BrainNode): any {
    return {
        flowId: flow.id,
        label: flow.label,
        tribunal: flow.data?.['tribunal'],
        pjeContext: flow.data?.['pjeContext'],
        canonicalContext: flow.data?.['canonicalContext'],
        profileKind: flow.data?.['profileKind'],
        authState: flow.data?.['authState'],
        surfaceKind: flow.data?.['surfaceKind'],
        screenFamily: flow.data?.['screenFamily'],
        areaLabel: flow.data?.['areaLabel'],
        canonicalEnvironmentKey: flow.data?.['canonicalEnvironmentKey'],
        tools: Array.isArray(flow.data?.['tools']) ? flow.data['tools'] : [],
        instances: Number(flow.data?.['instances']) || 0,
        flowKind: flow.data?.['flowKind'],
        confidence: flow.confidence || 0,
        avgScore: Number(flow.data?.['avgScore']) || undefined,
        lastDetectedAt: Number(flow.data?.['lastDetectedAt']) || flow.updatedAt,
        updatedAt: flow.updatedAt,
    };
}

function listBrainFlows(brain: BrainStore, limit: number): any {
    const flows = brain.getNodesByType('flow', 500)
        .map(summarizeFlowNode)
        .sort((a, b) => {
            const scoreA = (Number(a.instances) || 0) * (Number(a.confidence) || 0);
            const scoreB = (Number(b.instances) || 0) * (Number(b.confidence) || 0);
            if (scoreB !== scoreA) return scoreB - scoreA;
            return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
        })
        .slice(0, limit);

    return {
        ok: true,
        count: flows.length,
        flows,
    };
}

function getBestEdge(edges: ReturnType<BrainStore['getEdgesFrom']>): ReturnType<BrainStore['getEdgesFrom']>[number] | null {
    if (!edges.length) return null;
    return [...edges].sort((a, b) => (b.weight || 0) - (a.weight || 0))[0] || null;
}

function getBrainFlowDetail(brain: BrainStore, flowRef: string): any {
    const ref = String(flowRef || '').trim();
    if (!ref) return { ok: false, error: 'flow_id_required' };

    const flow = brain.getNode(ref) || brain.getNodeByTypeAndLabel('flow', ref);
    if (!flow || flow.type !== 'flow') {
        return { ok: false, error: 'flow_not_found', flowRef: ref };
    }

    const startEdge = getBestEdge(brain.getEdgesFrom(flow.id, 'starts_at'));
    const startState = startEdge ? brain.getNode(startEdge.targetId) : null;
    const partOfEdges = brain.getEdgesTo(flow.id, 'part_of');
    const flowActionIds = new Set(partOfEdges.map(edge => edge.sourceId));
    const steps: any[] = [];

    let currentState = startState && startState.type === 'page_state' ? startState : null;
    const visited = new Set<string>(currentState ? [currentState.id] : []);
    const maxSteps = 25;

    for (let index = 0; currentState && index < maxSteps; index += 1) {
        const performs = brain.getEdgesFrom(currentState.id, 'performs')
            .filter(edge => flowActionIds.has(edge.targetId));
        const actionEdge = getBestEdge(performs);
        if (!actionEdge) break;

        const action = brain.getNode(actionEdge.targetId);
        if (!action || action.type !== 'action' || visited.has(action.id)) break;
        visited.add(action.id);

        const resultEdge = getBestEdge(brain.getEdgesFrom(action.id, 'results_in'));
        const nextState = resultEdge ? brain.getNode(resultEdge.targetId) : null;
        const input = action.data?.['input'] || {};

        steps.push({
            index: index + 1,
            actionId: action.id,
            label: action.label,
            tool: String(action.data?.['tool'] || action.label.split(':')[0] || 'unknown'),
            input: compactBrainData(input, 1800),
            observedCount: actionEdge.weight,
            success: action.data?.['lastSuccess'],
            durationHistory: Array.isArray(action.data?.['durationHistory'])
                ? action.data['durationHistory'].slice(-5)
                : undefined,
            expectedNextState: compactBrainNode(nextState && nextState.type === 'page_state' ? nextState : null),
        });

        if (!nextState || nextState.type !== 'page_state' || visited.has(nextState.id)) break;
        visited.add(nextState.id);
        currentState = nextState;
    }

    return {
        ok: true,
        flow: compactBrainNode(flow),
        summary: summarizeFlowNode(flow),
        startState: compactBrainNode(startState),
        actionCount: steps.length,
        steps,
    };
}

function sha256Text(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function limitText(value: unknown, maxChars: number): string {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function limitedObject(value: unknown, maxChars: number): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const raw = JSON.stringify(value);
    if (raw.length <= maxChars) return value as Record<string, unknown>;
    return {
        truncated: true,
        preview: raw.slice(0, maxChars),
    };
}

function normalizeObservationState(value: unknown): ObservationBefore | ObservationAfter | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const state: ObservationBefore & ObservationAfter = {};

    const url = limitText(raw['url'], 800);
    const title = limitText(raw['title'], 300);
    const domHash = limitText(raw['domHash'], 128);
    const tribunal = limitText(raw['tribunal'], 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const pjeContext = limitText(raw['pjeContext'], 120);
    const canonicalUrl = limitText(raw['canonicalUrl'], 800);
    const canonicalContext = limitText(raw['canonicalContext'], 120);
    const canonicalStateKey = limitText(raw['canonicalStateKey'], 600);
    const profileKind = limitText(raw['profileKind'], 40);
    const authState = limitText(raw['authState'], 40);
    const surfaceKind = limitText(raw['surfaceKind'], 80);
    const screenFamily = limitText(raw['screenFamily'], 80);
    const areaLabel = limitText(raw['areaLabel'], 120);
    const canonicalEnvironmentKey = limitText(raw['canonicalEnvironmentKey'], 220);
    const affordances = Array.isArray(raw['affordances'])
        ? raw['affordances'].map((item) => limitText(item, 80)).filter(Boolean).slice(0, 8)
        : [];
    const existingEnvironment = normalizePjeEnvironmentContext(raw['environment']);
    const environment = inferPjeEnvironmentContext({
        url,
        title,
        tribunal: tribunal || undefined,
        pjeContext: pjeContext || undefined,
        environment: {
            ...(existingEnvironment || {}),
            ...(profileKind ? { profileKind } : {}),
            ...(authState ? { authState } : {}),
            ...(surfaceKind ? { surfaceKind } : {}),
            ...(screenFamily ? { screenFamily } : {}),
            ...(areaLabel ? { areaLabel } : {}),
            ...(canonicalEnvironmentKey ? { canonicalEnvironmentKey } : {}),
            ...(affordances.length ? { affordances } : {}),
        },
    });

    if (url) state.url = url;
    if (title) state.title = title;
    if (domHash) state.domHash = domHash;
    if (tribunal) state.tribunal = tribunal;
    if (pjeContext) state.pjeContext = pjeContext;
    if (canonicalUrl) state.canonicalUrl = canonicalUrl;
    if (canonicalContext) state.canonicalContext = canonicalContext;
    if (canonicalStateKey) state.canonicalStateKey = canonicalStateKey;
    const hasMeaningfulEnvironment = environment.isPje
        || !!environment.tribunal
        || !!environment.pjeContext
        || !!environment.profileKind
        || !!environment.surfaceKind
        || !!environment.authState
        || !!environment.screenFamily
        || !!environment.areaLabel
        || !!environment.canonicalEnvironmentKey
        || !!environment.contextSummary
        || !!environment.affordances?.length;
    if (environment.profileKind) state.profileKind = environment.profileKind;
    if (environment.authState) state.authState = environment.authState;
    if (environment.surfaceKind) state.surfaceKind = environment.surfaceKind;
    if (environment.screenFamily) state.screenFamily = environment.screenFamily;
    if (environment.areaLabel) state.areaLabel = environment.areaLabel;
    if (environment.affordances?.length) state.affordances = environment.affordances;
    if (environment.canonicalEnvironmentKey) state.canonicalEnvironmentKey = environment.canonicalEnvironmentKey;
    if (hasMeaningfulEnvironment) state.environment = environment as any;

    if (Array.isArray(raw['newTabs'])) {
        state.newTabs = raw['newTabs']
            .map((tab: any) => ({
                id: limitText(tab?.id, 80),
                url: limitText(tab?.url, 800),
            }))
            .filter(tab => tab.id && tab.url)
            .slice(0, 10);
    }

    return Object.keys(state).length > 0 ? state : null;
}

function recordBrainObservation(brain: BrainStore, params: any): any {
    const tool = limitText(params?.tool, 160) || limitText(params?.toolName, 160);
    if (!tool) return { ok: false, error: 'tool_required' };

    const server = limitText(params?.server, 80) || 'lex-desktop-mcp';
    const input = sanitizeInput(limitedObject(params?.input, 5000)) as Record<string, unknown>;
    const output = limitText(params?.output || params?.outputPreview, 5000);
    const outputPreview = sanitizeOutputPreview(output.slice(0, 500));
    const success = params?.success !== false;
    const error = success ? null : (limitText(params?.error, 500) || 'manual_observation_failed');
    const durationMs = clampNumber(params?.durationMs, 0, 0, 10 * 60 * 1000);
    const before = normalizeObservationState(params?.before);
    const after = normalizeObservationState(params?.after);
    const traceId = limitText(params?.traceId, 120) || `mcp-${randomUUID()}`;

    const observation: Observation = {
        ts: Date.now(),
        server,
        tool,
        input,
        outputPreview,
        outputHash: output ? sha256Text(output) : '',
        outputSize: output.length,
        durationMs,
        success,
        error,
        before,
        after,
        traceId,
    };

    writeBatchToBrain(brain, [observation]);

    let flowReport: any = null;
    if (params?.detectFlows === true) {
        const { detectFlows } = require('../brain/flow-detector') as typeof import('../brain/flow-detector');
        flowReport = detectFlows(brain, {
            minActions: clampNumber(params?.flowOptions?.minActions, 1, 1, 12),
            minInstances: clampNumber(params?.flowOptions?.minInstances, 1, 1, 20),
            minEdgeWeight: clampNumber(params?.flowOptions?.minEdgeWeight, 1, 1, 20),
        });
    }

    return {
        ok: true,
        traceId,
        recorded: {
            server,
            tool,
            success,
            hasBefore: !!before,
            hasAfter: !!after,
            outputSize: output.length,
        },
        flowReport,
    };
}

async function handleRPC(ws: WebSocket, method: string, params: any): Promise<any> {
    const clientId = getClientId(ws);
    switch (method) {
        // ── Agent ──
        case 'agent-run': {
            // Garante Python + browser-use também no processo backend.
            await bootstrapPythonForBrowserUse();
            const agent = await ensureAgent();
            await setupEventForwarding();
            const { objetivo, config, tenantConfig, sessionId, source } = params;
            const isTerminalRun = source === 'terminal';
            if (isTerminalRun) {
                emitTerminalConversationMessage({ sessionId, role: 'user', content: objetivo });
            }

            // Goals compostos → Orchestrator (multi-agent paralelo)
            const { shouldUsePlanner } = await import('../agent/planner');
            if (shouldUsePlanner(objetivo)) {
                console.log('[Backend] Goal composto detectado — usando Orchestrator');
                const { Orchestrator } = await import('../agent/orchestrator');
                const orchestrator = new Orchestrator();
                _activeOrchestrator = orchestrator;
                _activeOrchestratorOwnerId = clientId;
                orchestrator.on('event', (evt: any) => {
                    const event = { type: 'orchestrator', data: evt };
                    if (!sendEventToClientId(clientId, 'agent-event', event)) {
                        sendEvent('agent-event', event);
                    }
                });
                try {
                    const result = await orchestrator.execute(objetivo, sessionId);
                    if (isTerminalRun) {
                        emitTerminalConversationMessage({ sessionId, role: 'assistant', content: result });
                    }
                    return result;
                } finally {
                    _activeOrchestrator = null;
                    _activeOrchestratorOwnerId = null;
                }
            }

            const runId = randomUUID();
            runOwners.set(runId, clientId);
            if (isTerminalRun && sessionId) {
                terminalRunSessions.set(runId, sessionId);
            }
            try {
                const result = await agent.runAgentLoop({
                    objetivo,
                    config: config ?? {},
                    tenantConfig: tenantConfig ?? agent.getDefaultTenantConfig(),
                    sessionId,
                    runId,
                });
                if (isTerminalRun) {
                    emitTerminalConversationMessage({ sessionId, role: 'assistant', content: result, runId });
                }
                return result;
            } finally {
                runOwners.delete(runId);
                terminalRunSessions.delete(runId);
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
            const { runId, response, sessionId, source } = params;
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
            if (source === 'terminal') {
                emitTerminalConversationMessage({
                    sessionId: terminalRunSessions.get(controlledRunId) || sessionId,
                    role: 'user',
                    content: response,
                    runId: controlledRunId,
                });
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

        case 'pje-open-url': {
            const url = params?.url;
            if (!isAllowedPjeUrl(url)) {
                return { ok: false, error: 'invalid_pje_url' };
            }

            await ensureBrowser();
            const context = getBrowserContext();
            const pages = context.pages();
            const blankPage = pages.find((candidate: any) => candidate.url() === 'about:blank');
            const page = blankPage || getActivePage();
            if (!page) {
                return { ok: false, error: 'no_active_page', status: await buildPjeStatus() };
            }

            const targetIndex = pages.indexOf(page);
            if (targetIndex >= 0) setActivePage(targetIndex);

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            // Reconsulta a active page — popups/redirects podem ter migrado pra outra aba via setupPageListeners
            const finalPage = getActivePage() || page;
            const focusResult = await focusPageWithoutClosingSiblings(finalPage);

            return {
                ok: true,
                url: finalPage.url(),
                focus: focusResult,
                navigationTarget: blankPage ? 'blank_page_reused' : 'active_page',
                status: await buildPjeStatus(),
            };
        }

        case 'pje-inspect-context': {
            return inspectPjeContext(params);
        }

        case 'pje-fill-process-number': {
            return fillPjeProcessNumber(params);
        }

        case 'pje-click-search': {
            return clickPjeSearch(params);
        }

        case 'pje-read-search-results': {
            return readPjeSearchResults(params);
        }

        case 'pje-open-search-result': {
            return openPjeSearchResult(params);
        }

        case 'pje-read-autos': {
            return readPjeAutos(params);
        }

        case 'pje-download-current-document': {
            return downloadPjeCurrentDocument(params);
        }

        case 'pje-analyze-downloaded-document': {
            return analyzePjeDownloadedDocument(params);
        }

        case 'browser-focus': {
            // NÃO chama ensureBrowser() — só foca se Chrome já estiver aberto.
            const page = getActivePage();
            if (!page) {
                return { ok: false, error: 'no_active_page', status: await buildPjeStatus() };
            }
            const focus = await focusPageWithoutClosingSiblings(page);
            return { ok: true, focus, status: await buildPjeStatus() };
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

        case 'session-history': {
            const agent = await ensureAgent();
            const sm = agent.getSessionManager();
            const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : '';
            if (!sessionId) return [];
            const limit = typeof params?.limit === 'number' ? params.limit : 12;
            return sm.getHistory(sessionId, limit);
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

        case 'brain-flows': {
            const { getBrainSafe } = await ensureBrain();
            const brain = getBrainSafe();
            if (!brain) return { ok: false, count: 0, flows: [], error: 'brain_not_initialized' };
            return listBrainFlows(brain, clampNumber(params?.limit, 10, 1, 50));
        }

        case 'brain-get-flow': {
            const { getBrainSafe } = await ensureBrain();
            const brain = getBrainSafe();
            if (!brain) return { ok: false, error: 'brain_not_initialized' };
            return getBrainFlowDetail(brain, String(params?.flowId || params?.label || ''));
        }

        case 'brain-record-observation': {
            const { getBrainSafe } = await ensureBrain();
            const brain = getBrainSafe();
            if (!brain) return { ok: false, error: 'brain_not_initialized' };
            return recordBrainObservation(brain, params || {});
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

        case 'brain-dashboard': {
            const { getBrainSafe } = await ensureBrain();
            const brain = getBrainSafe();
            if (!brain) return null;
            const { getDashboardOverview } = await import('../brain/dashboard');
            return getDashboardOverview(brain, {
                windowDays: Number(params?.windowDays) || 7,
                topFlowsLimit: Number(params?.topFlowsLimit) || 10,
            });
        }

        case 'brain-trace': {
            const { getBrainSafe } = await ensureBrain();
            const brain = getBrainSafe();
            if (!brain) return null;
            const { getTrace } = await import('../brain/trace-query');
            return getTrace(brain, String(params?.traceId || ''));
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
    try {
        const { shutdownObserver } = await import('../observer');
        await shutdownObserver();
    } catch { /* ok */ }
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


