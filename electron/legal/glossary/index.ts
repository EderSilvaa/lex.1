/**
 * Legal Glossary — Glossário Jurídico Estruturado
 *
 * 500+ termos jurídicos curados organizados por 16 áreas do direito.
 * Inclui termos em latim, francês e jargão forense brasileiro.
 *
 * Usado pelo Legal Language Engine para enriquecer prompts
 * com vocabulário jurídico contextual.
 */

// Re-export tipo
export type { LegalTerm } from './types';

// ── Importa arrays por área ─────────────────────────────────────────
import { LATIM } from './latim';
import { FRANCES } from './frances';
import { PROCESSUAL } from './processual';
import { TRABALHISTA } from './trabalhista';
import { CIVIL } from './civil';
import { PENAL } from './penal';
import { CONSUMIDOR } from './consumidor';
import { FAMILIA } from './familia';
import { TRIBUTARIO } from './tributario';
import { PREVIDENCIARIO } from './previdenciario';
import { ADMINISTRATIVO } from './administrativo';
import { EMPRESARIAL } from './empresarial';
import { AMBIENTAL } from './ambiental';
import { DIGITAL } from './digital';
import { IMOBILIARIO } from './imobiliario';
import { ELEITORAL } from './eleitoral';
import { CONSTITUCIONAL } from './constitucional';
import { INTERNACIONAL } from './internacional';

// Re-export arrays individuais para acesso direto
export {
    LATIM, FRANCES, PROCESSUAL, TRABALHISTA, CIVIL, PENAL,
    CONSUMIDOR, FAMILIA, TRIBUTARIO, PREVIDENCIARIO, ADMINISTRATIVO,
    EMPRESARIAL, AMBIENTAL, DIGITAL, IMOBILIARIO, ELEITORAL,
    CONSTITUCIONAL, INTERNACIONAL,
};

// ── Glossário Consolidado ───────────────────────────────────────────

import type { LegalTerm } from './types';

export const LEGAL_GLOSSARY: LegalTerm[] = [
    ...LATIM,
    ...FRANCES,
    ...PROCESSUAL,
    ...TRABALHISTA,
    ...CIVIL,
    ...PENAL,
    ...CONSUMIDOR,
    ...FAMILIA,
    ...TRIBUTARIO,
    ...PREVIDENCIARIO,
    ...ADMINISTRATIVO,
    ...EMPRESARIAL,
    ...AMBIENTAL,
    ...DIGITAL,
    ...IMOBILIARIO,
    ...ELEITORAL,
    ...CONSTITUCIONAL,
    ...INTERNACIONAL,
];

// ── Cache por área ──────────────────────────────────────────────────

const _areaCache = new Map<string, LegalTerm[]>();

/** Retorna todos os termos de uma área do direito */
export function getTermsByArea(area: string): LegalTerm[] {
    const cached = _areaCache.get(area);
    if (cached) return cached;

    const terms = LEGAL_GLOSSARY.filter(t => t.area.includes(area));
    _areaCache.set(area, terms);
    return terms;
}

/** Busca termos por texto (match no termo, significado ou sinônimos) */
export function searchTerms(query: string, limit = 10): LegalTerm[] {
    const lower = query.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 2);

    const scored = LEGAL_GLOSSARY.map(term => {
        let score = 0;
        const termoLower = term.termo.toLowerCase();
        const sigLower = term.significado.toLowerCase();

        // Match exato no termo
        if (termoLower === lower) score += 100;
        // Termo contém a query
        else if (termoLower.includes(lower)) score += 50;
        // Query contém o termo
        else if (lower.includes(termoLower)) score += 40;

        // Match parcial por palavras
        for (const word of words) {
            if (termoLower.includes(word)) score += 20;
            if (sigLower.includes(word)) score += 10;
            if (term.sinonimos?.some(s => s.toLowerCase().includes(word))) score += 15;
        }

        return { term, score };
    });

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.term);
}

/** Retorna contagem total de termos no glossário */
export function getGlossaryStats(): { total: number; byArea: Record<string, number> } {
    const byArea: Record<string, number> = {};
    for (const term of LEGAL_GLOSSARY) {
        for (const area of term.area) {
            byArea[area] = (byArea[area] || 0) + 1;
        }
    }
    return { total: LEGAL_GLOSSARY.length, byArea };
}
