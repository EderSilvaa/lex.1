/**
 * Terminal Module — Entry point.
 *
 * Exporta singleton PtyManager e função de inicialização.
 */

import { PtyManager } from './pty-manager';

let manager: PtyManager | null = null;

/** Inicializa o módulo de terminal */
export function initTerminal(): void {
    if (manager) return;
    manager = new PtyManager();
    console.log('[Terminal] Módulo inicializado');
}

/** Retorna o singleton PtyManager */
export function getPtyManager(): PtyManager {
    if (!manager) {
        initTerminal();
    }
    return manager!;
}

export { PtyManager } from './pty-manager';
export { isCommandBlocked } from './command-guard';
