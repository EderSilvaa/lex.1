/**
 * Python Module — Entry point.
 *
 * Exporta singleton PythonEnvironmentManager e função de inicialização.
 */

import { PythonEnvironmentManager } from './environment-manager';

let manager: PythonEnvironmentManager | null = null;
let setupPromise: Promise<void> | null = null;

/** Inicializa o módulo Python */
export function initPythonEnv(): void {
    if (manager) return;
    manager = new PythonEnvironmentManager();
    console.log('[Python] Módulo inicializado');
}

/** Retorna o singleton PythonEnvironmentManager */
export function getPythonEnv(): PythonEnvironmentManager {
    if (!manager) {
        initPythonEnv();
    }
    return manager!;
}

/**
 * Garante setup do Python de forma idempotente para qualquer processo
 * (main Electron ou backend standalone).
 */
export function ensurePythonEnvSetup(): Promise<void> {
    const env = getPythonEnv();
    if (!setupPromise) {
        setupPromise = env.setup().catch((err) => {
            // Permite retry em caso de falha transitória no setup
            setupPromise = null;
            throw err;
        });
    }
    return setupPromise;
}

export { PythonEnvironmentManager } from './environment-manager';
