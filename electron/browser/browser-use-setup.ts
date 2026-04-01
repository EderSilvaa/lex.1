/**
 * BrowserUseSetup — Instalação automática do browser-use Python
 *
 * Chamado no boot (main.ts), em background, não-bloqueante.
 * Verifica se browser-use está instalado no Python environment da LEX.
 * Se não, instala automaticamente.
 */

import { getPythonEnv } from '../python';
import { agentEmitter } from '../agent/loop';

let _installed: boolean | null = null;

/**
 * Verifica e instala browser-use se necessário.
 * Retorna true se browser-use está disponível após a chamada.
 */
export async function ensureBrowserUseInstalled(): Promise<boolean> {
    if (_installed === true) return true;

    const pyEnv = getPythonEnv();
    if (!pyEnv.isReady()) {
        console.log('[BrowserUse] Python não disponível — browser-use não será instalado');
        _installed = false;
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
        _installed = false;
        return false;
    }

    console.log('[BrowserUse] browser-use instalado com sucesso');
    _installed = true;
    return true;
}

/** Retorna se browser-use está disponível (sem instalar) */
export function isBrowserUseAvailable(): boolean {
    if (_installed !== null) return _installed;

    const pyEnv = getPythonEnv();
    if (!pyEnv.isReady()) return false;

    _installed = pyEnv.hasPackage('browser_use');
    return _installed;
}
