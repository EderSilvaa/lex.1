/**
 * Brain — Flow Detection
 *
 * Observer grava só ações soltas. Esta camada acima descobre SEQUÊNCIAS
 * recorrentes de (page_state → action → page_state → action → …) que se
 * repetem K vezes e as promove a um `flow` node.
 *
 * Por que isso importa: o grafo micro é denso demais para o LLM consumir no
 * prompt. Flows são a abstração macro — "para consultar processo no TJPA,
 * este é o caminho de 5 ações". Replay consulta flows primeiro, não ações
 * soltas.
 *
 * Algoritmo (simples e previsível — não ML):
 *
 *   1. Para cada page_state "entrypoint" (com muitos outgoing performs),
 *      faz walks determinísticos seguindo SEMPRE a aresta de maior weight.
 *   2. Cada walk produz uma sequência [state, action, state, action, ...].
 *   3. Sequências com comprimento >= MIN_LEN e "peso mínimo" em todas as
 *      arestas viram candidatos.
 *   4. Agrupa candidatos por (tribunal, pjeContext inicial, comprimento,
 *      ação inicial). Se o mesmo grupo tem >= MIN_INSTANCES observações,
 *      cria/atualiza um flow node e liga via starts_at/part_of.
 *
 * Idempotente: rodar 2x produz o mesmo resultado (upsert por label).
 */

import type { BrainStore } from './brain-store';
import type { BrainEdge, BrainNode } from './types';
import { EXPLOIT_THRESHOLD, scoreEdge } from './scoring';

export interface FlowDetectionOptions {
    /** Tamanho mínimo de uma sequência para virar flow. Default: 3 ações. */
    minActions?: number;
    /** Máximo de ações num flow (evita walks infinitos). Default: 12. */
    maxActions?: number;
    /** Peso mínimo em cada aresta da sequência. Default: 2. */
    minEdgeWeight?: number;
    /** Quantas vezes a mesma forma de sequência precisa aparecer. Default: 2. */
    minInstances?: number;
    enableMicroFlows?: boolean;
}

export interface DetectedFlow {
    flowLabel: string;
    startStateId: string;
    actionIds: string[];
    instances: number;
    averageScore: number;
}

export interface FlowDetectionReport {
    entrypointsScanned: number;
    walksGenerated: number;
    flowsCreated: number;
    flowsUpdated: number;
    detected: DetectedFlow[];
}

const DEFAULTS: Required<FlowDetectionOptions> = {
    minActions: 3,
    maxActions: 12,
    minEdgeWeight: 2,
    minInstances: 2,
    enableMicroFlows: true,
};

/**
 * Ponto de entrada público. Varre o grafo, detecta flows, cria/atualiza nodes.
 */
export function detectFlows(
    brain: BrainStore,
    opts: FlowDetectionOptions = {},
): FlowDetectionReport {
    const cfg = { ...DEFAULTS, ...opts };

    const pageStates = brain.getNodesByType('page_state', 500)
        .filter(s => !s.data?.['invalidated']);

    const walks: WalkResult[] = [];
    for (const start of pageStates) {
        const walk = greedyWalk(brain, start, cfg);
        if (walk && walk.actionIds.length >= cfg.minActions) {
            walks.push(walk);
        } else if (cfg.enableMicroFlows) {
            walks.push(...microWalks(brain, start, cfg));
        }
    }

    // Agrupa walks por forma canônica (tribunal + contexto inicial + tools).
    const groups = new Map<string, WalkResult[]>();
    for (const w of walks) {
        const key = canonicalFlowKey(w);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(w);
    }

    const report: FlowDetectionReport = {
        entrypointsScanned: pageStates.length,
        walksGenerated: walks.length,
        flowsCreated: 0,
        flowsUpdated: 0,
        detected: [],
    };

    for (const [key, instances] of groups) {
        const observedInstances = instances.reduce((sum, item) => sum + item.instances, 0);
        if (observedInstances < cfg.minInstances) continue;

        // Representante com maior score médio.
        const best = [...instances].sort((a, b) => b.avgScore - a.avgScore)[0]!;

        const flowContext = best.startData.canonicalContext || best.startData.pjeContext || 'flow';
        const flowLabel = `${best.startData.tribunal || 'unknown'}:${flowContext}:${shortHash(key)}`;
        const existing = brain.getNodeByTypeAndLabel('flow', flowLabel);

        const flowData = {
            tribunal: best.startData.tribunal,
            pjeContext: best.startData.pjeContext,
            canonicalContext: best.startData.canonicalContext,
            canonicalStateKey: best.startData.canonicalStateKey,
            tools: best.actionTools,
            instances: observedInstances,
            flowKind: best.actionIds.length === 1 ? 'micro' : 'sequence',
            avgScore: best.avgScore,
            lastDetectedAt: Date.now(),
        };

        let flowNode: BrainNode;
        if (existing) {
            brain.updateNode(existing.id, {
                data: { ...existing.data, ...flowData },
                confidence: Math.min(1, (existing.confidence || 0.5) + 0.1),
            });
            brain.touchNode(existing.id);
            flowNode = { ...existing, data: flowData };
            report.flowsUpdated += 1;
        } else {
            flowNode = brain.addNode('flow', flowLabel, flowData, {
                confidence: 0.5,
                source: 'flow-detector',
            });
            report.flowsCreated += 1;
        }

        // Liga flow ao start e às actions (upsert via INSERT OR IGNORE).
        brain.addEdge(flowNode.id, best.startStateId, 'starts_at', { detectedAt: Date.now() });
        brain.boostEdge(flowNode.id, best.startStateId, 'starts_at', 1);

        for (const actionId of best.actionIds) {
            brain.addEdge(actionId, flowNode.id, 'part_of', {});
            brain.boostEdge(actionId, flowNode.id, 'part_of', 1);
        }

        report.detected.push({
            flowLabel,
            startStateId: best.startStateId,
            actionIds: best.actionIds,
            instances: observedInstances,
            averageScore: best.avgScore,
        });
    }

    return report;
}

// ── walks ────────────────────────────────────────────────────────────────────

interface WalkResult {
    startStateId: string;
    startData: {
        tribunal?: string;
        pjeContext?: string;
        canonicalContext?: string;
        canonicalStateKey?: string;
    };
    actionIds: string[];
    actionTools: string[];
    avgScore: number;
    instances: number;
}

/**
 * Walk guloso: do state inicial, segue sempre a aresta 'performs' de MAIOR
 * score composto; da action, segue 'results_in' de maior score; repete até
 * (a) atingir maxActions, (b) não houver aresta acima do threshold, ou
 * (c) entrar em ciclo.
 */
function greedyWalk(
    brain: BrainStore,
    start: BrainNode,
    cfg: Required<FlowDetectionOptions>,
): WalkResult | null {
    const visited = new Set<string>([start.id]);
    const actionIds: string[] = [];
    const actionTools: string[] = [];
    const scores: number[] = [];
    const weights: number[] = [];

    let currentStateId = start.id;

    for (let step = 0; step < cfg.maxActions; step++) {
        const performsEdges = brain.getEdgesFrom(currentStateId, 'performs')
            .filter(e => e.weight >= cfg.minEdgeWeight);
        if (performsEdges.length === 0) break;

        const bestPerform = pickBestEdge(brain, performsEdges);
        if (!bestPerform || bestPerform.score < EXPLOIT_THRESHOLD * 0.7) break; // relaxa pro walk

        const action = brain.getNode(bestPerform.edge.targetId);
        if (!action || action.type !== 'action' || visited.has(action.id)) break;
        visited.add(action.id);

        actionIds.push(action.id);
        actionTools.push(String(action.data?.['tool'] || action.label.split(':')[0] || '?'));
        scores.push(bestPerform.score);
        weights.push(bestPerform.edge.weight);

        // Próximo state
        const resultsEdges = brain.getEdgesFrom(action.id, 'results_in')
            .filter(e => e.weight >= cfg.minEdgeWeight);
        if (resultsEdges.length === 0) break;

        const bestResult = pickBestEdge(brain, resultsEdges);
        if (!bestResult) break;

        const nextState = brain.getNode(bestResult.edge.targetId);
        if (!nextState || nextState.type !== 'page_state' || visited.has(nextState.id)) break;
        visited.add(nextState.id);

        currentStateId = nextState.id;
    }

    if (actionIds.length === 0) return null;

    return {
        startStateId: start.id,
        startData: {
            tribunal: start.data?.['tribunal'],
            pjeContext: start.data?.['pjeContext'],
            canonicalContext: start.data?.['canonicalContext'],
            canonicalStateKey: start.data?.['canonicalStateKey'],
        },
        actionIds,
        actionTools,
        avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        instances: Math.max(1, Math.min(...weights)),
    };
}

function microWalks(
    brain: BrainStore,
    start: BrainNode,
    cfg: Required<FlowDetectionOptions>,
): WalkResult[] {
    const performsEdges = brain.getEdgesFrom(start.id, 'performs')
        .filter(e => e.weight >= cfg.minEdgeWeight);

    const walks: WalkResult[] = [];
    for (const edge of performsEdges) {
        const action = brain.getNode(edge.targetId);
        if (!action || action.type !== 'action') continue;
        const scored = scoreEdge(edge, action);
        if (scored.score < EXPLOIT_THRESHOLD * 0.6) continue;
        walks.push({
            startStateId: start.id,
            startData: {
                tribunal: start.data?.['tribunal'],
                pjeContext: start.data?.['pjeContext'],
                canonicalContext: start.data?.['canonicalContext'],
                canonicalStateKey: start.data?.['canonicalStateKey'],
            },
            actionIds: [action.id],
            actionTools: [String(action.data?.['tool'] || action.label.split(':')[0] || '?')],
            avgScore: scored.score,
            instances: edge.weight,
        });
    }
    return walks;
}

function pickBestEdge(
    brain: BrainStore,
    edges: BrainEdge[],
): { edge: BrainEdge; score: number } | null {
    let best: { edge: BrainEdge; score: number } | null = null;
    for (const e of edges) {
        const target = brain.getNode(e.targetId);
        const { score } = scoreEdge(e, target);
        if (!best || score > best.score) best = { edge: e, score };
    }
    return best;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function canonicalFlowKey(w: WalkResult): string {
    // Tribunal + context inicial + sequência de tools (sem input hash) = forma do flow.
    return [
        w.startData.tribunal || '?',
        w.startData.canonicalContext || w.startData.pjeContext || '?',
        w.startData.canonicalStateKey || '?',
        ...w.actionTools,
    ].join('|');
}

function shortHash(s: string): string {
    // Hash fraco mas estável (não é para segurança, só dedupe de labels).
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36).slice(0, 8);
}
