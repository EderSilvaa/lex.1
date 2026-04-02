/**
 * LEX Brain — Dream Consolidator
 *
 * Inspirado em "dream consolidation" (neuroscience): processa memórias
 * enquanto o sistema está em repouso para melhorar a qualidade do grafo.
 *
 * Fases:
 *   1. Inventory  — identifica candidatos (stale, orphan, duplicate-like)
 *   2. Consolidate — merge nós semelhantes (label diff < 15%)
 *   3. Promote    — aumenta confiança de nós muito acessados
 *   4. Prune      — remove nós obsoletos (stale + baixa confiança)
 *   5. Render     — gera Markdown atualizado
 *
 * Disparo automático: quando dream_session_count >= triggerEveryN (default 5)
 */

import type { BrainStore } from './brain-store';
import type { BrainNode, DreamConfig, DreamReport } from './types';
import { DEFAULT_DREAM_CONFIG } from './types';
import { renderBrainMarkdown } from './brain-renderer';

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Executa um ciclo de dream. Retorna relatório das ações tomadas.
 * Não usa LLM — apenas heurísticas para manter custo zero.
 */
export async function runDream(
    brain: BrainStore,
    config: Partial<DreamConfig> = {},
): Promise<DreamReport[]> {
    const cfg: DreamConfig = { ...DEFAULT_DREAM_CONFIG, ...config };
    const reports: DreamReport[] = [];

    console.log('[Dream] Iniciando ciclo de consolidação...');

    // Phase 1: Inventory
    const { staleNodes, orphanNodes } = inventoryPhase(brain, cfg);
    reports.push({
        phase: 'inventory',
        actions: [
            `${staleNodes.length} nós obsoletos identificados`,
            `${orphanNodes.length} nós órfãos identificados`,
        ],
        nodesAffected: staleNodes.length + orphanNodes.length,
    });

    // Phase 2: Consolidate (merge near-duplicates)
    const consolidateReport = consolidatePhase(brain);
    reports.push(consolidateReport);

    // Phase 3: Promote (boost high-access nodes)
    const promoteReport = promotePhase(brain);
    reports.push(promoteReport);

    // Phase 4: Prune (remove stale + orphan low-confidence nodes)
    const pruneReport = prunePhase(brain, staleNodes, orphanNodes, cfg);
    reports.push(pruneReport);

    // Phase 5: Render Markdown
    try {
        const { fileCount } = await renderBrainMarkdown(brain);
        reports.push({
            phase: 'render',
            actions: [`${fileCount} arquivos Markdown atualizados`],
            nodesAffected: 0,
        });
    } catch (err: any) {
        reports.push({
            phase: 'render',
            actions: [`Render falhou: ${err.message}`],
            nodesAffected: 0,
        });
    }

    // Reset dream session counter
    brain.setMetadata('dream_session_count', '0');
    brain.setMetadata('dream_last_run', new Date().toISOString());

    const totalAffected = reports.reduce((s, r) => s + r.nodesAffected, 0);
    console.log(`[Dream] Ciclo completo. ${totalAffected} nós afetados.`);

    return reports;
}

/**
 * Verifica se deve disparar o dream baseado no session count.
 */
export function shouldRunDream(brain: BrainStore, triggerEveryN = 5): boolean {
    const count = parseInt(brain.getMetadata('dream_session_count') || '0', 10);
    return count >= triggerEveryN;
}

// ============================================================================
// PHASES
// ============================================================================

interface InventoryResult {
    staleNodes: BrainNode[];
    orphanNodes: BrainNode[];
}

function inventoryPhase(brain: BrainStore, cfg: DreamConfig): InventoryResult {
    const staleCutoffMs = cfg.staleThresholdDays * 24 * 60 * 60 * 1000;
    const staleNodes = brain.getStaleNodes(staleCutoffMs, cfg.minConfidenceForKeep);
    const orphanNodes = brain.getOrphanNodes();
    return { staleNodes, orphanNodes };
}

function consolidatePhase(brain: BrainStore): DreamReport {
    const actions: string[] = [];
    let nodesAffected = 0;

    // Find near-duplicate nodes of same type (Levenshtein-like via prefix match)
    // Strategy: group by (type, label.toLowerCase().substring(0,20))
    // If 2+ nodes share the same prefix group, merge smaller into larger
    const allNodes = brain.getFullGraph().nodes;
    const groups = new Map<string, BrainNode[]>();

    for (const node of allNodes) {
        // Skip processos and partes — too risky to merge
        if (node.type === 'processo' || node.type === 'parte') continue;
        const key = `${node.type}::${normalizeLabel(node.label).substring(0, 30)}`;
        const group = groups.get(key) || [];
        group.push(node);
        groups.set(key, group);
    }

    for (const [key, nodes] of groups) {
        if (nodes.length < 2) continue;

        // Keep the one with highest confidence + access recency
        const sorted = [...nodes].sort((a, b) => {
            const scoreA = a.confidence + (a.accessedAt / 1e13);
            const scoreB = b.confidence + (b.accessedAt / 1e13);
            return scoreB - scoreA;
        });

        const keep = sorted[0]!;
        const toMerge = sorted.slice(1);

        for (const dup of toMerge) {
            try {
                brain.mergeNodes(keep.id, dup.id);
                actions.push(`Merged: "${dup.label}" → "${keep.label}" [${keep.type}]`);
                nodesAffected++;
            } catch (err) {
                // Edge already exists or other constraint — skip
            }
        }
    }

    if (actions.length === 0) actions.push('Nenhum duplicado encontrado');

    return { phase: 'consolidate', actions, nodesAffected };
}

function promotePhase(brain: BrainStore): DreamReport {
    const actions: string[] = [];
    let nodesAffected = 0;

    // Promote nodes accessed in the last 7 days with confidence < 0.9
    const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allNodes = brain.getFullGraph().nodes;

    for (const node of allNodes) {
        if (node.accessedAt >= cutoff7d && node.confidence < 0.9) {
            const newConf = Math.min(0.9, node.confidence + 0.1);
            brain.updateNode(node.id, { confidence: newConf });
            nodesAffected++;
        }
    }

    actions.push(`${nodesAffected} nós com acesso recente tiveram confiança aumentada`);
    return { phase: 'promote', actions, nodesAffected };
}

function prunePhase(
    brain: BrainStore,
    staleNodes: BrainNode[],
    orphanNodes: BrainNode[],
    cfg: DreamConfig,
): DreamReport {
    const actions: string[] = [];
    let nodesAffected = 0;

    // Prune stale orphans (both stale AND orphan AND low confidence)
    const staleIds = new Set(staleNodes.map(n => n.id));
    const toDelete: BrainNode[] = [];

    for (const node of orphanNodes) {
        if (staleIds.has(node.id) && node.confidence < cfg.minConfidenceForKeep) {
            toDelete.push(node);
        }
    }

    if (toDelete.length > 0) {
        brain.deleteNodes(toDelete.map(n => n.id));
        for (const n of toDelete) {
            actions.push(`Pruned: "${n.label}" [${n.type}] (conf=${n.confidence.toFixed(2)})`);
        }
        nodesAffected = toDelete.length;
    }

    if (actions.length === 0) actions.push('Nenhum nó podado');

    return { phase: 'prune', actions, nodesAffected };
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeLabel(label: string): string {
    return label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
