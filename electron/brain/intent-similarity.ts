/**
 * Brain — Intent Similarity (sem embeddings pesados)
 *
 * Goals diferentes em texto podem ser a MESMA intenção:
 *   "consultar processo 0001234 no TJPA"
 *   "ver processo 5678 tribunal TJPA"
 *   "buscar 9876-12 tjpa"
 *
 * Se o replay engine só fizer match exato por (tribunal, pjeContext), vai
 * perder reuso óbvio. Esta camada extrai "intent signature" normalizada e
 * compara similaridade via Jaccard de trigrams de palavras — barato,
 * determinístico, sem modelo externo.
 *
 * Limitação: não entende semântica profunda (ex: "ver" ≠ "consultar"
 * lexicalmente). Para isso precisaria de embeddings — hoje, 90% das
 * queries PJe cabe nesse léxico limitado.
 */

const STOPWORDS = new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das',
    'para', 'pra', 'com', 'em', 'no', 'na', 'nos', 'nas', 'por',
    'e', 'ou', 'que', 'se', 'mais', 'como', 'ao', 'às',
    'meu', 'minha', 'seu', 'sua', 'este', 'esta', 'esse', 'essa',
]);

/** Normaliza: lowercase, remove acentos, colapsa espaços, tira stopwords. */
export function normalizeIntent(text: string): string {
    const lowered = text.toLowerCase();
    const stripped = lowered
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const tokens = stripped.split(' ')
        .filter(t => t.length > 1 && !STOPWORDS.has(t));
    // Remove tokens que parecem números de processo / ids específicos — eles
    // ruido para a similaridade (o "que fazer" é comum, o "em quem" muda).
    const cleaned = tokens.filter(t => !/^\d[\d-]*\d$/.test(t) && !/^[a-z0-9]{20,}$/.test(t));
    return cleaned.join(' ');
}

/** Trigrams de palavras. Preserva ordem em parte (n-grama, não bag-of-words). */
function trigrams(normalized: string): Set<string> {
    const toks = normalized.split(' ');
    const out = new Set<string>();
    // unigrams também entram (ajuda quando o texto é curto — 2-3 palavras).
    for (const t of toks) out.add(t);
    for (let i = 0; i < toks.length - 2; i++) {
        out.add(`${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`);
    }
    return out;
}

/** Jaccard: |A ∩ B| / |A ∪ B|. Retorna [0..1]. */
export function jaccardSimilarity(a: string, b: string): number {
    const A = trigrams(normalizeIntent(a));
    const B = trigrams(normalizeIntent(b));
    if (A.size === 0 && B.size === 0) return 1;
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter += 1;
    const union = A.size + B.size - inter;
    return inter / union;
}

/**
 * Dado um goal e uma lista de goals conhecidos, retorna o mais similar
 * acima do threshold. Útil para o replay engine: "tem algum flow cujo
 * goal original é parecido com esse?".
 */
export function findSimilarIntent<T extends { goal: string }>(
    query: string,
    candidates: T[],
    threshold = 0.4,
): { candidate: T; score: number } | null {
    let best: { candidate: T; score: number } | null = null;
    for (const c of candidates) {
        const s = jaccardSimilarity(query, c.goal);
        if (s >= threshold && (!best || s > best.score)) {
            best = { candidate: c, score: s };
        }
    }
    return best;
}

/**
 * Agrupa goals em clusters de similaridade — hierarchical simples.
 * Útil para dashboard "goals mais comuns".
 */
export function clusterIntents(
    goals: string[],
    threshold = 0.5,
): Array<{ representative: string; members: string[] }> {
    const clusters: Array<{ representative: string; members: string[] }> = [];
    for (const g of goals) {
        let placed = false;
        for (const c of clusters) {
            if (jaccardSimilarity(g, c.representative) >= threshold) {
                c.members.push(g);
                placed = true;
                break;
            }
        }
        if (!placed) clusters.push({ representative: g, members: [g] });
    }
    return clusters.sort((a, b) => b.members.length - a.members.length);
}
