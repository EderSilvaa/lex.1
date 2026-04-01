/**
 * DataJud Pipeline — Types
 *
 * Modelos para o pipeline de dados jurídicos:
 * - Perfil do advogado (tribunais, áreas, processos monitorados)
 * - Dados do DataJud (processos, movimentações, partes)
 * - Jurisprudência armazenada (decisões dos tribunais)
 * - Estado de sincronização (HOT/WARM/COLD)
 */

// ═══════════════════════════════════════════════════════════════════════
// PERFIL DO ADVOGADO
// ═══════════════════════════════════════════════════════════════════════

export interface UserLegalProfile {
    /** Tribunais onde o advogado atua (ex: ['TJPA', 'TRT8', 'TRF1']) */
    tribunais: string[];
    /** Áreas de atuação (ex: ['trabalhista', 'civil']) */
    areasAtuacao: string[];
    /** Keywords para WARM sync (ex: ['rescisão indireta', 'dano moral']) */
    keywords: string[];
    /** Processos monitorados (HOT polling) */
    processosMonitorados: MonitoredProcesso[];
    /** API key DataJud (encriptada) — armazenada separadamente */
    updatedAt: string;
}

export interface MonitoredProcesso {
    /** Número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO */
    numero: string;
    /** Código do tribunal (ex: 'TJPA') */
    tribunal: string;
    /** Nome amigável (ex: "Caso Silva vs Empresa XYZ") */
    apelido?: string;
    /** Hash da última movimentação conhecida (para detectar mudanças) */
    ultimaMovimentacaoHash?: string;
    /** Data ISO da última movimentação conhecida */
    ultimaMovimentacaoData?: string;
    /** Quando o usuário adicionou este processo */
    adicionadoEm: string;
    /** Se está ativo para polling */
    ativo: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// DADOS DO DATAJUD (CNJ)
// ═══════════════════════════════════════════════════════════════════════

export interface ProcessoDataJud {
    numero: string;
    classe: string;
    assunto: string;
    tribunal: string;
    orgaoJulgador: string;
    dataAjuizamento: string;
    grau: string;
    nivelSigilo: number;
    partes: DataJudParte[];
    movimentacoes: DataJudMovimentacao[];
    /** Metadado de sync */
    _fetchedAt: string;
}

export interface DataJudParte {
    nome: string;
    tipo: string;  // 'AUTOR', 'REU', 'ADVOGADO', 'TERCEIRO', etc.
    documento?: string;
}

export interface DataJudMovimentacao {
    codigo: number;
    nome: string;
    dataHora: string;
    complemento?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// JURISPRUDÊNCIA ARMAZENADA
// ═══════════════════════════════════════════════════════════════════════

export interface StoredDecisao {
    /** ID único: `${tribunal}:${numero}` */
    id: string;
    tribunal: string;
    numero: string;
    ementa: string;
    data?: string;
    relator?: string;
    url?: string;
    area?: string;
    keywords: string[];
    /** Como foi obtida */
    fonte: 'sync' | 'search';
    fetchedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════
// SYNC ENGINE
// ═══════════════════════════════════════════════════════════════════════

export type DataTemperature = 'hot' | 'warm' | 'cold';

export interface SyncState {
    lastHotSync: string | null;
    lastWarmSync: string | null;
    hotSyncIntervalMs: number;    // default: 30min
    warmSyncIntervalMs: number;   // default: 24h
    /** Última sync por processo (numero → ISO timestamp) */
    processoLastSync: Record<string, string>;
    /** Erros consecutivos (para backoff) */
    consecutiveErrors: number;
    lastError?: string;
}

export interface SyncResult {
    type: 'hot' | 'warm';
    checked: number;
    newItems: number;
    errors: number;
    durationMs: number;
}

export interface SyncEvent {
    type:
        | 'hot_start' | 'hot_result' | 'hot_complete'
        | 'warm_start' | 'warm_result' | 'warm_complete'
        | 'movement_detected' | 'error';
    data: any;
    timestamp: string;
}

export interface DataPipelineStats {
    profileConfigured: boolean;
    hasApiKey: boolean;
    processosMonitorados: number;
    processosAtivos: number;
    decisoesArmazenadas: number;
    lastHotSync: string | null;
    lastWarmSync: string | null;
    consecutiveErrors: number;
}

// ═══════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════

export const DEFAULT_HOT_INTERVAL_MS = 30 * 60 * 1000;   // 30 minutos
export const DEFAULT_WARM_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas
export const MAX_HOT_PROCESSOS = 500;
export const MAX_WARM_DECISOES = 2000;
export const RATE_LIMIT_MS = 800;  // delay entre requests
export const REQUEST_TIMEOUT_MS = 14_000;  // 14s (mesmo do jurisprudencia.ts)
export const MAX_BACKOFF_MS = 4 * 60 * 60 * 1000;  // 4 horas max backoff

export const DEFAULT_SYNC_STATE: SyncState = {
    lastHotSync: null,
    lastWarmSync: null,
    hotSyncIntervalMs: DEFAULT_HOT_INTERVAL_MS,
    warmSyncIntervalMs: DEFAULT_WARM_INTERVAL_MS,
    processoLastSync: {},
    consecutiveErrors: 0,
};

export const DEFAULT_PROFILE: UserLegalProfile = {
    tribunais: [],
    areasAtuacao: [],
    keywords: [],
    processosMonitorados: [],
    updatedAt: new Date().toISOString(),
};
