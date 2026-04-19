/**
 * LEX Brain — Types
 *
 * Tipos do grafo de conhecimento juridico.
 * Nodes = entidades, Edges = relacoes, FTS5 = busca.
 */

// ============================================================================
// NODE TYPES
// ============================================================================

export type BrainNodeType =
    | 'processo'
    | 'tese'
    | 'parte'
    | 'aprendizado'
    | 'tribunal'
    | 'selector'
    | 'prazo'
    | 'decisao'
    // Observer — fluxo de automação aprendido a partir de tool calls MCP.
    | 'page_state'    // estado de página: {tribunal}:{dom_hash_estrutural}
    | 'action'        // ação executada: {tool}:{input_hash}
    | 'flow';         // padrão nomeado (ex: tjpa:consultar_processo)

export type BrainEdgeRelation =
    | 'has_tese'
    | 'has_parte'
    | 'has_decisao'
    | 'has_prazo'
    | 'from_tribunal'
    | 'related_to'
    | 'learned_from'
    | 'selector_for'
    // Observer — arestas do grafo de fluxo.
    | 'performs'      // page_state → action
    | 'results_in'    // action → page_state (sucesso)
    | 'fails_to'      // action → page_state (falhou DAQUI: anti-pattern)
    | 'part_of'       // action → flow
    | 'starts_at';    // flow → page_state

export interface BrainNode {
    id: string;
    type: BrainNodeType;
    label: string;
    data: Record<string, any>;
    confidence: number;
    source: string;
    createdAt: number;
    updatedAt: number;
    accessedAt: number;
}

export interface BrainEdge {
    id: string;
    sourceId: string;
    targetId: string;
    relation: BrainEdgeRelation;
    weight: number;
    data: Record<string, any>;
    createdAt: number;
    updatedAt: number;
}

// ============================================================================
// SEARCH & GRAPH
// ============================================================================

export interface BrainSearchResult {
    node: BrainNode;
    rank: number;
    snippet?: string;
}

export interface BrainGraphData {
    nodes: BrainNode[];
    edges: BrainEdge[];
}

export interface BrainContextResult {
    text: string;
    charCount: number;
    nodeIds: string[];
}

// ============================================================================
// INTERACTIONS (replaces Memory.interacoes)
// ============================================================================

export interface InteractionRow {
    id: string;
    objetivo: string;
    resposta: string;
    passos: number;
    duracao: number;
    sucesso: number; // 0 or 1
    createdAt: number;
}

// ============================================================================
// SELECTORS (replaces selector-memory.ts)
// ============================================================================

export interface SelectorRow {
    id: string;
    tribunal: string;
    context: string;
    selectorCss: string;
    successCount: number;
    failureCount: number;
    lastUsed: number;
    lastSuccessful: string | null;
}

export interface SelectorAnalytics {
    totalEntries: number;
    totalLookups: number;
    totalHits: number;
    totalMisses: number;
    byTribunal: Record<string, { entries: number; avgSuccess: number }>;
}

// ============================================================================
// DREAM
// ============================================================================

export type DreamPhase =
    | 'policy'
    | 'inventory'
    | 'normalize'
    | 'consolidate'
    | 'staleness'
    | 'flow'
    | 'promote'
    | 'prune'
    | 'compaction'
    | 'render'
    | 'evaluate'
    | 'rollback';

export interface DreamPhasePolicy {
    normalize: boolean;
    consolidate: boolean;
    staleness: boolean;
    flow: boolean;
    promote: boolean;
    prune: boolean;
    compaction: boolean;
    render: boolean;
}

export interface DreamConfig {
    staleThresholdDays: number;
    minConfidenceForKeep: number;
    selectorPromoteThreshold: number;
    maxLLMCalls: number;
    dryRun: boolean;
    allowMerge: boolean;
    allowPrune: boolean;
    allowCompaction: boolean;
    renderMarkdown: boolean;
    lockTimeoutMs: number;
    phases: Partial<DreamPhasePolicy>;
    autoRollbackOnDanger: boolean;
}

export const DEFAULT_DREAM_CONFIG: DreamConfig = {
    staleThresholdDays: 30,
    minConfidenceForKeep: 0.3,
    selectorPromoteThreshold: 5,
    maxLLMCalls: 10,
    dryRun: false,
    allowMerge: true,
    allowPrune: true,
    allowCompaction: true,
    renderMarkdown: true,
    lockTimeoutMs: 10 * 60 * 1000,
    phases: {},
    autoRollbackOnDanger: false,
};

export interface DreamReport {
    phase: DreamPhase;
    actions: string[];
    nodesAffected: number;
    risk?: {
        level: 'low' | 'medium' | 'high';
        reasons: string[];
    };
    explanations?: string[];
    planned?: boolean;
    skipped?: boolean;
    error?: string;
}

export interface DreamMetrics {
    nodeCount: number;
    edgeCount: number;
    byType: Record<string, number>;
    pageStates: number;
    actions: number;
    flows: number;
    selectors: number;
    invalidatedPageStates: number;
    replayEdges: number;
    failedEdges: number;
    avgConfidence: number;
}

export type DreamEvaluationVerdict = 'improved' | 'neutral' | 'regressed' | 'danger';

export interface DreamEvaluation {
    verdict: DreamEvaluationVerdict;
    score: number;
    reasons: string[];
    deltas: Record<string, number>;
}

export interface DreamRunReport {
    runId: string;
    dryRun: boolean;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    totalAffected: number;
    metricsBefore?: DreamMetrics;
    metricsAfter?: DreamMetrics;
    evaluation?: DreamEvaluation;
    policy?: DreamPhasePolicy;
    snapshotPath?: string;
    skipped?: boolean;
    reason?: string;
    error?: string;
    reports: DreamReport[];
}

export interface DreamHistoryItem {
    runId: string;
    dryRun: boolean;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    totalAffected: number;
    snapshotPath?: string;
    verdict?: DreamEvaluationVerdict;
    errorCount: number;
    skipped?: boolean;
}

export interface DreamRestoreResult {
    ok: boolean;
    snapshotPath: string;
    restoredAt: string;
    nodesRestored: number;
    edgesRestored: number;
    error?: string;
}

// ============================================================================
// EXPORT / IMPORT
// ============================================================================

export interface BrainExportManifest {
    version: number;
    exportedAt: string;
    nodeCount: number;
    edgeCount: number;
    excludedTypes: BrainNodeType[];
    /** 'patterns' = só conhecimento reutilizável (sem dados de processo). */
    mode?: 'full' | 'patterns';
}
