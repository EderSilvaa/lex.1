/**
 * Brain — Scoring composto para arestas do grafo de fluxo.
 *
 * weight sozinho mente: uma aresta com weight=10 mas última visita há 6 meses
 * não deve ter o mesmo peso que uma aresta weight=5 usada ontem. O score
 * composto combina quatro sinais:
 *
 *   - frequência  (log do weight — evita dominância de caminhos antigos muito batidos)
 *   - recência    (exp decay pelo tempo desde updated_at)
 *   - sucesso     (success_rate lido do node de action alvo, quando aplicável)
 *   - staleness   (penalidade se o alvo é page_state com domHash invalidado)
 *
 * Resultado: [0..1]. Threshold para "exploitable" recomendado: 0.7.
 */

import type { BrainEdge, BrainNode } from './types';

/** Meia-vida padrão da recência: arestas decaem pela metade a cada 30 dias. */
const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/** Weight abaixo desse valor é "explorado pouco" — score freq tende a zero. */
const WEIGHT_ANCHOR = 10;

export interface ScoringSignals {
    /** Número de vezes que a aresta foi reforçada (weight). */
    frequency: number;
    /** 0..1 — decay exponencial pelo tempo desde updatedAt. */
    recency: number;
    /** 0..1 — success_rate do node target, ou 1 se não aplicável. */
    success: number;
    /** 0..1 — 1 = fresh, 0 = totalmente obsoleto (domHash invalidado). */
    freshness: number;
}

export interface ScoringOptions {
    halfLifeMs?: number;
    weightAnchor?: number;
    now?: number;
}

/**
 * Componentes individuais do score. Retornados separados para UI/debug
 * explicar por que um path foi escolhido/rejeitado.
 */
export function computeSignals(
    edge: BrainEdge,
    targetNode: BrainNode | null,
    opts: ScoringOptions = {},
): ScoringSignals {
    const now = opts.now ?? Date.now();
    const halfLife = opts.halfLifeMs ?? HALF_LIFE_MS;
    const anchor = opts.weightAnchor ?? WEIGHT_ANCHOR;

    // Frequência: log-normalizada. weight=1 → ~0.1, weight=10 → ~0.73, weight=50 → ~0.96.
    const frequency = Math.min(1, Math.log1p(edge.weight) / Math.log1p(anchor));

    // Recência: 2^(-dt/halfLife). 30 dias → 0.5, 60 dias → 0.25.
    const dt = Math.max(0, now - edge.updatedAt);
    const recency = Math.pow(2, -dt / halfLife);

    // Sucesso: lê success_rate de action/page_state se presente em data, senão 1.
    let success = 1;
    if (targetNode?.data) {
        const sc = Number(targetNode.data['successCount']);
        const fc = Number(targetNode.data['failureCount']);
        if (Number.isFinite(sc) && Number.isFinite(fc) && sc + fc > 0) {
            success = sc / (sc + fc);
        } else if (targetNode.data['success'] === false) {
            // action node com success=false dominante
            success = 0.3;
        }
    }

    // Freshness: invalidated=true zera, staleFactor em [0..1] atenua.
    let freshness = 1;
    if (targetNode?.data?.['invalidated'] === true) freshness = 0;
    else if (typeof targetNode?.data?.['staleFactor'] === 'number') {
        freshness = Math.max(0, Math.min(1, targetNode.data['staleFactor']));
    }

    return { frequency, recency, success, freshness };
}

/**
 * Combina os sinais em um score único [0..1]. Pesos calibrados para priorizar
 * freshness (um caminho obsoleto não serve para nada) e recência.
 *
 *   weights: freq 0.3, recency 0.3, success 0.2, freshness 0.2
 *
 * freshness=0 derruba o score inteiro (via multiplicação).
 */
export function composeScore(signals: ScoringSignals): number {
    const linear =
        signals.frequency * 0.3 +
        signals.recency * 0.3 +
        signals.success * 0.2 +
        signals.freshness * 0.2;
    // Multiplicador de freshness: se freshness < 0.2, o path vira unusable.
    return linear * Math.max(0.05, signals.freshness);
}

/** Conveniência: sinais + score num passo só. */
export function scoreEdge(
    edge: BrainEdge,
    targetNode: BrainNode | null,
    opts: ScoringOptions = {},
): { score: number; signals: ScoringSignals } {
    const signals = computeSignals(edge, targetNode, opts);
    return { score: composeScore(signals), signals };
}

/** Threshold recomendado para considerar um caminho "exploitable" (determinístico). */
export const EXPLOIT_THRESHOLD = 0.7;

/** Mínimo de observações antes de confiar num caminho. Evita overfit a acaso. */
export const MIN_OBSERVATIONS = 3;

/**
 * Diz se uma aresta pode ser usada em replay determinístico.
 * Exige weight >= MIN_OBSERVATIONS (confiança estatística) E score >= threshold.
 */
export function isExploitable(
    edge: BrainEdge,
    targetNode: BrainNode | null,
    opts: ScoringOptions = {},
): boolean {
    if (edge.weight < MIN_OBSERVATIONS) return false;
    const { score } = scoreEdge(edge, targetNode, opts);
    return score >= EXPLOIT_THRESHOLD;
}
