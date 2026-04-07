/**
 * Backend Client — Electron main process → Backend Node.js process
 *
 * Gerencia o spawn do backend e a conexão WebSocket RPC.
 * Usa o mesmo protocolo do backend/server.ts:
 *   Request:  { id, method, params }
 *   Response: { id, result } | { id, error }
 *   Event:    { event, data }
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

const BACKEND_PORT = 19876;
const BACKEND_READY_TIMEOUT = 15000;
const DEFAULT_RPC_TIMEOUT = 120000;
const AGENT_RUN_RPC_TIMEOUT = 12 * 60 * 1000;
const PLAN_EXEC_RPC_TIMEOUT = 12 * 60 * 1000;
const BACKEND_RESTART_BASE_DELAY_MS = 2000;
const BACKEND_RESTART_MAX_DELAY_MS = 30000;
const BACKEND_MAX_RESTART_ATTEMPTS = 10;

let backendProc: ChildProcess | null = null;
let ws: WebSocket | null = null;
let connected = false;
let startPromise: Promise<void> | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let restartAttempts = 0;
let lastUserDataDir: string | null = null;
let stopping = false;
let lastExitTimestamp = 0; // Para suprimir 'disconnected' duplicado após 'exited'
// Quando true, este processo (Electron ou CLI) é dono do backend e pode matá-lo no shutdown.
// Quando false, attachamos a um backend já em execução (de outro processo) e só devemos fechar o WS.
let weOwnBackendProc = false;

interface PendingRpcCall {
    resolve: (v: any) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
}

interface RpcCallOptions {
    timeoutMs?: number;
}

// Pending RPC calls: id → { resolve, reject, timer }
const pending = new Map<string, PendingRpcCall>();

// Event emitter para forward de eventos do backend → renderer
export const backendEvents = new EventEmitter();

function killProcessOnPort(port: number): void {
    if (process.platform !== 'win32') return;
    try {
        const out = execSync(
            `netstat -ano | findstr "LISTENING" | findstr ":${port}"`,
            { encoding: 'utf8', timeout: 3000 }
        ).trim();
        const lines = out.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[parts.length - 1] ?? '', 10);
            if (pid && pid !== process.pid) {
                console.warn(`[BackendClient] Matando processo anterior na porta ${port}: PID ${pid}`);
                try { execSync(`taskkill /F /PID ${pid}`, { timeout: 3000 }); } catch { /* ignore */ }
            }
        }
    } catch {
        // Porta provavelmente livre
    }
}

function emitBackendStatus(status: string, extra?: Record<string, any>): void {
    backendEvents.emit('backend-status', {
        status,
        timestamp: Date.now(),
        ...(extra || {}),
    });
}

function emitBackendLog(level: 'info' | 'error' | 'warn', message: string): void {
    backendEvents.emit('backend-log', {
        level,
        message,
        timestamp: Date.now(),
    });
}

function rejectPendingCalls(reason: string): void {
    for (const [id, { reject, timer }] of pending) {
        clearTimeout(timer);
        reject(new Error(reason));
        pending.delete(id);
    }
}

function getRestartDelayMs(attempt: number): number {
    const factor = Math.min(Math.max(attempt - 1, 0), 6);
    return Math.min(BACKEND_RESTART_BASE_DELAY_MS * Math.pow(2, factor), BACKEND_RESTART_MAX_DELAY_MS);
}

function scheduleBackendRestart(): void {
    if (stopping) return;
    if (!lastUserDataDir) return;
    if (restartTimer) return;

    const attempt = restartAttempts + 1;

    if (attempt > BACKEND_MAX_RESTART_ATTEMPTS) {
        emitBackendStatus('gave_up', { attempts: restartAttempts });
        console.error(`[BackendClient] Desistindo após ${restartAttempts} tentativas de restart`);
        return;
    }

    const delayMs = getRestartDelayMs(attempt);
    restartAttempts = attempt;

    emitBackendStatus('restart_scheduled', { attempt, delayMs });

    restartTimer = setTimeout(async () => {
        restartTimer = null;
        if (stopping || !lastUserDataDir) return;

        emitBackendStatus('restarting', { attempt });
        try {
            await startBackend(lastUserDataDir);
            emitBackendStatus('restarted', { attempt });
        } catch (err: any) {
            const message = err?.message || String(err);
            emitBackendStatus('restart_failed', { attempt, error: message });
            scheduleBackendRestart();
        }
    }, delayMs);
}

/** Spawna o backend Node.js e conecta via WebSocket */
/**
 * Tenta attachar a um backend já em execução na porta padrão.
 * Usado tanto pelo Electron quanto pelo CLI para coexistência:
 * o segundo cliente reusa o backend do primeiro em vez de matar e respawnar.
 *
 * Retorna true se conseguiu attachar (com handshake ping confirmado).
 */
async function tryAttachExisting(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            resolve(ok);
        };

        let socket: WebSocket;
        try {
            socket = new WebSocket(`ws://127.0.0.1:${BACKEND_PORT}`);
        } catch {
            return finish(false);
        }

        const giveUp = setTimeout(() => {
            try { socket.terminate(); } catch { /* ignore */ }
            finish(false);
        }, 1500);

        socket.on('open', () => {
            // Handshake: manda um ping e espera resposta — confirma que é um backend Lex válido.
            const pingId = randomUUID();
            const pingTimer = setTimeout(() => {
                try { socket.terminate(); } catch { /* ignore */ }
                clearTimeout(giveUp);
                finish(false);
            }, 1000);

            socket.once('message', (raw) => {
                clearTimeout(pingTimer);
                clearTimeout(giveUp);
                let msg: any;
                try { msg = JSON.parse(raw.toString()); } catch { msg = null; }
                if (!msg || msg.id !== pingId || msg.error) {
                    try { socket.terminate(); } catch { /* ignore */ }
                    return finish(false);
                }
                // Sucesso: adota este socket como o ws ativo do client.
                if (ws && ws !== socket) {
                    try { ws.removeAllListeners(); } catch { /* ignore */ }
                    try { ws.close(); } catch { /* ignore */ }
                }
                ws = socket;
                connected = true;
                weOwnBackendProc = false;
                setupWsHandlers(socket);
                finish(true);
            });

            socket.send(JSON.stringify({ id: pingId, method: 'ping', params: {} }));
        });

        socket.on('error', () => {
            clearTimeout(giveUp);
            try { socket.terminate(); } catch { /* ignore */ }
            finish(false);
        });
    });
}

export async function startBackend(userDataDir: string): Promise<void> {
    if (startPromise) return startPromise;
    startPromise = (async () => {
        if (connected && ws?.readyState === WebSocket.OPEN) return;
        stopping = false;
        lastUserDataDir = userDataDir;

        if (restartTimer) {
            clearTimeout(restartTimer);
            restartTimer = null;
        }

        // Se processo já está de pé, tenta apenas reconectar no WebSocket.
        if (backendProc && backendProc.exitCode === null) {
            try {
                await waitForBackend();
                restartAttempts = 0;
                emitBackendStatus('connected', { reusedProcess: true });
                console.log('[BackendClient] Reconectado ao backend existente');
                return;
            } catch (err: any) {
                console.warn('[BackendClient] Reconexão ao backend existente falhou, reiniciando processo:', err?.message || err);
                try { backendProc.kill(); } catch { /* ignore */ }
                backendProc = null;
            }
        }

        // Tenta attachar a um backend já rodando (de outro processo Lex —
        // ex: Electron rodando, CLI sobe depois e usa o mesmo backend).
        try {
            const attached = await tryAttachExisting();
            if (attached) {
                restartAttempts = 0;
                emitBackendStatus('connected', { attachedExternal: true });
                console.log('[BackendClient] Attachado a backend externo já em execução');
                return;
            }
        } catch (err: any) {
            console.warn('[BackendClient] tryAttachExisting falhou:', err?.message || err);
        }

        try {
            // Mata processo anterior que pode estar segurando a porta
            killProcessOnPort(BACKEND_PORT);

            // Caminho do script compilado do backend
            const serverPath = path.join(__dirname, 'backend', 'server.js');

            // Env limpo — sem variáveis do Electron
            const env = { ...process.env };
            delete env['ELECTRON_RUN_AS_NODE'];
            delete env['ELECTRON_NO_ATTACH_CONSOLE'];
            delete env['CHROME_CRASHPAD_PIPE_NAME'];
            for (const key of Object.keys(env)) {
                if (key.startsWith('CRASHPAD_') || key.startsWith('BREAKPAD_')) delete env[key];
            }

            env['LEX_BACKEND_PORT'] = String(BACKEND_PORT);
            env['LEX_USER_DATA'] = userDataDir;

            console.log('[BackendClient] Spawnando backend...', serverPath);
            emitBackendStatus('starting');

            backendProc = spawn('node', [serverPath], {
                stdio: ['ignore', 'pipe', 'pipe'],
                env,
                detached: false,
            });
            weOwnBackendProc = true;

            backendProc.stdout?.on('data', (d: Buffer) => {
                for (const rawLine of d.toString().split(/\r?\n/g)) {
                    const line = rawLine.trim();
                    if (!line) continue;
                    console.log('[Backend]', line);
                    emitBackendLog('info', line);
                }
            });

            backendProc.stderr?.on('data', (d: Buffer) => {
                for (const rawLine of d.toString().split(/\r?\n/g)) {
                    const line = rawLine.trim();
                    if (!line) continue;
                    console.error('[Backend ERR]', line);
                    emitBackendLog('error', line);
                }
            });

            backendProc.on('exit', (code) => {
                console.warn('[BackendClient] Backend saiu com código:', code);
                connected = false;
                ws = null;
                backendProc = null;
                lastExitTimestamp = Date.now();
                rejectPendingCalls('Backend process exited');
                emitBackendStatus(stopping ? 'stopped' : 'exited', { code: code ?? null });
                if (!stopping) scheduleBackendRestart();
            });

            // Espera o backend ficar pronto (tenta conectar via WS)
            await waitForBackend();
            restartAttempts = 0;
            emitBackendStatus('connected');
            console.log('[BackendClient] Conectado ao backend');
        } catch (err: any) {
            const message = err?.message || String(err);
            emitBackendStatus('start_failed', { error: message });
            if (!stopping) scheduleBackendRestart();
            throw err;
        }
    })().finally(() => {
        startPromise = null;
    });

    return startPromise;
}

async function waitForBackend(): Promise<void> {
    const deadline = Date.now() + BACKEND_READY_TIMEOUT;

    return new Promise<void>((resolve, reject) => {
        let settled = false;

        const tryConnect = () => {
            if (Date.now() > deadline) {
                return reject(new Error('Backend timeout — não ficou pronto em 15s'));
            }

            const socket = new WebSocket(`ws://127.0.0.1:${BACKEND_PORT}`);

            socket.on('open', () => {
                if (settled) {
                    try { socket.close(); } catch { /* ignore */ }
                    return;
                }
                settled = true;
                // Mantém apenas um socket ativo.
                if (ws && ws !== socket) {
                    try { ws.removeAllListeners(); } catch { /* ignore */ }
                    try { ws.close(); } catch { /* ignore */ }
                }
                ws = socket;
                connected = true;
                setupWsHandlers(socket);
                resolve();
            });

            socket.on('error', () => {
                socket.terminate();
                setTimeout(tryConnect, 300);
            });
        };

        // Dá 500ms pro Node.js subir
        setTimeout(tryConnect, 500);
    });
}

function setupWsHandlers(socket: WebSocket): void {
    socket.on('message', (raw) => {
        if (socket !== ws) return;
        let msg: any;
        try { msg = JSON.parse(raw.toString()); } catch { return; }

        // RPC Response
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject, timer } = pending.get(msg.id)!;
            pending.delete(msg.id);
            clearTimeout(timer);
            if (msg.error) {
                reject(new Error(msg.error));
            } else {
                resolve(msg.result);
            }
        }

        // Streaming event
        if (msg.event) {
            backendEvents.emit(msg.event, msg.data);
        }
    });

    socket.on('close', () => {
        // Ignora fechamento de sockets obsoletos.
        if (socket !== ws) return;
        connected = false;
        ws = null;
        console.warn('[BackendClient] WebSocket fechado');
        rejectPendingCalls('Backend websocket closed');

        // Se o processo já emitiu 'exited' recentemente, não duplicar com 'disconnected'
        const msSinceExit = Date.now() - lastExitTimestamp;
        if (msSinceExit < 3000) return;

        emitBackendStatus(stopping ? 'stopped' : 'disconnected');
        if (!stopping) scheduleBackendRestart();
    });

    socket.on('error', (err) => {
        if (socket !== ws) return;
        console.error('[BackendClient] WS error:', err.message);
    });
}

/** Chamada RPC para o backend. Retorna Promise com resultado. */
function getRpcTimeout(method: string, timeoutOverride?: number): number {
    if (Number.isFinite(timeoutOverride) && (timeoutOverride as number) > 0) {
        return timeoutOverride as number;
    }
    if (method === 'agent-run') return AGENT_RUN_RPC_TIMEOUT;
    if (method === 'ai-plan-execute') return PLAN_EXEC_RPC_TIMEOUT;
    return DEFAULT_RPC_TIMEOUT;
}

/** Chamada RPC para o backend. Retorna Promise com resultado. */
export function rpcCall(method: string, params?: any, options?: RpcCallOptions): Promise<any> {
    return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return reject(new Error('Backend não conectado'));
        }

        const id = randomUUID();
        const timeoutMs = getRpcTimeout(method, options?.timeoutMs);
        const timer = setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id);
                reject(new Error(`RPC timeout: ${method}`));
            }
        }, timeoutMs);

        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
}

/** Envia config de provider/API key para o backend */
export async function syncConfigToBackend(config: any): Promise<void> {
    if (!connected) return;
    try {
        await rpcCall('set-config', config);
    } catch (err: any) {
        console.error('[BackendClient] Erro ao sincronizar config:', err.message);
    }
}

/** Fecha backend graciosamente */
export async function stopBackend(): Promise<void> {
    stopping = true;
    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }
    restartAttempts = 0;
    const isOwner = weOwnBackendProc;
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Só executa flush+close de recursos compartilhados se este processo for o dono.
        // Quando estamos attachados (CLI usando backend de Electron, p.ex.), não tocamos
        // memory/sessions/browser do outro processo — apenas desconectamos o socket.
        if (isOwner) {
            try {
                await rpcCall('memory-flush');
                await rpcCall('route-memory-flush');
                await rpcCall('session-flush');
                await rpcCall('browser-close');
            } catch { /* ok — backend pode já ter saído */ }
        }
        ws.close();
    }
    if (isOwner && backendProc && !backendProc.killed) {
        backendProc.kill();
    }
    connected = false;
    ws = null;
    backendProc = null;
    weOwnBackendProc = false;
    emitBackendStatus('stopped');
}

/** Verifica se o backend está vivo */
export function isBackendAlive(): boolean {
    return connected && ws?.readyState === WebSocket.OPEN;
}

