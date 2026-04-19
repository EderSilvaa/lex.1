/**
 * Brain — Replay Engine
 *
 * Fecha o loop "explore-then-exploit". Antes de o agente chamar browser-use
 * (vision, lento, caro), consulta o grafo: existe um caminho determinístico
 * confiável que leva daqui até o objetivo? Se sim, replay. Se falhar,
 * cai em vision como fallback.
 *
 * Duas APIs:
 *
 *   findReplayPlan({ tribunal, pjeContext })
 *     → procura um flow node matching; retorna sequência de ações com metadata
 *       (tool, input, expected_next_state). Consumidor executa em ordem e
 *       valida domHash resultante.
 *
 *   findNextBestAction({ currentPageStateId })
 *     → useful quando não há flow completo, mas o próximo melhor step
 *       pode ser inferido. Retorna a ação e seu score.
 *
 * Importante: replay não CHAMA nada. Só retorna um plano. Executor decide.
 */

import type { BrainStore } from './brain-store';
import type { BrainEdge, BrainNode } from './types';
import {
    EXPLOIT_THRESHOLD, MIN_OBSERVATIONS, isExploitable, scoreEdge,
} from './scoring';
import { findSimilarIntent } from './intent-similarity';
import { adaptiveTimeoutMs } from './percentiles';

export interface ReplayStep {
    actionId: string;
    tool: string;
    input: Record<string, unknown>;
    /** page_state esperado APÓS esta ação. Executor deve validar domHash. */
    expectedNextStateId?: string;
    expectedNextLabel?: string;
    expectedNextDomHash?: string;
    expectedNextCanonicalStateKey?: string;
    score: number;
    observedCount: number;
    /** Seletor primário (extraído de input.selector/css/target) pro waterfall. */
    primarySelector?: string;
    /** Candidatos alternativos rankeados por success_count (do selectors table). */
    alternateSelectors?: string[];
    /** Timeout adaptativo em ms = p95(durationHistory) * 2, clampado. */
    adaptiveTimeoutMs?: number;
    /** Tribunal + pjeContext do page_state de partida — usado pra lookup. */
    stateTribunal?: string;
    stateContext?: string;
}

export interface ReplayPlan {
    /** Flow node id que originou o plano (se aplicável). */
    flowId?: string;
    flowLabel?: string;
    startPageStateId: string;
    steps: ReplayStep[];
    /** Score agregado do plano. Executor pode exigir >= threshold. */
    confidence: number;
    /** Descrição human-readable, pra log/UI. */
    summary: string;
}

export interface FindPlanOptions {
    tribunal?: string;
    pjeContext?: string;
    /** Se true, exige TODAS as arestas acima de EXPLOIT_THRESHOLD. Default: true. */
    strict?: boolean;
    /** Score mínimo agregado do plano. Default: 0.7. */
    minConfidence?: number;
    /**
     * Goal em linguagem natural — habilita fallback por similaridade semântica
     * quando não há match exato de (tribunal, pjeContext).
     */
    goal?: string;
    /** Threshold de Jaccard para match semântico. Default: 0.4. */
    semanticThreshold?: number;
}

/**
 * Encontra o melhor plano de replay para um (tribunal, contexto).
 * Retorna null se não houver flow confiável. Nunca retorna plano parcial.
 */
export function findReplayPlan(
    brain: BrainStore,
    opts: FindPlanOptions,
): ReplayPlan | null {
    const minConf = opts.minConfidence ?? EXPLOIT_THRESHOLD;
    const strict = opts.strict ?? true;

    // 1. Busca flows compatíveis pelo label (tribunal:pjeContext:hash).
    const allFlows = brain.getNodesByType('flow', 200);
    let flows = allFlows.filter(f => {
        const tribunal = String(f.data?.['tribunal'] || '').toUpperCase();
        const wantedTribunal = String(opts.tribunal || '').toUpperCase();
        const contexts = [
            String(f.data?.['pjeContext'] || ''),
            String(f.data?.['canonicalContext'] || ''),
        ].filter(Boolean);
        return (!wantedTribunal || tribunal === wantedTribunal)
            && (!opts.pjeContext || contexts.includes(opts.pjeContext) || f.label.startsWith(`${opts.tribunal || 'unknown'}:${opts.pjeContext}`));
    });

    // 2. Fallback semântico: se não achou por label e temos o goal em texto,
    // tenta matching por similaridade contra goals historicamente atendidos
    // por flows (guardados em data.goalExamples ou label human-readable).
    if (flows.length === 0 && opts.goal) {
        const candidates = allFlows.map(f => ({
            goal: String(f.data?.['pjeContext'] || '') + ' ' + String(f.data?.['tribunal'] || ''),
            flow: f,
        }));
        const hit = findSimilarIntent(opts.goal, candidates, opts.semanticThreshold ?? 0.4);
        if (hit) flows = [hit.candidate.flow];
    }

    if (flows.length === 0) return null;

    // Ordena por confidence do flow e instances.
    const sorted = flows.sort((a, b) => {
        const ai = Number(a.data?.['instances']) || 0;
        const bi = Number(b.data?.['instances']) || 0;
        if (bi !== ai) return bi - ai;
        return (b.confidence || 0) - (a.confidence || 0);
    });

    for (const flow of sorted) {
        const plan = buildPlanFromFlow(brain, flow, { strict, minConfidence: minConf });
        if (plan && plan.confidence >= minConf) return plan;
    }

    return null;
}

/**
 * Monta o plano seguindo as arestas do flow node. Walk: flow -> starts_at
 * -> page_state; depois alterna performs/results_in até esgotar as actions
 * marcadas como part_of desse flow.
 */
function buildPlanFromFlow(
    brain: BrainStore,
    flow: BrainNode,
    opts: { strict: boolean; minConfidence: number },
): ReplayPlan | null {
    const startEdges = brain.getEdgesFrom(flow.id, 'starts_at');
    if (startEdges.length === 0) return null;

    const bestStart = startEdges.sort((a, b) => b.weight - a.weight)[0]!;
    const startState = brain.getNode(bestStart.targetId);
    if (!startState || startState.type !== 'page_state') return null;
    if (startState.data?.['invalidated']) return null;

    // Actions do flow, na ordem em que aparecem seguindo performs/results_in.
    const partOfEdges = brain.getEdgesTo(flow.id, 'part_of');
    const flowActionIds = new Set(partOfEdges.map(e => e.sourceId));

    const steps: ReplayStep[] = [];
    let currentStateId = startState.id;
    const visited = new Set<string>([currentStateId]);

    while (true) {
        const performs = brain.getEdgesFrom(currentStateId, 'performs')
            .filter(e => flowActionIds.has(e.targetId));
        if (performs.length === 0) break;

        const best = pickBestEdge(brain, performs);
        if (!best) break;

        const target = brain.getNode(best.edge.targetId);
        if (!target || target.type !== 'action') break;
        if (visited.has(target.id)) break;
        visited.add(target.id);

        if (opts.strict && !isExploitable(best.edge, target)) {
            return null; // strict: qualquer aresta fraca invalida o plano
        }

        const results = brain.getEdgesFrom(target.id, 'results_in');
        let expectedNext: BrainNode | null = null;
        if (results.length > 0) {
            const bestResult = pickBestEdge(brain, results);
            if (bestResult) expectedNext = brain.getNode(bestResult.edge.targetId);
        }

        const input = (target.data?.['input'] as Record<string, unknown>) || {};
        const primarySelector = extractSelector(input);
        const currentState = brain.getNode(currentStateId);
        const stateTribunal = String(currentState?.data?.['tribunal'] || '') || undefined;
        const stateContext = String(currentState?.data?.['pjeContext'] || '') || undefined;

        // Alternatives: seletores conhecidos pro mesmo (tribunal, context),
        // exceto o primário. Rankeados por success_count (lookupSelectors).
        let alternateSelectors: string[] | undefined;
        if (primarySelector && stateTribunal && stateContext) {
            try {
                const all = brain.lookupSelectors(stateTribunal, stateContext);
                alternateSelectors = all.filter(s => s !== primarySelector).slice(0, 5);
            } catch { /* ignore */ }
        }

        const history = Array.isArray(target.data?.['durationHistory'])
            ? (target.data!['durationHistory'] as number[])
            : undefined;

        steps.push({
            actionId: target.id,
            tool: String(target.data?.['tool'] || target.label.split(':')[0] || 'unknown'),
            input,
            expectedNextStateId: expectedNext?.id,
            expectedNextLabel: expectedNext?.label,
            expectedNextDomHash: expectedNext
                ? String(expectedNext.data?.['domHash'] || expectedNext.data?.['rawDomHash'] || '') || undefined
                : undefined,
            expectedNextCanonicalStateKey: expectedNext
                ? String(expectedNext.data?.['canonicalStateKey'] || '') || undefined
                : undefined,
            score: best.score,
            observedCount: best.edge.weight,
            primarySelector,
            alternateSelectors,
            adaptiveTimeoutMs: adaptiveTimeoutMs(history, { floorMs: 3000, ceilMs: 30000 }),
            stateTribunal,
            stateContext,
        });

        if (!expectedNext || expectedNext.type !== 'page_state') break;
        if (expectedNext.data?.['invalidated']) return null;
        if (visited.has(expectedNext.id)) break;
        visited.add(expectedNext.id);
        currentStateId = expectedNext.id;
    }

    if (steps.length === 0) return null;

    const confidence = steps.reduce((sum, s) => sum + s.score, 0) / steps.length;
    if (confidence < opts.minConfidence) return null;

    return {
        flowId: flow.id,
        flowLabel: flow.label,
        startPageStateId: startState.id,
        steps,
        confidence,
        summary: buildSummary(flow, steps),
    };
}

/**
 * Dado o page_state atual (mesmo sem flow completo), sugere a próxima ação
 * mais confiável. Útil quando o agente está "perdido" no meio de uma tarefa.
 */
export function findNextBestAction(
    brain: BrainStore,
    currentPageStateId: string,
    opts: { minObservations?: number } = {},
): ReplayStep | null {
    const minObs = opts.minObservations ?? MIN_OBSERVATIONS;
    const state = brain.getNode(currentPageStateId);
    if (!state || state.type !== 'page_state' || state.data?.['invalidated']) return null;

    const performs = brain.getEdgesFrom(currentPageStateId, 'performs')
        .filter(e => e.weight >= minObs);
    if (performs.length === 0) return null;

    const best = pickBestEdge(brain, performs);
    if (!best || best.score < EXPLOIT_THRESHOLD) return null;

    const action = brain.getNode(best.edge.targetId);
    if (!action || action.type !== 'action') return null;

    const results = brain.getEdgesFrom(action.id, 'results_in');
    let expected: BrainNode | null = null;
    if (results.length > 0) {
        const br = pickBestEdge(brain, results);
        if (br) expected = brain.getNode(br.edge.targetId);
    }

    return {
        actionId: action.id,
        tool: String(action.data?.['tool'] || action.label.split(':')[0] || 'unknown'),
        input: (action.data?.['input'] as Record<string, unknown>) || {},
        expectedNextStateId: expected?.id,
        expectedNextLabel: expected?.label,
        score: best.score,
        observedCount: best.edge.weight,
    };
}

/**
 * Feedback loop: executor chama isso após tentar um replay.
 *   success=true  → reforça as arestas do plano (boost duplo).
 *   success=false → reduz staleFactor das actions usadas; se falhou na
 *                    primeira ação, o flow inteiro perde confiança.
 */
export function recordReplayOutcome(
    brain: BrainStore,
    plan: ReplayPlan,
    outcome: {
        success: boolean;
        /** Índice da ação que falhou (se success=false). */
        failedAtStep?: number;
    },
): void {
    const tx = brain.db.transaction(() => {
        if (outcome.success) {
            // Reforça todas as arestas do plano + a confidence do flow.
            if (plan.flowId) {
                const fn = brain.getNode(plan.flowId);
                if (fn) {
                    brain.updateNode(plan.flowId, {
                        data: {
                            ...fn.data,
                            replaySuccessCount: Number(fn.data?.['replaySuccessCount'] || 0) + 1,
                            replayLastSuccessAt: Date.now(),
                        },
                        confidence: Math.min(1, (fn.confidence || 0.5) + 0.05),
                    });
                    brain.touchNode(plan.flowId);
                }
            }
            // Boost performs edges (state -> action).
            let prevState = plan.startPageStateId;
            for (const step of plan.steps) {
                brain.boostEdge(prevState, step.actionId, 'performs', 1);
                reinforceReplayAction(brain, step, true);
                if (step.expectedNextStateId) {
                    brain.boostEdge(step.actionId, step.expectedNextStateId, 'results_in', 1);
                    prevState = step.expectedNextStateId;
                }
            }
        } else {
            const failIdx = outcome.failedAtStep ?? 0;
            const failed = plan.steps[failIdx];
            if (failed) {
                reinforceReplayAction(brain, failed, false);
            }
            // Se falhou no primeiro step, degrada confidence do flow.
            if (plan.flowId) {
                const fn = brain.getNode(plan.flowId);
                if (fn) {
                    brain.updateNode(plan.flowId, {
                        data: {
                            ...fn.data,
                            replayFailureCount: Number(fn.data?.['replayFailureCount'] || 0) + 1,
                            replayLastFailureAt: Date.now(),
                            replayFailedAtStep: failIdx,
                        },
                        confidence: Math.max(0, (fn.confidence || 0.5) - (failIdx === 0 ? 0.15 : 0.07)),
                    });
                }
            }
        }
    });

    tx();
}

function reinforceReplayAction(brain: BrainStore, step: ReplayStep, success: boolean): void {
    const node = brain.getNode(step.actionId);
    if (!node) return;

    const staleFactor = Number(node.data?.['staleFactor']) || 1;
    const replaySuccessCount = Number(node.data?.['replaySuccessCount']) || 0;
    const replayFailureCount = Number(node.data?.['replayFailureCount']) || 0;
    const now = Date.now();

    brain.updateNode(step.actionId, {
        data: {
            ...node.data,
            replaySuccessCount: replaySuccessCount + (success ? 1 : 0),
            replayFailureCount: replayFailureCount + (success ? 0 : 1),
            replayLastSuccessAt: success ? now : node.data?.['replayLastSuccessAt'],
            replayLastFailureAt: success ? node.data?.['replayLastFailureAt'] : now,
            staleFactor: success ? Math.min(1.5, staleFactor + 0.1) : Math.max(0, staleFactor - 0.3),
        },
        confidence: success
            ? Math.min(1, (node.confidence || 0.5) + 0.03)
            : Math.max(0, (node.confidence || 0.5) - 0.08),
    });

    if (step.primarySelector && step.stateTribunal && step.stateContext) {
        try {
            if (success) brain.recordSelectorSuccess(step.stateTribunal, step.stateContext, step.primarySelector);
            else brain.recordSelectorFailure(step.stateTribunal, step.stateContext, step.primarySelector);
        } catch {
            /* selector feedback is best-effort */
        }
    }
}

// ── internals ────────────────────────────────────────────────────────────────

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

function extractSelector(input: Record<string, unknown>): string | undefined {
    const candidates = ['selector', 'css', 'css_selector', 'target'];
    for (const key of candidates) {
        const v = input[key];
        if (typeof v === 'string' && v.length > 0 && v.length < 200) return v;
    }
    return undefined;
}

function buildSummary(flow: BrainNode, steps: ReplayStep[]): string {
    const tribunal = flow.data?.['tribunal'] || 'unknown';
    const ctx = flow.data?.['pjeContext'] || 'flow';
    const tools = steps.map(s => s.tool).join(' → ');
    return `[${tribunal}/${ctx}] ${steps.length} steps: ${tools}`;
}
