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
import { setUserDataDir } from '../browser-manager';
import { initMemoryDir } from '../agent/memory';
import { initRouteMemory, flush as flushRouteMemory } from '../pje/route-memory';
import { setActiveConfig, getActiveConfig, type ActiveProviderConfig } from '../provider-config';
import { EventEmitter } from 'events';

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

console.log('[Backend] Módulos inicializados. userData:', USER_DATA_DIR);

// ── Agent module (lazy load) ──
let agentModule: any = null;
let agentInitialized = false;

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
let activeClient: WebSocket | null = null;

console.log(`[Backend] WebSocket server escutando em ws://127.0.0.1:${PORT}`);

// Envia evento para o client conectado (streaming)
function sendEvent(event: string, data: any): void {
    if (activeClient?.readyState === WebSocket.OPEN) {
        activeClient.send(JSON.stringify({ event, data }));
    }
}

// Envia resposta RPC
function sendResponse(ws: WebSocket, id: string, result?: any, error?: string): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(error ? { id, error } : { id, result }));
    }
}

wss.on('connection', (ws) => {
    console.log('[Backend] Client conectado');
    activeClient = ws;

    ws.on('message', async (raw) => {
        let msg: { id: string; method: string; params?: any };
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            return;
        }

        const { id, method, params } = msg;

        try {
            const result = await handleRPC(method, params ?? {});
            sendResponse(ws, id, result);
        } catch (err: any) {
            console.error(`[Backend] RPC error (${method}):`, err.message);
            sendResponse(ws, id, undefined, err.message);
        }
    });

    ws.on('close', () => {
        console.log('[Backend] Client desconectado');
        if (activeClient === ws) activeClient = null;
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

// ── RPC Handlers ──
async function handleRPC(method: string, params: any): Promise<any> {
    switch (method) {
        // ── Agent ──
        case 'agent-run': {
            const agent = await ensureAgent();
            await setupEventForwarding();
            const { objetivo, config, tenantConfig, sessionId } = params;
            return agent.runAgentLoop({
                objetivo,
                config: config ?? {},
                tenantConfig: tenantConfig ?? agent.getDefaultTenantConfig(),
                sessionId,
            });
        }

        case 'agent-cancel': {
            const agent = await ensureAgent();
            return agent.cancelAgentLoop(params?.runId);
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
        case 'session-flush': {
            const agent = await ensureAgent();
            const sm = agent.getSessionManager();
            if (sm?.flush) await sm.flush();
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
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('disconnect', shutdown);

// Sinaliza que está pronto
console.log(`[Backend] READY on port ${PORT}`);
