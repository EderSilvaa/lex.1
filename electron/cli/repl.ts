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
import { renderEvent, renderError, renderInfo, renderUserInput, resetStreamingState } from './output';
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

// Largura total da caixa (sem contar os │ das bordas)
const BOX_W = 60;
const DIVIDER_COL = 26; // coluna onde o painel divide esquerdo | direito

// Stripa ANSI para calcular largura real visível
function visibleLen(s: string): number {
    return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

// Pad à direita ignorando ANSI
function padRight(s: string, width: number): string {
    const diff = width - visibleLen(s);
    return diff > 0 ? s + ' '.repeat(diff) : s;
}

function boxLine(left: string, right: string): string {
    const l = padRight(left, DIVIDER_COL);
    const r = padRight(right, BOX_W - DIVIDER_COL - 1);
    return `${GRAY}\u2502${RESET}${l}${GRAY}\u2502${RESET}${r}${GRAY}\u2502${RESET}`;
}

function printHeader(userDataDir: string): void {
    // Lê config
    let providerId = '';
    let modelName  = '';
    let userName   = process.env['USERNAME'] || process.env['USER'] || '';
    try {
        const cfgPath = path.join(userDataDir, 'cli-config.json');
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        providerId = cfg?.providerId ?? '';
        const m = cfg?.agentModel ?? '';
        modelName = m ? m.split('/').pop() ?? m : '';
    } catch { /* ok */ }

    let version = '';
    try { version = require('../../package.json').version ?? ''; } catch { /* ok */ }

    // ── Título no topo ────────────────────────────────────────────────────────
    const title = ` LEX v${version} `;
    const titlePlain = title.replace(/\x1b\[[0-9;]*m/g, '');
    const titleColored = ` ${BOLD}${CYAN}LEX${RESET} ${GRAY}v${version}${RESET} `;
    const dashTotal = BOX_W - titlePlain.length;
    const dashLeft  = 3;
    const dashRight = dashTotal - dashLeft;
    const topLine =
        `${GRAY}\u256d${RESET}` +
        `${CYAN}${'─'.repeat(dashLeft)}${RESET}` +
        titleColored +
        `${CYAN}${'─'.repeat(Math.max(0, dashRight))}${RESET}` +
        `${GRAY}\u256e${RESET}`;

    // ── Painel esquerdo (logo + info) ─────────────────────────────────────────
    const greeting = userName ? `Bem-vindo, ${userName}!` : 'Bem-vindo!';
    // Trunca strings para caber no painel esquerdo (DIVIDER_COL - 3 de margem)
    const maxLeft = DIVIDER_COL - 3;
    const providerStr = `${providerId}${modelName ? ` · ${modelName}` : ''}`;
    const providerTrunc = providerStr.length > maxLeft ? providerStr.slice(0, maxLeft - 1) + '…' : providerStr;
    const dirTrunc = userDataDir.length > maxLeft ? '…' + userDataDir.slice(-(maxLeft - 2)) : userDataDir;

    const leftLines = [
        '',
        `  ${BOLD}${greeting}${RESET}`,
        '',
        `     ${CYAN} /\\ ${RESET}`,
        `     ${CYAN}/  \\${RESET}`,
        `    ${CYAN}/ ${BOLD}--${RESET}${CYAN} \\${RESET}`,
        `      ${BOLD}||${RESET}`,
        `      ${BOLD}()${RESET}`,
        '',
        `  ${GRAY}${providerTrunc}${RESET}`,
        `  ${GRAY}${dirTrunc}${RESET}`,
        '',
    ];

    // ── Painel direito (dicas + atividade recente) ────────────────────────────
    const rightLines = [
        '',
        `  ${BOLD}${CYAN}Como comecar${RESET}`,
        `  ${GRAY}/model  trocar modelo${RESET}`,
        `  ${GRAY}/provider  trocar IA${RESET}`,
        `  ${GRAY}/key  salvar API key${RESET}`,
        `  ${GRAY}/help  todos comandos${RESET}`,
        '',
        `  ${BOLD}${CYAN}Sessoes recentes${RESET}`,
        `  ${GRAY}Nenhuma sessao ainda${RESET}`,
        '',
        '',
        '',
    ];

    // ── Monta caixa ───────────────────────────────────────────────────────────
    const rows = Math.max(leftLines.length, rightLines.length);
    const bottomLine =
        `${GRAY}\u2570${RESET}` +
        `${GRAY}${'─'.repeat(BOX_W)}${RESET}` +
        `${GRAY}\u256f${RESET}`;

    process.stdout.write('\n');
    process.stdout.write(topLine + '\n');
    for (let i = 0; i < rows; i++) {
        process.stdout.write(boxLine(leftLines[i] ?? '', rightLines[i] ?? '') + '\n');
    }
    process.stdout.write(bottomLine + '\n');
    process.stdout.write('\n');
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
                startSpinner('pensando');
                break;
            case 'acting':
                stopSpinner();
                renderEvent(event);
                startSpinner(event.skill);
                break;
            case 'tool_result':
                stopSpinner();
                renderEvent(event);
                break;
            case 'token':
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

        // Tenta como comando slash (não re-echoa comandos)
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

        running = true;
        startSpinner('pensando');

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
