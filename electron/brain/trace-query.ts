/**
 * Brain — Trace queries.
 *
 * Reconstrói a sequência de ações de uma trace (goal do usuário) a partir
 * das arestas que carregam `traceId` no data. Útil para:
 *   - debug "o que a LEX fez pra resolver esse goal"
 *   - eval harness (compara traces de mesmo goal ao longo do tempo)
 *   - UI de explicabilidade
 */

import type { BrainStore } from './brain-store';
import type { BrainEdge, BrainNode } from './types';

export interface TraceStep {
    ts: number;
    actionId: string;
    tool: string;
    success: boolean;
    durationMs: number;
    fromStateId: string;
    toStateId?: string;
    /** Etiqueta do page_state resultante (ou falha): útil pra agrupamento. */
    toStateLabel?: string;
}

export interface TraceSummary {
    traceId: string;
    startTs: number;
    endTs: number;
    durationMs: number;
    steps: TraceStep[];
    successRate: number;
    toolsUsed: string[];
}

/**
 * Busca todas as edges com um dado traceId, ordena por ts, e materializa
 * a sequência (state → action → state → action …) que ocorreu naquela trace.
 */
export function getTrace(brain: BrainStore, traceId: string): TraceSummary | null {
    // Não há índice por data.traceId — varre arestas. Aceitável: assumimos
    // que queries de trace são raras (debug/eval), não hot path.
    const allEdges = brain.db.prepare(`
        SELECT id, source_id, target_id, relation, weight, data, created_at, updated_at
        FROM edges
        WHERE data LIKE ?
    `).all(`%"traceId":"${traceId}"%`) as any[];

    if (allEdges.length === 0) return null;

    const edges: BrainEdge[] = allEdges.map(r => ({
        id: r.id,
        sourceId: r.source_id,
        targetId: r.target_id,
        relation: r.relation,
        weight: r.weight,
        data: safeParse(r.data),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    }));

    // Agrupa por action: cada action tem um 'performs' (inbound) e possivelmente
    // um 'results_in'/'fails_to' (outbound).
    const actionIds = new Set<string>();
    for (const e of edges) {
        if (e.relation === 'performs') actionIds.add(e.targetId);
    }

    const steps: TraceStep[] = [];
    for (const actionId of actionIds) {
        const actionNode = brain.getNode(actionId);
        if (!actionNode || actionNode.type !== 'action') continue;

        const performsEdge = edges.find(e => e.relation === 'performs' && e.targetId === actionId);
        const resultEdge = edges.find(
            e => (e.relation === 'results_in' || e.relation === 'fails_to') && e.sourceId === actionId,
        );

        if (!performsEdge) continue;

        const ts = Number(performsEdge.data?.['ts']) || performsEdge.createdAt;
        let toNode: BrainNode | null = null;
        if (resultEdge) toNode = brain.getNode(resultEdge.targetId);

        steps.push({
            ts,
            actionId,
            tool: String(actionNode.data?.['tool'] || 'unknown'),
            success: resultEdge ? resultEdge.relation === 'results_in' : Boolean(actionNode.data?.['lastSuccess']),
            durationMs: Number(actionNode.data?.['durationMs']) || 0,
            fromStateId: performsEdge.sourceId,
            toStateId: toNode?.id,
            toStateLabel: toNode?.label,
        });
    }

    steps.sort((a, b) => a.ts - b.ts);
    if (steps.length === 0) return null;

    const startTs = steps[0]!.ts;
    const endTs = steps[steps.length - 1]!.ts;
    const successes = steps.filter(s => s.success).length;
    const toolsUsed = Array.from(new Set(steps.map(s => s.tool)));

    return {
        traceId,
        startTs,
        endTs,
        durationMs: endTs - startTs,
        steps,
        successRate: successes / steps.length,
        toolsUsed,
    };
}

/**
 * Lista traces recentes (por ts mais novo) — útil pra UI mostrar "últimas
 * atividades da LEX". Distinct por traceId.
 */
export function listRecentTraces(
    brain: BrainStore,
    limit = 20,
): Array<{ traceId: string; lastTs: number; stepCount: number }> {
    const rows = brain.db.prepare(`
        SELECT data, created_at
        FROM edges
        WHERE data LIKE '%"traceId"%'
        ORDER BY created_at DESC
        LIMIT 5000
    `).all() as any[];

    const byId = new Map<string, { lastTs: number; stepCount: number }>();
    for (const r of rows) {
        const data = safeParse(r.data);
        const id = data?.['traceId'];
        if (!id) continue;
        const ts = Number(data?.['ts']) || r.created_at;
        const entry = byId.get(id);
        if (entry) {
            entry.stepCount += 1;
            entry.lastTs = Math.max(entry.lastTs, ts);
        } else {
            byId.set(id, { lastTs: ts, stepCount: 1 });
        }
    }

    return Array.from(byId.entries())
        .map(([traceId, v]) => ({ traceId, ...v }))
        .sort((a, b) => b.lastTs - a.lastTs)
        .slice(0, limit);
}

function safeParse(s: any): Record<string, any> {
    if (typeof s !== 'string') return {};
    try { return JSON.parse(s); } catch { return {}; }
}
