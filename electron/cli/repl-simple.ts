/**
 * CLI — REPL simples (sem Ink)
 *
 * Fallback usado quando `--in-electron` é passado — Ink v3 + yoga-layout-prebuilt
 * crashan com `RangeError: Array buffer allocation failed` no Node 20+.
 *
 * Usa apenas readline + stdout ANSI. Renderização fica a cargo do xterm.js
 * no lado do Electron (inclui copy/paste nativo).
 */

import * as readline from 'readline';
import { randomUUID } from 'crypto';
import {
    startBackend,
    stopBackend,
    rpcCall,
    backendEvents,
    syncConfigToBackend,
    setBackendSilent,
} from '../backend-client';
import { getActiveConfig } from '../provider-config';
import type { AgentEvent } from '../agent/types';
import { renderEvent, renderError, renderInfo } from './output';
import { THINK_LABELS } from './think-labels';

export interface ReplSimpleOptions {
    userDataDir: string;
    inElectron?: boolean;
}

function getInitialSessionId(): string {
    return process.env['LEX_CONVERSATION_ID']?.trim() || randomUUID();
}

function bannerIfNotElectron(inElectron?: boolean): void {
    if (inElectron) return;
    process.stdout.write('\x1b[1;36mLEX\x1b[0m \x1b[90m(modo simples)\x1b[0m\n');
    process.stdout.write('\x1b[90mDigite seu objetivo e ENTER. Ctrl+C para sair.\x1b[0m\n\n');
}

const SPINNER_FRAMES = ['-', '\\', '|', '/'];
const COLOR_CYAN = '\x1b[36m';
const COLOR_DIM = '\x1b[2m';
const COLOR_RESET = '\x1b[0m';

function randomIndex(len: number, current: number): number {
    if (len <= 1) return 0;
    let next: number;
    do { next = Math.floor(Math.random() * len); } while (next === current);
    return next;
}

class SimpleSpinner {
    private timer: NodeJS.Timeout | null = null;
    private labels: string[] = THINK_LABELS;
    private frame = 0;
    private labelIdx = 0;
    private tick = 0;
    private lastLabelKey = '';

    start(labels: string | string[] = THINK_LABELS): void {
        const nextLabels = Array.isArray(labels) ? labels : [labels];
        const nextKey = nextLabels.join('\u0000');
        if (nextKey !== this.lastLabelKey) {
            this.labels = nextLabels;
            this.labelIdx = Math.floor(Math.random() * Math.max(this.labels.length, 1));
            this.lastLabelKey = nextKey;
            this.tick = 0;
        }
        if (!this.timer) {
            this.timer = setInterval(() => this.render(), 100);
        }
        this.render();
    }

    stop(clear = true): void {
        const wasActive = !!this.timer;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (clear && wasActive && process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
    }

    private render(): void {
        if (!process.stdout.isTTY) return;
        this.tick++;
        this.frame = this.tick % SPINNER_FRAMES.length;
        if (this.labels.length > 1 && this.tick % 120 === 0) {
            this.labelIdx = randomIndex(this.labels.length, this.labelIdx);
        }
        const label = this.labels[this.labelIdx] ?? '';
        process.stdout.write(`\r\x1b[2K${COLOR_CYAN}${SPINNER_FRAMES[this.frame]} ${COLOR_RESET}${COLOR_DIM}${label}${COLOR_RESET}`);
    }
}

export async function runReplSimple(opts: ReplSimpleOptions): Promise<number> {
    setBackendSilent(true);
    await startBackend(opts.userDataDir);
    await syncConfigToBackend(getActiveConfig());

    bannerIfNotElectron(opts.inElectron);

    const sessionId = getInitialSessionId();
    let currentRunId = '';
    let running = false;
    let waitingUser = false;
    const spinner = new SimpleSpinner();

    backendEvents.on('agent-event', (event: AgentEvent) => {
        try {
            let shouldPrompt = false;

            switch (event.type) {
                case 'started':
                    currentRunId = event.runId;
                    waitingUser = false;
                    spinner.start(THINK_LABELS);
                    break;

                case 'thinking':
                case 'criticizing':
                case 'observing':
                case 'privacy_stats':
                    spinner.start(THINK_LABELS);
                    break;

                case 'acting':
                    spinner.stop(true);
                    renderEvent(event);
                    spinner.start(event.skill);
                    return;

                case 'tool_result':
                    spinner.stop(true);
                    renderEvent(event);
                    spinner.start(THINK_LABELS);
                    return;

                case 'streaming_start':
                    spinner.stop(true);
                    renderEvent(event);
                    return;

                case 'token':
                    renderEvent(event);
                    return;

                case 'waiting_user':
                    spinner.stop(true);
                    waitingUser = true;
                    renderEvent(event);
                    rl.setPrompt('\x1b[33m? \x1b[0m');
                    shouldPrompt = true;
                    break;

                case 'completed':
                case 'error':
                case 'cancelled':
                case 'timeout':
                    spinner.stop(true);
                    currentRunId = '';
                    running = false;
                    waitingUser = false;
                    renderEvent(event);
                    rl.setPrompt('\x1b[36m> \x1b[0m');
                    shouldPrompt = true;
                    break;

                case 'orchestrator':
                    spinner.stop(true);
                    renderEvent(event);
                    if (running) spinner.start(THINK_LABELS);
                    return;

                default:
                    break;
            }

            if (!shouldPrompt) renderEvent(event);
            if (shouldPrompt) rl.prompt();
        } catch {
            /* ignore render errors */
        }
    });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '\x1b[36m› \x1b[0m',
        terminal: true,
    });

    let sigintOnce = false;
    rl.on('SIGINT', async () => {
        if (running && currentRunId) {
            if (sigintOnce) {
                renderInfo('encerrando…');
                spinner.stop(true);
                process.exit(130);
            }
            sigintOnce = true;
            spinner.stop(true);
            renderInfo('cancelando run (ctrl+c novamente para forçar)…');
            try { await rpcCall('agent-cancel', { runId: currentRunId }); } catch { /* ignore */ }
            setTimeout(() => { sigintOnce = false; }, 3000);
            return;
        }
        rl.close();
    });

    rl.on('line', async (rawLine) => {
        const line = rawLine.trim();
        if (!line) { rl.prompt(); return; }
        if (line === 'exit' || line === 'quit' || line === 'sair') {
            rl.close();
            return;
        }

        if (waitingUser && currentRunId) {
            waitingUser = false;
            rl.setPrompt('\x1b[36m> \x1b[0m');
            spinner.start(THINK_LABELS);
            try {
                await rpcCall('agent-respond', { runId: currentRunId, response: line, sessionId, source: 'terminal' });
            } catch (err: any) {
                spinner.stop(true);
                renderError(err?.message || String(err));
                running = false;
                rl.prompt();
            }
            return;
        }

        if (running) {
            renderInfo('já tem uma run em andamento — aguarde ou ctrl+c pra cancelar.');
            return;
        }

        running = true;
        spinner.start(THINK_LABELS);
        try {
            await rpcCall(
                'agent-run',
                { objetivo: line, config: {}, sessionId, source: 'terminal' },
                { timeoutMs: 30 * 60 * 1000 + 60_000 },
            );
        } catch (err: any) {
            spinner.stop(true);
            renderError(err?.message || String(err));
            running = false;
            rl.prompt();
        }
    });

    rl.on('close', async () => {
        spinner.stop(true);
        try { await stopBackend(); } catch { /* ignore */ }
        process.exit(0);
    });

    rl.prompt();

    // Mantém vivo até close
    return new Promise<number>((resolve) => {
        rl.on('close', () => resolve(0));
    });
}
