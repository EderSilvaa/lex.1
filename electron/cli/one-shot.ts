/**
 * CLI — Modo one-shot
 *
 * `lex "objetivo"` — sobe (ou attacha) o backend, executa um agent-run,
 * imprime os eventos em stream e sai.
 */

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
import { renderEvent, renderError, renderInfo } from './output';

export interface OneShotOptions {
    objetivo: string;
    userDataDir: string;
}

export async function runOneShot(opts: OneShotOptions): Promise<number> {
    const sessionId = randomUUID();

    const onEvent = (event: AgentEvent) => {
        try {
            renderEvent(event);
        } catch {
            /* render não deve travar o agent */
        }
    };

    backendEvents.on('agent-event', onEvent);

    let cancelled = false;
    const sigintHandler = async () => {
        if (cancelled) {
            renderInfo('encerrando…');
            process.exit(130);
        }
        cancelled = true;
        renderInfo('cancelando run (ctrl+c novamente para forçar saída)…');
        try {
            await rpcCall('agent-cancel', {});
        } catch {
            /* ignore */
        }
    };
    process.on('SIGINT', sigintHandler);

    let exitCode = 0;
    try {
        await startBackend(opts.userDataDir);
        // Sincroniza provider/model/key com o backend (pode ser attach ou spawn próprio)
        await syncConfigToBackend(getActiveConfig());
        await rpcCall(
            'agent-run',
            {
                objetivo: opts.objetivo,
                config: {},
                sessionId,
            },
            { timeoutMs: 12 * 60 * 1000 + 60_000 },
        );
    } catch (err: any) {
        renderError(err?.message || String(err));
        exitCode = 1;
    } finally {
        backendEvents.off('agent-event', onEvent);
        process.off('SIGINT', sigintHandler);
        try {
            await stopBackend();
        } catch {
            /* ignore */
        }
    }

    return exitCode;
}
