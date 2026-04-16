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

export interface ReplSimpleOptions {
    userDataDir: string;
    inElectron?: boolean;
}

function bannerIfNotElectron(inElectron?: boolean): void {
    if (inElectron) return;
    process.stdout.write('\x1b[1;36mLEX\x1b[0m \x1b[90m(modo simples)\x1b[0m\n');
    process.stdout.write('\x1b[90mDigite seu objetivo e ENTER. Ctrl+C para sair.\x1b[0m\n\n');
}

export async function runReplSimple(opts: ReplSimpleOptions): Promise<number> {
    setBackendSilent(true);
    await startBackend(opts.userDataDir);
    await syncConfigToBackend(getActiveConfig());

    bannerIfNotElectron(opts.inElectron);

    const sessionId = randomUUID();
    let currentRunId = '';
    let running = false;

    backendEvents.on('agent-event', (event: AgentEvent) => {
        try {
            if (event.type === 'started') currentRunId = event.runId;
            if (
                event.type === 'completed' ||
                event.type === 'error' ||
                event.type === 'cancelled' ||
                event.type === 'timeout'
            ) {
                currentRunId = '';
                running = false;
                process.stdout.write('\n');
                rl.prompt();
            }
            renderEvent(event);
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
                process.exit(130);
            }
            sigintOnce = true;
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

        if (running) {
            renderInfo('já tem uma run em andamento — aguarde ou ctrl+c pra cancelar.');
            return;
        }

        running = true;
        try {
            await rpcCall(
                'agent-run',
                { objetivo: line, config: {}, sessionId },
                { timeoutMs: 30 * 60 * 1000 + 60_000 },
            );
        } catch (err: any) {
            renderError(err?.message || String(err));
            running = false;
            rl.prompt();
        }
    });

    rl.on('close', async () => {
        try { await stopBackend(); } catch { /* ignore */ }
        process.exit(0);
    });

    rl.prompt();

    // Mantém vivo até close
    return new Promise<number>((resolve) => {
        rl.on('close', () => resolve(0));
    });
}
