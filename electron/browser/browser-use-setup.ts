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
const _providerDepsEnsured = new Set<string>();
const _providerDepsPromises = new Map<string, Promise<boolean>>();

interface ProviderDependency {
    packageName: string;
    importName: string;
}

const PROVIDER_DEPENDENCIES: Record<string, ProviderDependency[]> = {
    google: [{ packageName: 'langchain-google-genai', importName: 'langchain_google_genai' }],
    groq: [{ packageName: 'langchain-groq', importName: 'langchain_groq' }],
};

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

/** Garante deps extras do provider atual para o runner Python (ex: Google/Groq) */
export async function ensureBrowserUseProviderDeps(provider: string): Promise<boolean> {
    const providerId = String(provider || '').toLowerCase();
    const deps = PROVIDER_DEPENDENCIES[providerId] ?? [];
    if (deps.length === 0) return true;
    if (_providerDepsEnsured.has(providerId)) return true;

    const pending = _providerDepsPromises.get(providerId);
    if (pending) return pending;

    const ensurePromise = (async () => {
        try {
            await ensurePythonEnvSetup();
        } catch (err: any) {
            console.warn(`[BrowserUse] Setup Python falhou ao preparar deps de ${providerId}:`, err?.message || err);
        }

        const pyEnv = getPythonEnv();
        if (!pyEnv.isReady()) {
            console.warn(`[BrowserUse] Python indisponível para deps de ${providerId}`);
            return false;
        }

        for (const dep of deps) {
            if (pyEnv.hasPackage(dep.importName)) continue;

            console.log(`[BrowserUse] Instalando dependência ${dep.packageName} para provider ${providerId}...`);
            const result = await pyEnv.installPackage(dep.packageName);
            if (!result.success) {
                console.warn(`[BrowserUse] Falha ao instalar ${dep.packageName}:`, result.error);
                return false;
            }

            if (!pyEnv.hasPackage(dep.importName)) {
                console.warn(`[BrowserUse] Dependência ${dep.packageName} não pôde ser validada após instalação.`);
                return false;
            }
        }

        _providerDepsEnsured.add(providerId);
        return true;
    })().finally(() => {
        _providerDepsPromises.delete(providerId);
    });

    _providerDepsPromises.set(providerId, ensurePromise);
    return ensurePromise;
}
