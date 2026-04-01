/**
 * DataJud Pipeline — Entry Point
 *
 * Inicializa stores, sync engine e exporta API pública.
 */

import { initProcessoStore } from './processo-store';
import { initJurisprudenciaStore } from './jurisprudencia-store';
import { SyncEngine } from './sync-engine';

let _engine: SyncEngine | null = null;

// ── Init / Stop ──────────────────────────────────────────────────────

export async function initDataPipeline(): Promise<void> {
    // Inicializa stores
    initProcessoStore();
    initJurisprudenciaStore();

    // Cria e inicia sync engine
    _engine = new SyncEngine();
    await _engine.start();

    console.log('[DataPipeline] Inicializado');
}

export function stopDataPipeline(): void {
    if (_engine) {
        _engine.stop();
        _engine = null;
    }
}

export function getSyncEngine(): SyncEngine | null {
    return _engine;
}

// ── Re-exports ───────────────────────────────────────────────────────

// Types
export type {
    UserLegalProfile, MonitoredProcesso,
    ProcessoDataJud, DataJudParte, DataJudMovimentacao,
    StoredDecisao,
    SyncState, SyncEvent, SyncResult, DataPipelineStats,
} from './types';

// User Profile
export {
    getProfile, saveProfile,
    setTribunais, setAreasAtuacao, setKeywords,
    addMonitoredProcesso, removeMonitoredProcesso, updateMonitoredProcesso,
    getMonitoredProcessos, getActiveProcessos,
    setDataJudApiKey, getDataJudApiKey, hasDataJudApiKey,
} from './user-profile';

// Processo Store (HOT)
export {
    upsertProcesso, getProcesso, getAllProcessos,
    getProcessosByTribunal, removeProcesso,
    getProcessoStoreStats,
} from './processo-store';

// Jurisprudencia Store (WARM)
export {
    addDecisoes, searchDecisoes,
    getDecisoesByArea, getDecisoesByTribunal, getAllDecisoes,
    getJurisprudenciaStats,
} from './jurisprudencia-store';

// DataJud Client
export { DataJudClient, DATAJUD_TRIBUNAIS, inferTribunalFromCNJ, hashMovimentacoes } from './datajud-client';

// Sync Engine
export { SyncEngine } from './sync-engine';
