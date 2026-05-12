/**
 * Observer - Types
 *
 * Shape dos eventos observados e dos enrichers que agregam contexto.
 */

import type { PjeEnvironmentContext } from '../pje/environment-context';

export interface ObservationBefore {
    /** URL normalizada antes da tool. Ex: "https://pje.tjpa.jus.br/busca". */
    url?: string;
    /** Titulo da aba antes da tool. */
    title?: string;
    /** Hash estrutural do DOM antes. */
    domHash?: string;
    /** Tribunal inferido a partir da URL/contexto. Ex: "TJPA". */
    tribunal?: string;
    /** Contexto livre (ex: "consulta_processo"). */
    pjeContext?: string;
    canonicalUrl?: string;
    canonicalContext?: string;
    canonicalStateKey?: string;
    profileKind?: string;
    authState?: string;
    surfaceKind?: string;
    screenFamily?: string;
    areaLabel?: string;
    affordances?: string[];
    canonicalEnvironmentKey?: string;
    environment?: PjeEnvironmentContext;
}

export interface ObservationAfter {
    url?: string;
    title?: string;
    domHash?: string;
    tribunal?: string;
    pjeContext?: string;
    canonicalUrl?: string;
    canonicalContext?: string;
    canonicalStateKey?: string;
    profileKind?: string;
    authState?: string;
    surfaceKind?: string;
    screenFamily?: string;
    areaLabel?: string;
    affordances?: string[];
    canonicalEnvironmentKey?: string;
    environment?: PjeEnvironmentContext;
    /** Novas abas abertas durante a tool (pos-acao). */
    newTabs?: Array<{ id: string; url: string }>;
}

export interface Observation {
    ts: number;
    server: string;         // id do server MCP (ex: "browser", "filesystem")
    tool: string;           // nome prefixado (ex: "browser__navigate")
    input: Record<string, unknown>;     // ja sanitizado (PII mascarada)
    outputPreview: string;  // primeiros 500 chars da saida
    outputHash: string;     // sha256 do output completo
    outputSize: number;     // bytes
    durationMs: number;
    success: boolean;
    error: string | null;
    before: ObservationBefore | null;
    after: ObservationAfter | null;
    /**
     * Identificador da "trace" logica que engloba todas as acoes executadas
     * para um mesmo objetivo do usuario. Permite reconstruir a sequencia
     * completa depois (ex: "quais 15 tool calls fizeram parte do goal X?").
     * Opcional - observacoes isoladas tem traceId=null.
     */
    traceId: string | null;
}

export interface EnricherContext {
    tool: string;           // prefixado
    server: string;
    args: Record<string, unknown>;
}

export interface Enricher {
    /** Chamado ANTES de callTool. Pode retornar metadados (url atual, dom hash). */
    before?(ctx: EnricherContext): Promise<ObservationBefore | null>;

    /** Chamado DEPOIS de callTool (sempre, mesmo em erro). */
    after?(
        ctx: EnricherContext & { output: string; success: boolean },
    ): Promise<ObservationAfter | null>;
}

export type ObserverMode = 'full' | 'sample' | 'off';

export interface ObserverConfig {
    mode: ObserverMode;     // default 'full' (em dev) / 'sample' (prod)
    sampleRate: number;     // 0..1, usado quando mode='sample'
    queueCap: number;       // tamanho maximo da fila em memoria
    flushIntervalMs: number; // intervalo entre flushes
    flushBatchSize: number;  // maximo de eventos por transacao SQLite
}

export const DEFAULT_CONFIG: ObserverConfig = {
    mode: 'full',
    sampleRate: 1.0,
    queueCap: 10_000,
    flushIntervalMs: 1_000,
    flushBatchSize: 100,
};
