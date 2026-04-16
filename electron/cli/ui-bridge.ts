/**
 * CLI → Electron UI Bridge
 *
 * Helper para o CLI comandar a UI do Electron (navegar para aba,
 * abrir arquivo, destacar nó do Brain). Silencioso se Electron
 * não estiver rodando — catch(() => {}) engole o erro.
 */

import { rpcCall } from '../backend-client';

/**
 * Navega para uma aba do Electron e opcionalmente envia um payload.
 * Silencioso — nunca rejeita, nunca bloqueia o fluxo do CLI.
 */
export async function uiNavigate(tab: string, payload?: unknown): Promise<void> {
    try {
        await rpcCall('ui-navigate', { tab, payload }, { timeoutMs: 3000 });
    } catch {
        // Electron não está aberto ou backend não está conectado — ok.
    }
}

/** Abre a aba Arquivos e seleciona um arquivo pelo path. */
export async function uiOpenFile(filePath: string): Promise<void> {
    await uiNavigate('arquivos', { action: 'open-file', path: filePath });
}

/** Abre a aba Brain e destaca um nó pelo ID. */
export async function uiHighlightBrain(nodeId: string): Promise<void> {
    await uiNavigate('brain', { action: 'highlight-brain', nodeId });
}
