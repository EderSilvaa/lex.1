/**
 * Batch Petitioning Types (Produção em Lote)
 *
 * Sistema de produção em lote de petições com:
 * - Estrategista (agent pai) → Pipeline Controller (waves) → Workers (N×) → Fila de Protocolo
 * - HITL checkpoints (strategy, wave audit, protocol)
 * - Anti-repetição (trigram diffScore)
 * - Auditoria por wave
 */

// ─── IDs ───────────────────────────────────────────────────────────

export type LoteId = string;
export type WaveIndex = number;

// ─── Status ────────────────────────────────────────────────────────

export type LoteStatus =
    | 'created'
    | 'strategy_pending'
    | 'strategy_approved'
    | 'producing'
    | 'wave_review'
    | 'redrafting'
    | 'protocol_pending'
    | 'protocoling'
    | 'completed'
    | 'paused'
    | 'cancelled'
    | 'error';

export type WaveStatus = 'pending' | 'running' | 'review' | 'approved' | 'redrafting';

export type HITLCheckpoint = 'strategy' | 'wave_audit' | 'protocol';
export type HITLSource = 'app' | 'telegram';

// ─── Input ─────────────────────────────────────────────────────────

export interface ProcessoInput {
    numero: string;
    partes?: { autor: string; reu: string };
    tribunal?: string;
    vara?: string;
    valor?: string;
    observacao?: string;
}

// ─── Strategy ──────────────────────────────────────────────────────

export interface StrategyPacket {
    persona: {
        papel: string;       // ex: "Advogado sênior especialista em Direito do Trabalho"
        tom: string;         // ex: "formal, porém objetivo"
        tribunalAlvo: string; // ex: "TRT-2"
    };
    teseMestra: string;       // Argumento jurídico central
    fundamentos: string[];    // Arts., Súmulas, jurisprudência
    variaveis: string[];      // O que muda por processo
    manualDoNunca: string[];  // Restrições anti-padrão-robô
    styleGuide: {
        aberturaVariavel: boolean;  // Variar estrutura de abertura
        objetividade: string;       // "Vá direto ao ponto..."
    };
    processos: ProcessoInput[];
    tipoPeticao: string;      // peticao, apelacao, recurso, contestacao, embargos, etc.
    waveSize: number;          // Tamanho sugerido de cada wave
}

// ─── Reasoning ────────────────────────────────────────────────────

export interface ReasoningStep {
    passo: number;
    titulo: string;
    descricao: string;
}

// ─── Worker ────────────────────────────────────────────────────────

export interface WorkerResult {
    processoId: string;        // Index ou ID único do processo
    numero: string;            // Número CNJ
    partes: { autor: string; reu: string };
    peticao: string;           // Conteúdo HTML
    arquivo: string;           // Caminho do arquivo salvo
    contentHash: string;       // Hash MD5 do conteúdo (para diff)
    diffScore: number;         // % diferenciação vs anteriores (0-100)
    reasoning: ReasoningStep[];// Passos de raciocínio do agente
    valor?: string;
    teseAplicada: string;      // Qual tese/fundamento priorizou
    status: 'completed' | 'failed' | 'needs_redraft';
    error?: string;
}

// ─── Audit ─────────────────────────────────────────────────────────

export interface AuditReport {
    waveIndex: number;
    items: WorkerResult[];
    avgDiffScore: number;
    minDiffScore: number;
    maxDiffScore: number;
    completedCount: number;
    failedCount: number;
    needsRedraftCount: number;
    warnings: string[];        // Items abaixo do threshold
    summary: string;           // Resumo qualitativo (LLM ou auto)
}

// ─── Wave ──────────────────────────────────────────────────────────

export interface Wave {
    index: number;
    processoIds: string[];     // IDs dos processos nesta wave
    items: WorkerResult[];
    status: WaveStatus;
    audit?: AuditReport;
    startedAt?: string;
    completedAt?: string;
    approvedAt?: string;
    approvedVia?: HITLSource;
}

// ─── Protocol ──────────────────────────────────────────────────────

export interface ProtocolResult {
    processoId: string;
    numero: string;
    success: boolean;
    protocolNumber?: string;
    error?: string;
    timestamp: string;
}

// ─── Lote (entidade principal) ─────────────────────────────────────

export interface BatchLote {
    id: LoteId;
    nome: string;
    strategy: StrategyPacket;
    status: LoteStatus;
    waves: Wave[];
    currentWave: number;
    totalProcessos: number;
    createdAt: string;
    updatedAt: string;
    outputDir: string;
    protocolResults?: ProtocolResult[];
    error?: string;
    pausedAt?: string;
    pauseReason?: string;
}

// ─── Events ────────────────────────────────────────────────────────

export type BatchEventType =
    | 'lote_created'
    | 'strategy_ready'
    | 'strategy_approved'
    | 'strategy_updated'
    | 'wave_started'
    | 'worker_progress'
    | 'worker_completed'
    | 'worker_failed'
    | 'worker_reasoning_step'
    | 'wave_completed'
    | 'audit_ready'
    | 'wave_approved'
    | 'redraft_started'
    | 'redraft_completed'
    | 'protocol_pending'
    | 'protocol_started'
    | 'protocol_item'
    | 'protocol_completed'
    | 'lote_completed'
    | 'lote_paused'
    | 'lote_resumed'
    | 'lote_cancelled'
    | 'lote_error'
    | 'hitl_request';

export interface BatchEvent {
    type: BatchEventType;
    loteId: LoteId;
    data?: any;
    timestamp: string;
}

// ─── HITL ──────────────────────────────────────────────────────────

export interface HITLRequest {
    checkpoint: HITLCheckpoint;
    loteId: LoteId;
    requestId: string;         // Unique ID pra matching Telegram callback
    payload: any;              // StrategyPacket, AuditReport, ou lista de items
}

// ─── Config ────────────────────────────────────────────────────────

export const DIFF_SCORE_THRESHOLD = 70;  // Mínimo de diferenciação (%)
export const DEFAULT_WAVE_SIZE = 10;
export const MIN_WAVE_SIZE = 3;
export const MAX_WAVE_SIZE = 20;
export const MAX_CONCURRENT_WORKERS = 5;
export const PROTOCOL_DELAY_MS = 3000;   // Delay entre protocolo no PJe
