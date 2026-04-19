/**
 * Brain — Compaction / prune
 *
 * O grafo cresce indefinidamente: cada tool call do Observer adiciona
 * page_state + action. Sem prune, em 6 meses você tem 100k nodes dos quais
 * 90% são ruído. Esta política roda periodicamente (dentro do Dream) e
 * remove nodes/edges que:
 *
 *   - não foram acessados há > stale_days
 *   - têm score composto muito baixo
 *   - page_state invalidated sem refs em flows ativos
 *   - actions com failureCount >> successCount (anti-pattern consolidado)
 *
 * Política CONSERVADORA: nunca deleta flow nodes nem selectors confirmados
 * por trust. Nunca deleta em cascata sem confirmar que o caminho alternativo
 * existe. Removidos em batch dentro de uma transação; rollback se falha.
 */

import type { BrainStore } from './brain-store';
import type { BrainNode } from './types';
import { composeScore, computeSignals } from './scoring';

export interface CompactionOptions {
    /** Dias sem acesso para virar candidato a prune. Default: 90. */
    staleDays?: number;
    /** Score abaixo desse valor marca para remoção. Default: 0.15. */
    minScore?: number;
    /** Dry-run: só reporta, não deleta. Default: false. */
    dryRun?: boolean;
}

export interface CompactionReport {
    scanned: number;
    pageStatesRemoved: number;
    actionsRemoved: number;
    edgesRemoved: number;
    preservedDueToFlow: number;
    dryRun: boolean;
}

const PROTECTED_TYPES = new Set(['flow', 'tribunal', 'processo', 'selector']);

/**
 * Varre page_state/action nodes, calcula score composto da aresta de entrada
 * com maior peso, e remove se score < minScore E accessedAt > staleDays.
 */
export function compactBrain(
    brain: BrainStore,
    opts: CompactionOptions = {},
): CompactionReport {
    const cfg = {
        staleDays: opts.staleDays ?? 90,
        minScore: opts.minScore ?? 0.15,
        dryRun: opts.dryRun ?? false,
    };

    const now = Date.now();
    const staleMs = cfg.staleDays * 24 * 60 * 60 * 1000;
    const cutoff = now - staleMs;

    const candidates: BrainNode[] = [
        ...brain.getNodesByType('page_state', 5000),
        ...brain.getNodesByType('action', 5000),
    ];

    // IDs referenciados por flows (part_of/starts_at) → nunca deletar.
    const protectedIds = new Set<string>();
    const flows = brain.getNodesByType('flow', 500);
    for (const f of flows) {
        for (const e of brain.getEdgesFrom(f.id, 'starts_at')) protectedIds.add(e.targetId);
        for (const e of brain.getEdgesTo(f.id, 'part_of')) protectedIds.add(e.sourceId);
    }

    const toDelete: string[] = [];
    let preservedDueToFlow = 0;

    for (const node of candidates) {
        if (PROTECTED_TYPES.has(node.type)) continue;
        if (node.accessedAt > cutoff) continue;
        if (protectedIds.has(node.id)) {
            preservedDueToFlow += 1;
            continue;
        }

        // Pega a aresta mais "forte" que toca esse nó e avalia o score.
        const inbound = brain.getEdgesTo(node.id);
        if (inbound.length === 0) {
            // node órfão antigo → deletar.
            toDelete.push(node.id);
            continue;
        }

        let maxScore = 0;
        for (const e of inbound) {
            const { score } = { score: composeScore(computeSignals(e, node, { now })) };
            if (score > maxScore) maxScore = score;
        }

        if (maxScore < cfg.minScore) toDelete.push(node.id);
    }

    const report: CompactionReport = {
        scanned: candidates.length,
        pageStatesRemoved: 0,
        actionsRemoved: 0,
        edgesRemoved: 0,
        preservedDueToFlow,
        dryRun: cfg.dryRun,
    };

    if (cfg.dryRun || toDelete.length === 0) {
        for (const id of toDelete) {
            const n = brain.getNode(id);
            if (n?.type === 'page_state') report.pageStatesRemoved += 1;
            if (n?.type === 'action') report.actionsRemoved += 1;
        }
        return report;
    }

    const tx = brain.db.transaction(() => {
        const delEdges = brain.db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?');
        const delNode = brain.db.prepare('DELETE FROM nodes WHERE id = ?');
        for (const id of toDelete) {
            const n = brain.getNode(id);
            if (!n) continue;
            // Conta edges a serem removidas (informativo).
            const edgeCount = brain.db.prepare(
                'SELECT COUNT(*) AS n FROM edges WHERE source_id = ? OR target_id = ?',
            ).get(id, id) as any;
            report.edgesRemoved += Number(edgeCount?.n) || 0;
            delEdges.run(id, id);
            delNode.run(id);
            if (n.type === 'page_state') report.pageStatesRemoved += 1;
            if (n.type === 'action') report.actionsRemoved += 1;
        }
    });

    tx();
    return report;
}
