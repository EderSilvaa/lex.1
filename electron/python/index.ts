/**
 * Python Module — Entry point.
 *
 * Exporta singleton PythonEnvironmentManager e função de inicialização.
 */

import { PythonEnvironmentManager } from './environment-manager';

let manager: PythonEnvironmentManager | null = null;

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

export { PythonEnvironmentManager } from './environment-manager';
