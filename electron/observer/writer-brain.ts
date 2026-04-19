/**
 * Observer — Brain Writer
 *
 * Traduz Observation[] em operações no BrainStore:
 *   - page_state nodes (antes/depois)
 *   - action nodes (tool + input_hash)
 *   - edges: performs, results_in
 *   - selector nodes (se input tiver 'selector'/'css')
 *
 * Usa boostEdge() para reforço por uso: arestas repetidas sobem weight.
 * Roda em transação única por batch (SQLite write lock → performance).
 */

import { createHash } from 'crypto';
import type { BrainStore } from '../brain/brain-store';
import type { BrainNode, BrainNodeType } from '../brain/types';
import { canonicalStateLabel, normalizeActionInput, normalizePageStateData } from '../brain/normalizer';
import { pushSample } from '../brain/percentiles';
import type { Observation } from './types';

function sha256(s: string): string {
    return createHash('sha256').update(s).digest('hex');
}

function shortHash(s: string, n = 12): string {
    return sha256(s).slice(0, n);
}

/** Label canônico de um page_state: "<tribunal>:<domHash>" (12 chars). */
function pageStateLabel(tribunal: string | undefined, domHash: string | undefined, data: Record<string, any>): string | null {
    const canonical = canonicalStateLabel({ ...data, tribunal, domHash }, domHash);
    if (canonical) return canonical;
    if (!domHash) return null;
    return `${tribunal || 'unknown'}:${domHash.slice(0, 12)}`;
}

/** Label canônico de uma action: "<tool>:<inputHash>". */
function actionLabel(tool: string, input: Record<string, unknown>): string {
    const serialized = (() => {
        try { return JSON.stringify(input); } catch { return String(input); }
    })();
    return `${tool}:${shortHash(serialized)}`;
}

/**
 * Upsert genérico por type+label: se existe, retorna e faz touchNode; senão cria.
 * Implementado com getNodeByTypeAndLabel (já existente no BrainStore).
 */
function upsertNode(
    brain: BrainStore,
    type: BrainNodeType,
    label: string,
    data: Record<string, any>,
): BrainNode {
    const existing = brain.getNodeByTypeAndLabel(type, label);
    if (existing) {
        brain.touchNode(existing.id);
        return existing;
    }
    return brain.addNode(type, label, data, { confidence: 0.3, source: 'observer' });
}

/** Garante aresta com boost: se existe, incrementa weight; senão cria com weight=1. */
function upsertEdge(
    brain: BrainStore,
    sourceId: string,
    targetId: string,
    relation: 'performs' | 'results_in' | 'fails_to' | 'part_of' | 'starts_at',
    data: Record<string, any> = {},
): void {
    // addEdge usa INSERT OR IGNORE pela UNIQUE(source,target,relation).
    brain.addEdge(sourceId, targetId, relation, data);
    brain.boostEdge(sourceId, targetId, relation, 1.0);
}

/**
 * Aplica um batch de Observations ao Brain. Retorna nada — erros são logados.
 */
export function writeBatchToBrain(brain: BrainStore, batch: Observation[]): void {
    if (batch.length === 0) return;

    const tx = brain.db.transaction(() => {
        for (const obs of batch) {
            try {
                writeSingle(brain, obs);
            } catch (err: any) {
                console.warn('[Observer] Falha ao gravar obs:', err?.message || err);
            }
        }
    });

    try {
        tx();
    } catch (err: any) {
        console.error('[Observer] Transação falhou:', err?.message || err);
    }
}

function writeSingle(brain: BrainStore, obs: Observation): void {
    // Action sempre grava (mesmo em erro, pra aprender o que não funciona).
    // Contadores persistem ENTRE observações — lemos o estado atual do node
    // (se existir) e incrementamos. Isso alimenta o signal `success` do scoring.
    const canonicalInput = normalizeActionInput(obs.tool, obs.input);
    const actLabel = actionLabel(obs.tool, canonicalInput);
    const existingAction = brain.getNodeByTypeAndLabel('action', actLabel);
    const prevSuccess = Number(existingAction?.data?.['successCount']) || 0;
    const prevFailure = Number(existingAction?.data?.['failureCount']) || 0;
    const successCount = prevSuccess + (obs.success ? 1 : 0);
    const failureCount = prevFailure + (obs.success ? 0 : 1);

    // Histograma rolling de durações — alimenta timeout adaptativo no replay.
    const prevHistory = Array.isArray(existingAction?.data?.['durationHistory'])
        ? (existingAction!.data!['durationHistory'] as number[])
        : [];
    const durationHistory = pushSample(prevHistory, obs.durationMs);

    const actionData = {
        tool: obs.tool,
        server: obs.server,
        input: obs.input,
        rawInput: obs.input,
        canonicalInput,
        outputHash: obs.outputHash,
        outputSize: obs.outputSize,
        durationMs: obs.durationMs,
        durationHistory,
        lastSuccess: obs.success,
        lastError: obs.error,
        successCount,
        failureCount,
    };

    const action = upsertNode(brain, 'action', actLabel, actionData);
    // upsert retorna o nó antigo em existing — precisamos atualizar data sempre.
    if (existingAction) {
        brain.updateNode(action.id, {
            data: { ...existingAction.data, ...actionData },
        });
    }

    // page_state antes (se enricher capturou).
    let stateBefore: BrainNode | null = null;
    if (obs.before) {
        const stateData = normalizePageStateData({
            url: obs.before.url,
            title: obs.before.title,
            domHash: obs.before.domHash,
            tribunal: obs.before.tribunal,
            pjeContext: obs.before.pjeContext,
            canonicalUrl: obs.before.canonicalUrl,
            canonicalContext: obs.before.canonicalContext,
            canonicalStateKey: obs.before.canonicalStateKey,
        });
        const label = pageStateLabel(obs.before.tribunal, obs.before.domHash, stateData);
        if (label) {
            stateBefore = upsertNode(brain, 'page_state', label, stateData);
            brain.updateNode(stateBefore.id, { data: { ...stateBefore.data, ...stateData } });
        }
    }

    // page_state depois (gravado SEMPRE que o enricher capturou, mas o tipo
    // de aresta muda: results_in em sucesso, fails_to em falha). Em falha
    // o domHash depois é útil pra descobrir "onde fui parar quando falhei".
    let stateAfter: BrainNode | null = null;
    if (obs.after) {
        const tribunal = obs.after.tribunal || obs.before?.tribunal;
        const pjeContext = obs.after.pjeContext || obs.before?.pjeContext;
        const stateData = normalizePageStateData({
            url: obs.after.url,
            title: obs.after.title,
            domHash: obs.after.domHash,
            tribunal,
            pjeContext,
            canonicalUrl: obs.after.canonicalUrl,
            canonicalContext: obs.after.canonicalContext,
            canonicalStateKey: obs.after.canonicalStateKey,
            newTabs: obs.after.newTabs,
        });
        const label = pageStateLabel(tribunal, obs.after.domHash, stateData);
        if (label) {
            stateAfter = upsertNode(brain, 'page_state', label, stateData);
            brain.updateNode(stateAfter.id, { data: { ...stateAfter.data, ...stateData } });
        }
    }

    // Arestas do grafo de fluxo.
    // 'performs' sempre liga o state antes à ação, inclusive em falhas:
    // queremos saber "o que foi TENTADO nesse estado", pra ponderar no replay.
    // traceId vai no data pra permitir reconstruir a sequência completa de
    // um goal depois (eval harness, debug, UI de explicabilidade).
    const edgeData: Record<string, any> = { ts: obs.ts };
    if (obs.traceId) edgeData['traceId'] = obs.traceId;

    if (stateBefore) {
        upsertEdge(brain, stateBefore.id, action.id, 'performs', edgeData);
    }
    if (stateAfter) {
        const relation = obs.success ? 'results_in' : 'fails_to';
        upsertEdge(brain, action.id, stateAfter.id, relation, edgeData);
    }

    // Se o input tiver um seletor CSS, reforça o selector node (reutiliza
    // infra existente: recordSelectorSuccess no BrainStore).
    const selector = extractSelector(obs.input);
    if (selector && obs.before?.tribunal && obs.before?.pjeContext && obs.success) {
        try {
            brain.recordSelectorSuccess(obs.before.tribunal, obs.before.pjeContext, selector);
        } catch {
            /* ignore — método pode não existir em versões antigas */
        }
    }
}

function extractSelector(input: Record<string, unknown>): string | null {
    const candidates = ['selector', 'css', 'css_selector', 'target'];
    for (const key of candidates) {
        const v = input[key];
        if (typeof v === 'string' && v.length > 0 && v.length < 200) {
            return v;
        }
    }
    return null;
}
