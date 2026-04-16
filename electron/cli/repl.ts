/**
 * CLI — REPL interativo (Ink/React)
 *
 * Substitui o loop readline + ANSI manual por um App React renderizado
 * via Ink. Toda a lógica de sessão, spinner e eventos vive em ui/App.tsx.
 */

import React from 'react';
import { render } from 'ink';
import {
    startBackend,
    stopBackend,
    rpcCall,
    syncConfigToBackend,
    setBackendSilent,
} from '../backend-client';
import { getActiveConfig } from '../provider-config';
import { setInteractiveMode } from './output';
import App from './ui/App';
import type { SessionPreview } from './ui/Header';

export interface ReplOptions {
    userDataDir: string;
    inElectron?: boolean;
}

export async function runRepl(opts: ReplOptions): Promise<number> {
    setBackendSilent(true);
    await startBackend(opts.userDataDir);
    await syncConfigToBackend(getActiveConfig());

    // Rota renderInfo / renderError pelo message-bus → Ink App
    setInteractiveMode(true);

    let initialSessions: SessionPreview[] = [];
    try { initialSessions = await rpcCall('session-list', {}); } catch { /* ok */ }

    const { waitUntilExit } = render(
        React.createElement(App, {
            userDataDir: opts.userDataDir,
            initialSessions,
            inElectron: opts.inElectron,
        }),
    );

    await waitUntilExit();

    try { await stopBackend(); } catch { /* ignore */ }
    return 0;
}
