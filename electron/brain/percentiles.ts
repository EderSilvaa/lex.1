/**
 * Brain — Percentis rolling para duração de ações.
 *
 * Guardar só o último durationMs mente: uma ação que historicamente leva
 * 400ms mas teve um outlier de 12s vai nos enganar na hora de definir
 * timeout adaptativo. Usamos uma janela rolling dos últimos N samples
 * (FIFO), pequena o bastante para caber no data do node sem inflar o DB,
 * grande o bastante para percentis fazerem sentido.
 */

const WINDOW = 20;

/** Adiciona um sample ao histórico rolling (mantém no máximo WINDOW). */
export function pushSample(history: number[] | undefined, sample: number): number[] {
    const next = Array.isArray(history) ? [...history] : [];
    next.push(sample);
    if (next.length > WINDOW) next.splice(0, next.length - WINDOW);
    return next;
}

/** Retorna o percentil p (0..100). Default 95. */
export function percentile(history: number[] | undefined, p = 95): number {
    if (!history || history.length === 0) return 0;
    const sorted = [...history].sort((a, b) => a - b);
    const rank = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    if (lo === hi) return sorted[lo] ?? 0;
    const w = rank - lo;
    return (sorted[lo] ?? 0) * (1 - w) + (sorted[hi] ?? 0) * w;
}

/** Timeout adaptativo: p95 * fator + piso. Cap superior pra evitar absurdos. */
export function adaptiveTimeoutMs(
    history: number[] | undefined,
    opts: { factor?: number; floorMs?: number; ceilMs?: number } = {},
): number {
    const factor = opts.factor ?? 2;
    const floorMs = opts.floorMs ?? 3_000;
    const ceilMs = opts.ceilMs ?? 30_000;
    const p95 = percentile(history, 95);
    if (p95 <= 0) return floorMs;
    return Math.min(ceilMs, Math.max(floorMs, Math.round(p95 * factor)));
}
