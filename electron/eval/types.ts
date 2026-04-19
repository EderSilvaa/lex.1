/**
 * Eval Harness — Types
 *
 * Cada run mede: a LEX resolveu a tarefa? Em quanto tempo? Quantas tool calls?
 * Usou replay determinístico ou vision? Os snapshots acumulam ao longo das
 * semanas — gráfico temporal mostra se a LEX está REALMENTE aprendendo.
 */

export interface EvalTask {
    /** ID estável da tarefa. Usado como chave pra comparar runs ao longo do tempo. */
    id: string;
    /** Descrição do objetivo (input pro pje_browser_use ou agent loop). */
    goal: string;
    /** Tribunal alvo, se aplicável. */
    tribunal?: string;
    /** Critério de sucesso (substring esperada no output final, regex, etc). */
    expect?: {
        outputContains?: string[];
        outputMatches?: string; // regex
        minOutputLength?: number;
    };
    /** Tags pra filtrar subsets (ex: 'smoke', 'pje', 'consulta'). */
    tags?: string[];
    /** Limite de tempo do run em ms. Default: 300_000 (5min). */
    timeoutMs?: number;
}

export interface EvalRunMetrics {
    taskId: string;
    /** Iso timestamp de quando o run foi executado. */
    runAt: string;
    /** Duração total do goal. */
    durationMs: number;
    /** Sucesso final (agent reportou success + expectations bateram). */
    success: boolean;
    /** Número de tool_use do LLM dentro do run. */
    toolCalls: number;
    /** true se uma das tentativas passou por replay determinístico bem-sucedido. */
    replayHit: boolean;
    /** Se replay hit, qual foi o flow que acertou. */
    replayFlow?: string;
    /** Confidence do plano de replay, se aplicável. */
    replayConfidence?: number;
    /** Erros encontrados (não fatais). */
    errors: string[];
    /** Output final (trimmed pra 1000 chars). */
    output: string;
    /** traceId gerado pelo withTrace, pra cross-referência com Brain. */
    traceId?: string;
}

export interface EvalSnapshot {
    /** ISO timestamp. */
    at: string;
    /** Hash curto do commit atual (git rev-parse --short HEAD), se disponível. */
    commit?: string;
    /** Config do sistema (provider, modelo, mode do observer). */
    env: Record<string, string>;
    runs: EvalRunMetrics[];
    /** Agregados úteis pra visualização. */
    summary: {
        totalRuns: number;
        successRate: number;
        avgDurationMs: number;
        avgToolCalls: number;
        replayHitRate: number;
    };
}
