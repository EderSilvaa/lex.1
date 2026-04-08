/**
 * CLI — REPL interativo
 *
 * Loop readline com:
 *  - Sessão persistente (mesmo sessionId ao longo da conversa)
 *  - Histórico de comandos em %APPDATA%/lex-test1/cli-history
 *  - Spinner ANSI durante thinking/acting
 *  - Ctrl+C cancela run em andamento; segundo Ctrl+C sai
 *  - Comandos /help /clear /sair /sessao /nova /config
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
    startBackend,
    stopBackend,
    rpcCall,
    backendEvents,
    syncConfigToBackend,
} from '../backend-client';
import { getActiveConfig } from '../provider-config';
import type { AgentEvent } from '../agent/types';
import { renderEvent, renderError, renderInfo, resetStreamingState } from './output';
import { tryRunCommand } from './commands';

// ── ANSI helpers ────────────────────────────────────────────────────────────

const supportsColor =
    process.stdout.isTTY && process.env['NO_COLOR'] === undefined;
const A = (s: string) => (supportsColor ? s : '');

const CYAN   = A('\x1b[36m');
const GRAY   = A('\x1b[90m');
const BOLD   = A('\x1b[1m');
const RESET  = A('\x1b[0m');
const YELLOW = A('\x1b[33m');

// ── Spinner ──────────────────────────────────────────────────────────────────

const SPIN_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinTimer: NodeJS.Timeout | null = null;
let spinIdx = 0;
let spinLabel = '';

function startSpinner(label: string): void {
    if (!process.stdout.isTTY) return;
    spinLabel = label;
    spinIdx = 0;
    spinTimer = setInterval(() => {
        process.stdout.write(
            `\r${CYAN}${SPIN_FRAMES[spinIdx % SPIN_FRAMES.length]}${RESET} ${GRAY}${spinLabel}${RESET}   `,
        );
        spinIdx++;
    }, 100);
}

function stopSpinner(): void {
    if (spinTimer) {
        clearInterval(spinTimer);
        spinTimer = null;
        if (process.stdout.isTTY) {
            process.stdout.write('\r\x1b[2K'); // apaga a linha do spinner
        }
    }
}

// ── History ──────────────────────────────────────────────────────────────────

function historyPath(userDataDir: string): string {
    return path.join(userDataDir, 'cli-history');
}

function loadHistory(userDataDir: string): string[] {
    try {
        const raw = fs.readFileSync(historyPath(userDataDir), 'utf8');
        return raw.split('\n').filter(Boolean).reverse().slice(0, 500);
    } catch {
        return [];
    }
}

function appendHistory(userDataDir: string, line: string): void {
    try {
        fs.appendFileSync(historyPath(userDataDir), line + '\n', 'utf8');
    } catch { /* tolerante */ }
}

// ── Header ───────────────────────────────────────────────────────────────────

function printHeader(userDataDir: string): void {
    // Lê config local para mostrar provider/modelo no header
    let providerLine = '';
    try {
        const cfgPath = require('path').join(userDataDir, 'cli-config.json');
        const raw = require('fs').readFileSync(cfgPath, 'utf8');
        const cfg = JSON.parse(raw);
        if (cfg?.providerId) {
            const model = cfg.agentModel ?? '';
            providerLine = `${cfg.providerId}${model ? `/${model.split('/').pop()}` : ''}`;
        }
    } catch { /* sem config ainda */ }

    process.stdout.write('\n');
    process.stdout.write(
        `${BOLD}${CYAN}LEX${RESET}` +
        (providerLine ? `  ${GRAY}${providerLine}${RESET}` : '') +
        '\n'
    );
    process.stdout.write(`${GRAY}/help para lista de comandos${RESET}\n\n`);
}

// ── REPL principal ────────────────────────────────────────────────────────────

export interface ReplOptions {
    userDataDir: string;
}

export async function runRepl(opts: ReplOptions): Promise<number> {
    await startBackend(opts.userDataDir);
    // Sincroniza provider/model/key com o backend após connect/attach
    await syncConfigToBackend(getActiveConfig());

    let sessionId = randomUUID();
    let running = false;       // agent-run em andamento
    let ctrlCCount = 0;        // primeiro cancela, segundo sai

    printHeader(opts.userDataDir);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `${CYAN}>${RESET} `,
        history: loadHistory(opts.userDataDir),
        historySize: 500,
        terminal: true,
    });

    // Evento de agent — spinner + renderização
    const onEvent = (event: AgentEvent) => {
        switch (event.type) {
            case 'thinking':
                // Spinner discreto sem mostrar conteúdo do pensamento
                startSpinner('pensando');
                break;
            case 'acting':
                // Spinner com nome da skill enquanto executa
                startSpinner(event.skill);
                break;
            case 'tool_result':
                // Para spinner antes de renderizar o resultado
                stopSpinner();
                renderEvent(event);
                break;
            case 'token':
                // Primeiro token — para spinner e começa a stremar
                if (spinTimer) stopSpinner();
                renderEvent(event);
                break;
            case 'streaming_start':
                stopSpinner();
                renderEvent(event);
                break;
            case 'completed':
            case 'error':
            case 'cancelled':
            case 'timeout':
                stopSpinner();
                renderEvent(event);
                break;
            default:
                renderEvent(event);
        }
    };

    backendEvents.on('agent-event', onEvent);

    const cleanup = async () => {
        backendEvents.off('agent-event', onEvent);
        stopSpinner();
        resetStreamingState();
        rl.close();
        try { await stopBackend(); } catch { /* ignore */ }
    };

    // Ctrl+C: cancela run ativo ou sai
    rl.on('SIGINT', async () => {
        if (running) {
            ctrlCCount++;
            if (ctrlCCount === 1) {
                stopSpinner();
                renderInfo('cancelando… (ctrl+c novamente para forçar saída)');
                try { await rpcCall('agent-cancel', {}); } catch { /* ignore */ }
            } else {
                await cleanup();
                process.exit(130);
            }
            return;
        }
        // Nenhum run ativo — sai direto
        process.stdout.write('\n');
        await cleanup();
        process.exit(0);
    });

    rl.on('close', async () => {
        await cleanup();
        process.exit(0);
    });

    // Loop de input
    rl.prompt();

    rl.on('line', async (input) => {
        const line = input.trim();
        rl.pause();

        if (!line) {
            rl.resume();
            rl.prompt();
            return;
        }

        appendHistory(opts.userDataDir, line);
        ctrlCCount = 0;

        // Tenta como comando slash
        const action = await tryRunCommand(line, { sessionId, userDataDir: opts.userDataDir });
        if (action) {
            if (action.type === 'exit') {
                await cleanup();
                process.exit(0);
            }
            if (action.type === 'clear') {
                process.stdout.write('\x1bc'); // reset terminal
                printHeader(opts.userDataDir);
            }
            if (action.type === 'new-session') {
                sessionId = randomUUID();
                renderInfo(`nova sessão: ${sessionId.slice(0, 8)}`);
            }
            rl.resume();
            rl.prompt();
            return;
        }

        // É um objetivo para o agente
        running = true;
        startSpinner('iniciando');

        try {
            await rpcCall(
                'agent-run',
                { objetivo: line, config: {}, sessionId },
                { timeoutMs: 12 * 60 * 1000 + 60_000 },
            );
        } catch (err: any) {
            stopSpinner();
            renderError(err?.message || String(err));
        } finally {
            running = false;
            ctrlCCount = 0;
            stopSpinner();
        }

        rl.resume();
        rl.prompt();
    });

    // Mantém o processo vivo enquanto readline estiver aberto
    return new Promise<number>((resolve) => {
        rl.once('close', () => resolve(0));
    });
}
