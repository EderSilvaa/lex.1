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

let backendProc: ChildProcess | null = null;
let ws: WebSocket | null = null;
let connected = false;

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

/** Spawna o backend Node.js e conecta via WebSocket */
export async function startBackend(userDataDir: string): Promise<void> {
    if (connected && ws?.readyState === WebSocket.OPEN) return;

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

    backendProc = spawn('node', [serverPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        detached: false,
    });

    backendProc.stdout?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line) console.log('[Backend]', line);
    });

    backendProc.stderr?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line) console.error('[Backend ERR]', line);
    });

    backendProc.on('exit', (code) => {
        console.warn('[BackendClient] Backend saiu com código:', code);
        connected = false;
        ws = null;
        backendProc = null;
        // Rejeita todas as chamadas pendentes
        for (const [id, { reject, timer }] of pending) {
            clearTimeout(timer);
            reject(new Error('Backend process exited'));
            pending.delete(id);
        }
    });

    // Espera o backend ficar pronto (tenta conectar via WS)
    await waitForBackend();
    console.log('[BackendClient] Conectado ao backend');
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
        console.warn('[BackendClient] WebSocket fechado');
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
}

/** Verifica se o backend está vivo */
export function isBackendAlive(): boolean {
    return connected && ws?.readyState === WebSocket.OPEN;
}

