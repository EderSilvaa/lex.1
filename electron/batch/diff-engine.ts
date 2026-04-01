/**
 * Diff Engine — Anti-repetição para Produção em Lote
 *
 * Usa trigrams + Jaccard distance para medir diferenciação entre petições.
 * Rápido, determinístico, sem custo de tokens LLM.
 */

import { createHash } from 'crypto';

/**
 * Computa hash MD5 do conteúdo HTML (após strip de tags).
 */
export function computeContentHash(html: string): string {
    const text = stripHtml(html);
    return createHash('md5').update(text).digest('hex');
}

/**
 * Extrai trigrams (sequências de 3 palavras) do texto.
 * Normaliza: lowercase, remove pontuação, colapsa espaços.
 */
export function extractTrigrams(text: string): Set<string> {
    const normalized = text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // Remove pontuação, mantém letras/números
        .replace(/\s+/g, ' ')
        .trim();

    const words = normalized.split(' ').filter(w => w.length > 1);
    const trigrams = new Set<string>();

    for (let i = 0; i <= words.length - 3; i++) {
        trigrams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }

    return trigrams;
}

/**
 * Calcula similaridade de Jaccard entre dois conjuntos.
 * Retorna 0.0 (idênticos) a 1.0 (completamente diferentes).
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1.0;
    if (a.size === 0 || b.size === 0) return 0.0;

    let intersection = 0;
    for (const item of a) {
        if (b.has(item)) intersection++;
    }

    const union = a.size + b.size - intersection;
    return union === 0 ? 1.0 : intersection / union;
}

/**
 * Computa score de diferenciação (0-100) do texto atual vs textos anteriores.
 *
 * Score = (1 - maxSimilarity) * 100
 * - 100% = completamente diferente
 * - 0% = idêntico
 * - Threshold recomendado: 70%
 *
 * @param currentHtml - HTML da petição atual
 * @param previousHtmls - HTMLs das petições anteriores (máx 3 mais recentes)
 * @returns Score de diferenciação (0-100)
 */
export function computeDiffScore(currentHtml: string, previousHtmls: string[]): number {
    if (previousHtmls.length === 0) return 100; // Primeira petição = 100% única

    const currentText = stripHtml(currentHtml);
    const currentTrigrams = extractTrigrams(currentText);

    if (currentTrigrams.size === 0) return 100;

    // Compara com cada texto anterior, pega a maior similaridade
    let maxSimilarity = 0;

    for (const prevHtml of previousHtmls.slice(-3)) { // Máx 3 últimas
        const prevText = stripHtml(prevHtml);
        const prevTrigrams = extractTrigrams(prevText);

        if (prevTrigrams.size === 0) continue;

        const similarity = jaccardSimilarity(currentTrigrams, prevTrigrams);
        maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    // Score = inverso da similaridade máxima
    return Math.round((1 - maxSimilarity) * 100);
}

/**
 * Remove tags HTML e entidades, retorna texto puro.
 */
function stripHtml(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/&#\d+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
