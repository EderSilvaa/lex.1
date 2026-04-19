/**
 * Brain — Invalidação em cascata.
 *
 * Quando o PJe muda layout, o domHash estrutural de um page_state muda —
 * logo, um NOVO page_state é criado com outro label. O page_state antigo
 * fica "órfão": continua no grafo com weight alto, mas aquele HTML não
 * existe mais. Selectors e actions downstream dele também ficam suspeitos.
 *
 * Esta função marca em cascata:
 *   - page_state obsoleto   → data.invalidated = true
 *   - actions que só eram usadas a partir dele → staleFactor decrescente
 *   - selectors associados ao domHash → successCount zerado, pendente revalidação
 *
 * NÃO deleta nada: a política aqui é conservadora. O Dream (consolidação)
 * é quem faz prune depois de um período de carência.
 */

import type { BrainStore } from './brain-store';
import type { BrainNode } from './types';

export interface InvalidationResult {
    pageStateId: string;
    invalidatedActions: number;
    stalenedSelectors: number;
}

/**
 * Marca um page_state como obsoleto e propaga para vizinhos imediatos.
 * Idempotente: chamadas repetidas só re-afirmam o estado.
 */
export function invalidatePageState(
    brain: BrainStore,
    pageStateId: string,
): InvalidationResult {
    const node = brain.getNode(pageStateId);
    if (!node || node.type !== 'page_state') {
        return { pageStateId, invalidatedActions: 0, stalenedSelectors: 0 };
    }

    brain.updateNode(pageStateId, {
        data: { ...node.data, invalidated: true, invalidatedAt: Date.now() },
    });

    let invalidatedActions = 0;
    let stalenedSelectors = 0;

    // Actions que resultam nesse page_state (results_in) ou partem dele (performs):
    // reduz staleFactor. Não deleta — replay pode ainda valer se hash mudar só
    // parcialmente e a ação continuar válida.
    const tx = brain.db.transaction(() => {
        const incoming = brain.getEdgesTo(pageStateId, 'results_in');
        const outgoing = brain.getEdgesFrom(pageStateId, 'performs');

        const affectedActionIds = new Set<string>();
        for (const e of incoming) affectedActionIds.add(e.sourceId);
        for (const e of outgoing) affectedActionIds.add(e.targetId);

        for (const actionId of affectedActionIds) {
            const a = brain.getNode(actionId);
            if (!a || a.type !== 'action') continue;
            const prev = Number(a.data?.['staleFactor']) || 1;
            const next = Math.max(0, prev - 0.5);
            brain.updateNode(actionId, {
                data: { ...a.data, staleFactor: next, stalenedAt: Date.now() },
            });
            invalidatedActions += 1;
        }

        // Selectors: se o tribunal+contexto do page_state batem com selector
        // node, zera successCount pra forçar revalidação na próxima tentativa.
        const tribunal = node.data?.['tribunal'];
        const pjeContext = node.data?.['pjeContext'];
        if (tribunal && pjeContext) {
            const selectors = findSelectorsByContext(brain, String(tribunal), String(pjeContext));
            for (const sel of selectors) {
                brain.updateNode(sel.id, {
                    data: {
                        ...sel.data,
                        successCount: 0,
                        stalenedAt: Date.now(),
                    },
                });
                stalenedSelectors += 1;
            }
        }
    });

    tx();

    return { pageStateId, invalidatedActions, stalenedSelectors };
}

/**
 * Heurística: quando um NOVO page_state com mesmo (tribunal, pjeContext)
 * e domHash DIFERENTE passa a ser visto repetidamente, o antigo é candidato
 * a invalidação. Esta função é chamada pelo Dream/consolidator periodicamente.
 *
 * Retorna os ids invalidados.
 */
export function invalidateStalePageStates(
    brain: BrainStore,
    opts: { minNewObservations?: number } = {},
): string[] {
    const minNew = opts.minNewObservations ?? 5;
    const invalidated: string[] = [];

    const allStates = brain.getNodesByType('page_state', 1000);
    // Agrupa por (tribunal, pjeContext) — é a "identidade lógica" da página.
    const byKey = new Map<string, BrainNode[]>();
    for (const n of allStates) {
        const key = `${n.data?.['tribunal'] || '?'}::${n.data?.['pjeContext'] || '?'}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(n);
    }

    for (const [, group] of byKey) {
        if (group.length < 2) continue;
        // Mais recente por accessedAt.
        const sorted = [...group].sort((a, b) => b.accessedAt - a.accessedAt);
        const newest = sorted[0]!;

        // Quantas observações tem o novo? Usa soma de weights de arestas entrantes.
        const incomingEdges = brain.getEdgesTo(newest.id);
        const newObs = incomingEdges.reduce((sum, e) => sum + e.weight, 0);
        if (newObs < minNew) continue;

        // Invalida todos os antigos do grupo que ainda não foram invalidados.
        for (const old of sorted.slice(1)) {
            if (old.data?.['invalidated']) continue;
            invalidatePageState(brain, old.id);
            invalidated.push(old.id);
        }
    }

    return invalidated;
}

/**
 * Busca selectors vinculados a um contexto. Usa os campos `tribunal` e
 * `context` guardados no data do node. Schema frouxo (selector é tabela
 * separada historicamente) — este helper é best-effort.
 */
function findSelectorsByContext(
    brain: BrainStore,
    tribunal: string,
    context: string,
): BrainNode[] {
    const all = brain.getNodesByType('selector', 500);
    return all.filter(n =>
        n.data?.['tribunal'] === tribunal &&
        n.data?.['context'] === context,
    );
}
