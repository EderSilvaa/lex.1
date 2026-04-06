/**
 * BrowserUseSetup — Instalação automática do browser-use Python
 *
 * Chamado no boot (main.ts), em background, não-bloqueante.
 * Verifica se browser-use está instalado no Python environment da LEX.
 * Se não, instala automaticamente.
 */

import { getPythonEnv, ensurePythonEnvSetup } from '../python';
import { agentEmitter } from '../agent/loop';

let _installed: boolean | null = null;
let _ensurePromise: Promise<boolean> | null = null;

/**
 * Verifica e instala browser-use se necessário.
 * Retorna true se browser-use está disponível após a chamada.
 */
export async function ensureBrowserUseInstalled(): Promise<boolean> {
    if (_installed === true) return true;
    if (_ensurePromise) return _ensurePromise;

    _ensurePromise = (async () => {
        try {
            await ensurePythonEnvSetup();
        } catch (err: any) {
            console.warn('[BrowserUse] Setup do Python falhou:', err?.message || err);
        }

        const pyEnv = getPythonEnv();
        if (!pyEnv.isReady()) {
            console.log('[BrowserUse] Python não disponível — browser-use não será instalado');
            return false;
        }

        // Checa se já tem browser-use
        if (pyEnv.hasPackage('browser_use')) {
            console.log('[BrowserUse] browser-use já instalado');
            _installed = true;
            return true;
        }

        // Instala
        console.log('[BrowserUse] Instalando browser-use...');
        agentEmitter.emit('agent-event', {
            type: 'thinking',
            pensamento: 'Instalando browser-use (única vez)...',
            iteracao: 0,
        });

        const result = await pyEnv.installPackage('browser-use');
        if (!result.success) {
            console.warn('[BrowserUse] Falha na instalação:', result.error);
            return false;
        }

        console.log('[BrowserUse] browser-use instalado com sucesso');
        _installed = true;
        return true;
    })().finally(() => {
        _ensurePromise = null;
    });

    return _ensurePromise;
}

/** Retorna se browser-use está disponível (sem instalar) */
export function isBrowserUseAvailable(): boolean {
    if (_installed === true) return true;

    const pyEnv = getPythonEnv();
    if (!pyEnv.isReady()) return false;

    const available = pyEnv.hasPackage('browser_use');
    if (available) _installed = true;
    return available;
}
