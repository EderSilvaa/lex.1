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
    | 'decisao';

export type BrainEdgeRelation =
    | 'has_tese'
    | 'has_parte'
    | 'has_decisao'
    | 'has_prazo'
    | 'from_tribunal'
    | 'related_to'
    | 'learned_from'
    | 'selector_for';

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

export type DreamPhase = 'inventory' | 'consolidate' | 'promote' | 'prune' | 'render';

export interface DreamConfig {
    staleThresholdDays: number;
    minConfidenceForKeep: number;
    selectorPromoteThreshold: number;
    maxLLMCalls: number;
}

export const DEFAULT_DREAM_CONFIG: DreamConfig = {
    staleThresholdDays: 30,
    minConfidenceForKeep: 0.3,
    selectorPromoteThreshold: 5,
    maxLLMCalls: 10,
};

export interface DreamReport {
    phase: DreamPhase;
    actions: string[];
    nodesAffected: number;
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
}
