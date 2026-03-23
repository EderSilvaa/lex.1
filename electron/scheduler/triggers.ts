/**
 * Event Triggers (Phase 2 AIOS — Autonomia)
 *
 * Triggers não-temporais: file watcher, PJe movimentação polling, manual.
 * Cada trigger retorna um TriggerHandle com dispose() para cleanup.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TriggerConfig, TriggerHandle, GoalId } from './types';

const DEBOUNCE_MS = 5000;
const DEFAULT_POLL_MS = 30 * 60 * 1000; // 30min

type TriggerCallback = () => void;

// ============================================================================
// FILE CHANGE TRIGGER
// ============================================================================

export function createFileChangeTrigger(
    goalId: GoalId,
    config: TriggerConfig,
    onTrigger: TriggerCallback
): TriggerHandle | null {
    const watchPath = config.watchPath;
    if (!watchPath || !fs.existsSync(watchPath)) {
        console.warn(`[Trigger] Caminho não existe: ${watchPath}`);
        return null;
    }

    let debounceTimer: NodeJS.Timeout | null = null;
    const extensions = config.watchExtensions?.map(e => e.startsWith('.') ? e : `.${e}`) || [];

    const watcher = fs.watch(watchPath, { recursive: true }, (_event, filename) => {
        if (!filename) return;

        // Filtra por extensão se especificado
        if (extensions.length > 0) {
            const ext = path.extname(filename).toLowerCase();
            if (!extensions.includes(ext)) return;
        }

        // Debounce
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            console.log(`[Trigger] File change detectado: ${filename} (goal: ${goalId})`);
            onTrigger();
        }, DEBOUNCE_MS);
    });

    console.log(`[Trigger] File watcher ativo: ${watchPath} (goal: ${goalId})`);

    return {
        goalId,
        type: 'file_change',
        dispose: () => {
            watcher.close();
            if (debounceTimer) clearTimeout(debounceTimer);
            console.log(`[Trigger] File watcher encerrado: ${watchPath}`);
        },
    };
}

// ============================================================================
// PJe MOVIMENTAÇÃO TRIGGER (polling)
// ============================================================================

export function createPjeMovimentacaoTrigger(
    goalId: GoalId,
    config: TriggerConfig,
    onTrigger: TriggerCallback
): TriggerHandle | null {
    const { processoNumero, tribunal } = config;
    if (!processoNumero) {
        console.warn('[Trigger] PJe trigger sem número de processo');
        return null;
    }

    const pollMs = config.pollIntervalMs || DEFAULT_POLL_MS;
    let lastHash: string | null = null;
    let disposed = false;
    let orchestratorInstance: any = null;

    const getOrchestrator = async () => {
        if (!orchestratorInstance) {
            const { Orchestrator } = await import('../agent/orchestrator');
            orchestratorInstance = new Orchestrator(1);
        }
        return orchestratorInstance;
    };

    const check = async () => {
        if (disposed) return;

        try {
            // Usa o agent loop para consultar movimentações
            const orchestrator = await getOrchestrator();
            const tribunalStr = tribunal ? ` no ${tribunal}` : '';
            const result = await orchestrator.execute(
                `Consulte as últimas movimentações do processo ${processoNumero}${tribunalStr}. Retorne apenas as movimentações.`
            );

            // Compara hash para detectar mudanças
            const hash = simpleHash(result);
            if (lastHash !== null && hash !== lastHash) {
                console.log(`[Trigger] Nova movimentação PJe: ${processoNumero} (goal: ${goalId})`);
                onTrigger();
            }
            lastHash = hash;
        } catch (err: any) {
            console.warn(`[Trigger] Erro ao verificar PJe ${processoNumero}:`, err.message);
        }
    };

    // Primeira verificação após 5s (dá tempo do app inicializar)
    const firstTimer = setTimeout(check, 5000);
    const interval = setInterval(check, pollMs);

    console.log(`[Trigger] PJe polling ativo: ${processoNumero} a cada ${pollMs / 60000}min (goal: ${goalId})`);

    return {
        goalId,
        type: 'pje_movimentacao',
        dispose: () => {
            disposed = true;
            clearTimeout(firstTimer);
            clearInterval(interval);
            console.log(`[Trigger] PJe polling encerrado: ${processoNumero}`);
        },
    };
}

// ============================================================================
// TRIGGER FACTORY
// ============================================================================

export function createTrigger(
    goalId: GoalId,
    config: TriggerConfig,
    onTrigger: TriggerCallback
): TriggerHandle | null {
    switch (config.type) {
        case 'file_change':
            return createFileChangeTrigger(goalId, config, onTrigger);
        case 'pje_movimentacao':
            return createPjeMovimentacaoTrigger(goalId, config, onTrigger);
        case 'manual':
            // Manual triggers são disparados via IPC, sem watcher
            return { goalId, type: 'manual', dispose: () => {} };
        case 'webhook':
            // Stub — seria um HTTP server
            console.warn('[Trigger] Webhook triggers não implementados ainda');
            return { goalId, type: 'webhook', dispose: () => {} };
        default:
            return null;
    }
}

// ============================================================================
// UTILS
// ============================================================================

function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString(36);
}
