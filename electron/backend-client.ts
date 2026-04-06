/**
 * Backend Client — Electron main process → Backend Node.js process
 *
 * Gerencia o spawn do backend e a conexão WebSocket RPC.
 * Usa o mesmo protocolo do backend/server.ts:
 *   Request:  { id, method, params }
 *   Response: { id, result } | { id, error }
 *   Event:    { event, data }
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

const BACKEND_PORT = 19876;
const BACKEND_READY_TIMEOUT = 15000;
const DEFAULT_RPC_TIMEOUT = 120000;
const AGENT_RUN_RPC_TIMEOUT = 12 * 60 * 1000;
const PLAN_EXEC_RPC_TIMEOUT = 12 * 60 * 1000;
const BACKEND_RESTART_BASE_DELAY_MS = 1500;
const BACKEND_RESTART_MAX_DELAY_MS = 30000;

let backendProc: ChildProcess | null = null;
let ws: WebSocket | null = null;
let connected = false;
let startPromise: Promise<void> | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let restartAttempts = 0;
let lastUserDataDir: string | null = null;
let stopping = false;

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

        try {
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
        const tryConnect = () => {
            if (Date.now() > deadline) {
                return reject(new Error('Backend timeout — não ficou pronto em 15s'));
            }

            const socket = new WebSocket(`ws://127.0.0.1:${BACKEND_PORT}`);

            socket.on('open', () => {
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
        connected = false;
        ws = null;
        console.warn('[BackendClient] WebSocket fechado');
        rejectPendingCalls('Backend websocket closed');
        emitBackendStatus(stopping ? 'stopped' : 'disconnected');
        if (!stopping) scheduleBackendRestart();
    });

    socket.on('error', (err) => {
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
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            await rpcCall('memory-flush');
            await rpcCall('route-memory-flush');
            await rpcCall('session-flush');
            await rpcCall('browser-close');
        } catch { /* ok — backend pode já ter saído */ }
        ws.close();
    }
    if (backendProc && !backendProc.killed) {
        backendProc.kill();
    }
    connected = false;
    ws = null;
    backendProc = null;
    emitBackendStatus('stopped');
}

/** Verifica se o backend está vivo */
export function isBackendAlive(): boolean {
    return connected && ws?.readyState === WebSocket.OPEN;
}

