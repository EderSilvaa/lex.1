/**
 * Legal Extractor — Aprendizado do Uso
 *
 * Extrai citações jurídicas (súmulas, artigos, leis) do texto
 * de resposta do agente e do input do usuário.
 * Novas citações são salvas no store com fonte: 'usuario'.
 *
 * Roda em background após cada resposta — não bloqueia o loop.
 */

import {
    hasSumula, addSumula,
    hasArticle, addArticle,
    StoredSumula, StoredArticle,
} from './legal-store';

// ── Regex Patterns ──────────────────────────────────────────────────

// Súmulas: "Súmula 331 do TST", "Súmula nº 385 do STJ", "SV 13"
const SUMULA_PATTERN =
    /s[uú]mula\s+(?:vinculante\s+)?(?:n[ºo°.]?\s*)?(\d+)\s+(?:do\s+)?(?:c\.\s*)?(TST|STJ|STF)/gi;

// Súmulas Vinculantes: "Súmula Vinculante 13", "SV 25"
const SV_PATTERN =
    /(?:s[uú]mula\s+vinculante|sv)\s+(?:n[ºo°.]?\s*)?(\d+)/gi;

// Artigos: "Art. 477 da CLT", "art. 5º, inciso XXXV, da CF", "artigo 300 do CPC"
const ARTIGO_PATTERN =
    /art(?:igo)?\.?\s*(\d+[ºª]?(?:[,\s]+(?:inciso|§|parágrafo|alínea|caput)\s*[IVXLCDM\d]+[ºª]?)*)\s*(?:,?\s*(?:da|do|d[ao]s))\s*(CLT|CPC|CC|CDC|CP|CPP|CF|ECA|CTN|CRFB|Lei\s*[\d.]+\/?\d*)/gi;

// ── Tipos internos ──────────────────────────────────────────────────

interface ExtractedSumula {
    tribunal: string;
    numero: number;
    vinculante: boolean;
}

interface ExtractedArticle {
    artigo: string;
    lei: string;
}

// ── Extração ────────────────────────────────────────────────────────

function extractSumulas(text: string): ExtractedSumula[] {
    const results: ExtractedSumula[] = [];
    const seen = new Set<string>();

    // Súmulas com tribunal
    let match: RegExpExecArray | null;
    SUMULA_PATTERN.lastIndex = 0;
    while ((match = SUMULA_PATTERN.exec(text)) !== null) {
        if (!match[1] || !match[2]) continue;
        const numero = parseInt(match[1], 10);
        const tribunal = match[2].toUpperCase();
        const key = `${tribunal}-${numero}`;
        if (!seen.has(key)) {
            seen.add(key);
            results.push({ tribunal, numero, vinculante: false });
        }
    }

    // Súmulas Vinculantes (STF)
    SV_PATTERN.lastIndex = 0;
    while ((match = SV_PATTERN.exec(text)) !== null) {
        if (!match[1]) continue;
        const numero = parseInt(match[1], 10);
        const key = `STF-SV-${numero}`;
        if (!seen.has(key)) {
            seen.add(key);
            results.push({ tribunal: 'STF', numero, vinculante: true });
        }
    }

    return results;
}

function extractArticles(text: string): ExtractedArticle[] {
    const results: ExtractedArticle[] = [];
    const seen = new Set<string>();

    let match: RegExpExecArray | null;
    ARTIGO_PATTERN.lastIndex = 0;
    while ((match = ARTIGO_PATTERN.exec(text)) !== null) {
        if (!match[1] || !match[2]) continue;
        const artigo = `Art. ${match[1].trim()}`;
        let lei = match[2].trim().toUpperCase();

        // Normaliza variações
        if (lei === 'CRFB') lei = 'CF';

        const key = `${lei}-${artigo}`;
        if (!seen.has(key)) {
            seen.add(key);
            results.push({ artigo, lei });
        }
    }

    return results;
}

// ── Nomes completos das leis ────────────────────────────────────────

const LEI_NOMES: Record<string, string> = {
    'CLT': 'Consolidação das Leis do Trabalho',
    'CPC': 'Código de Processo Civil',
    'CC': 'Código Civil',
    'CDC': 'Código de Defesa do Consumidor',
    'CP': 'Código Penal',
    'CPP': 'Código de Processo Penal',
    'CF': 'Constituição Federal de 1988',
    'ECA': 'Estatuto da Criança e do Adolescente',
    'CTN': 'Código Tributário Nacional',
};

// Mapeia lei → áreas prováveis
const LEI_AREAS: Record<string, string[]> = {
    'CLT': ['trabalhista'],
    'CPC': ['processual'],
    'CC': ['civil'],
    'CDC': ['consumidor'],
    'CP': ['penal'],
    'CPP': ['penal', 'processual'],
    'CF': ['constitucional'],
    'ECA': ['familia', 'civil'],
    'CTN': ['tributario'],
};

const TRIBUNAL_AREAS: Record<string, string[]> = {
    'TST': ['trabalhista'],
    'STJ': ['civil', 'processual'],
    'STF': ['constitucional'],
};

// ── Save Logic ──────────────────────────────────────────────────────

function saveSumula(s: ExtractedSumula): boolean {
    const id = s.vinculante ? `STF-SV-${s.numero}` : `${s.tribunal}-${s.numero}`;

    // Já existe no store?
    if (hasSumula(s.tribunal, s.numero)) return false;

    const newSumula: StoredSumula = {
        id,
        tribunal: s.tribunal,
        numero: s.numero,
        texto: `Súmula ${s.vinculante ? 'Vinculante ' : ''}${s.numero} do ${s.tribunal} (texto a ser atualizado via sync)`,
        area: TRIBUNAL_AREAS[s.tribunal] || ['civil'],
        keywords: [`súmula ${s.numero}`, s.tribunal.toLowerCase()],
        aplicacao: 'Citada durante uso do sistema — aguardando enriquecimento.',
        fonte: 'usuario',
        dataAtualizacao: new Date().toISOString().split('T')[0]!,
    };

    addSumula(newSumula);
    return true;
}

function saveArticle(a: ExtractedArticle): boolean {
    // Já existe no store?
    if (hasArticle(a.lei, a.artigo)) return false;

    const newArticle: StoredArticle = {
        id: `${a.lei}-${a.artigo.replace(/\s+/g, '').replace('Art.', '')}`,
        lei: a.lei,
        leiCompleta: LEI_NOMES[a.lei] || a.lei,
        artigo: a.artigo,
        texto: `${a.artigo} da ${a.lei} (texto a ser atualizado via sync)`,
        area: LEI_AREAS[a.lei] || ['civil'],
        keywords: [a.artigo.toLowerCase(), a.lei.toLowerCase()],
        uso: 'Citado durante uso do sistema — aguardando enriquecimento.',
        fonte: 'usuario',
        dataAtualizacao: new Date().toISOString().split('T')[0]!,
    };

    addArticle(newArticle);
    return true;
}

// ── API Pública ─────────────────────────────────────────────────────

/**
 * Extrai citações jurídicas do texto e salva novas no store.
 * Roda em background — não lança exceções.
 */
export function extractAndSave(text: string): { sumulas: number; articles: number } {
    let sumulasSaved = 0;
    let articlesSaved = 0;

    try {
        const sumulas = extractSumulas(text);
        for (const s of sumulas) {
            if (saveSumula(s)) {
                sumulasSaved++;
                console.log(`[LegalExtractor] Nova súmula aprendida: Súmula ${s.numero} ${s.tribunal}`);
            }
        }

        const articles = extractArticles(text);
        for (const a of articles) {
            if (saveArticle(a)) {
                articlesSaved++;
                console.log(`[LegalExtractor] Novo artigo aprendido: ${a.artigo} da ${a.lei}`);
            }
        }
    } catch (err: any) {
        console.warn('[LegalExtractor] Erro na extração:', err.message);
    }

    return { sumulas: sumulasSaved, articles: articlesSaved };
}

/**
 * Extrai citações do texto sem salvar (para preview/debug).
 */
export function extractCitations(text: string): { sumulas: ExtractedSumula[]; articles: ExtractedArticle[] } {
    return {
        sumulas: extractSumulas(text),
        articles: extractArticles(text),
    };
}
