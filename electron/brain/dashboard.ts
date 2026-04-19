/**
 * Brain — Dashboard aggregations
 *
 * Consulta prontas para a UI mostrar:
 *   - top flows (ordenados por instances * confidence)
 *   - replay hit rate (últimos N dias)
 *   - traces recentes (com duração / sucesso)
 *   - selectors com alta taxa de falha (candidatos a retrabalho)
 *
 * Nenhum cálculo pesado aqui — só agrega o que já existe no grafo.
 */

import type { BrainStore } from './brain-store';
import { listRecentTraces, getTrace } from './trace-query';
import { crossConfirmations } from './federated-trust';

export interface TopFlowItem {
    flowId: string;
    label: string;
    tribunal?: string;
    pjeContext?: string;
    tools: string[];
    instances: number;
    confidence: number;
    trustMultiplier: number;
    crossConfirmations: number;
    lastDetectedAt?: number;
}

export interface DashboardOverview {
    topFlows: TopFlowItem[];
    replayHitRate: { windowDays: number; hits: number; total: number; rate: number };
    recentTraces: Array<{
        traceId: string;
        goal?: string;
        durationMs: number;
        steps: number;
        successRate: number;
    }>;
    problemSelectors: Array<{
        id: string;
        label: string;
        tribunal?: string;
        context?: string;
        successCount: number;
        failureCount: number;
    }>;
    stats: {
        totalNodes: number;
        totalEdges: number;
        pageStates: number;
        actions: number;
        flows: number;
        invalidatedPageStates: number;
    };
}

export function getDashboardOverview(
    brain: BrainStore,
    opts: { windowDays?: number; topFlowsLimit?: number } = {},
): DashboardOverview {
    const windowDays = opts.windowDays ?? 7;
    const topN = opts.topFlowsLimit ?? 10;

    const flows = brain.getNodesByType('flow', 500);
    const topFlows: TopFlowItem[] = flows
        .map(f => {
            const instances = Number(f.data?.['instances']) || 0;
            const cross = crossConfirmations(brain, f.label);
            return {
                flowId: f.id,
                label: f.label,
                tribunal: f.data?.['tribunal'],
                pjeContext: f.data?.['pjeContext'],
                tools: Array.isArray(f.data?.['tools']) ? f.data['tools'] : [],
                instances,
                confidence: f.confidence || 0.5,
                trustMultiplier: Number(f.data?.['trustMultiplier']) || 1,
                crossConfirmations: cross,
                lastDetectedAt: Number(f.data?.['lastDetectedAt']) || f.updatedAt,
            };
        })
        .sort((a, b) => (b.instances * b.confidence) - (a.instances * a.confidence))
        .slice(0, topN);

    // Replay hit rate: varre actions recentes — action node com data.replayHit
    // não existe ainda; por ora aproximamos contando arestas 'results_in'
    // com data.ts no window como "sucesso de execução" (baseline).
    const replayHitRate = computeReplayHitRate(brain, windowDays);

    // Traces recentes: pega 10 mais novos e enriquece.
    const traces = listRecentTraces(brain, 10);
    const recentTraces = traces.map(t => {
        const full = getTrace(brain, t.traceId);
        return {
            traceId: t.traceId,
            goal: undefined,
            durationMs: full?.durationMs ?? 0,
            steps: full?.steps.length ?? t.stepCount,
            successRate: full?.successRate ?? 0,
        };
    });

    // Selectors com failureCount alto — candidatos a revalidar.
    const selectors = brain.getNodesByType('selector', 200);
    const problemSelectors = selectors
        .map(s => ({
            id: s.id,
            label: s.label,
            tribunal: s.data?.['tribunal'],
            context: s.data?.['context'],
            successCount: Number(s.data?.['successCount']) || 0,
            failureCount: Number(s.data?.['failureCount']) || 0,
        }))
        .filter(s => s.failureCount > 0 && s.failureCount >= s.successCount)
        .sort((a, b) => b.failureCount - a.failureCount)
        .slice(0, 10);

    const stats = computeStats(brain);

    return { topFlows, replayHitRate, recentTraces, problemSelectors, stats };
}

function computeStats(brain: BrainStore): DashboardOverview['stats'] {
    const c = (type: string) => {
        const row = brain.db.prepare('SELECT COUNT(*) AS n FROM nodes WHERE type = ?').get(type) as any;
        return Number(row?.n) || 0;
    };
    const totalNodes = (brain.db.prepare('SELECT COUNT(*) AS n FROM nodes').get() as any)?.n || 0;
    const totalEdges = (brain.db.prepare('SELECT COUNT(*) AS n FROM edges').get() as any)?.n || 0;
    const invalidated = (brain.db.prepare(`
        SELECT COUNT(*) AS n FROM nodes
        WHERE type = 'page_state' AND data LIKE '%"invalidated":true%'
    `).get() as any)?.n || 0;

    return {
        totalNodes: Number(totalNodes) || 0,
        totalEdges: Number(totalEdges) || 0,
        pageStates: c('page_state'),
        actions: c('action'),
        flows: c('flow'),
        invalidatedPageStates: Number(invalidated) || 0,
    };
}

function computeReplayHitRate(
    brain: BrainStore,
    windowDays: number,
): DashboardOverview['replayHitRate'] {
    const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    // Proxy: actions executadas no window com lastSuccess=true vs total.
    const rows = brain.db.prepare(`
        SELECT data FROM nodes
        WHERE type = 'action' AND updated_at >= ?
    `).all(since) as any[];

    let hits = 0;
    let total = 0;
    for (const r of rows) {
        try {
            const d = JSON.parse(r.data);
            total += 1;
            if (d?.lastSuccess === true) hits += 1;
        } catch { /* skip */ }
    }
    return {
        windowDays,
        hits,
        total,
        rate: total > 0 ? hits / total : 0,
    };
}
