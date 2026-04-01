/**
 * Legal Language Engine — Motor de Linguagem Jurídica
 *
 * Seleciona vocabulário jurídico relevante para o contexto atual
 * e monta blocos prontos para injeção nos prompts do agente.
 *
 * Usado por:
 * - think.ts → buildContextSection() — injeta termos + estilo no contexto
 * - doc_gerar.ts → system prompt — injeta regras completas de formatação
 */

import { LegalTerm, getTermsByArea, searchTerms, LEGAL_GLOSSARY } from './glossary';
import { getFullStyleBlock } from './style-rules';
import { searchSumulas, searchArticles, searchTheses } from './legal-store';

// ── Detecção de Área do Direito ─────────────────────────────────────

interface AreaKeywords {
    area: string;
    keywords: RegExp;
}

const AREA_PATTERNS: AreaKeywords[] = [
    {
        area: 'trabalhista',
        keywords: /\b(clt|fgts|rescis[ãa]o|reclamaç[ãa]o trabalhist|obreiro|reclamad[ao]|horas? extras?|aviso pr[ée]vio|justa causa|equiparaç[ãa]o salarial|13[°º]|d[eé]cimo terceiro|f[eé]rias|insalubri|periculosi|adicional noturno|ctps|carteira de trabalho|sindicat|conven[çc][ãa]o coletiva|acordo coletivo|diss[ií]dio|tst|trt|vara do trabalho|verbas rescis[oó]rias|intervalo intrajornada|sobrejornada)\b/i,
    },
    {
        area: 'civil',
        keywords: /\b(contrato|indeniza[çc][ãa]o|dano moral|dano material|obriga[çc][ãa]o|usucapi[ãa]o|responsabilidade civil|evic[çc][ãa]o|enriquecimento sem causa|inadimpl|prescri[çc][ãa]o|decad[eê]ncia|caso fortuito|for[çc]a maior|boa-f[eé]|v[ií]cio redibit[oó]rio|c[oó]digo civil|cpc|rescis[ãa]o contratual|locaç[ãa]o|despejo|condom[ií]nio|penhor[a]?|hipotec[a]?|fianç[a]?)\b/i,
    },
    {
        area: 'penal',
        keywords: /\b(crime|pena|furto|roubo|homic[ií]dio|den[uú]ncia|r[eé]u|acusad[oa]|tipo penal|tipicidade|antijuridicidade|culpabilidade|dolo|culpa|leg[ií]tima defesa|estado de necessidade|dosimetria|habeas corpus|flagrante|pris[ãa]o|fianç[a]?|liberdade provis[oó]ria|c[oó]digo penal|cpp|mp|minist[eé]rio p[uú]blico|inqu[eé]rito|est[eé]lionato|latroc[ií]nio|tráfico)\b/i,
    },
    {
        area: 'familia',
        keywords: /\b(div[oó]rcio|guarda|pens[ãa]o aliment|alimentos|uni[ãa]o est[aá]vel|casamento|separa[çc][ãa]o|partilha|aliena[çc][ãa]o parental|poder familiar|invent[aá]rio|heranç[a]|testamento|curatela|tutela|ado[çc][ãa]o|investiga[çc][ãa]o de paternidade|reconhecimento de filh)\b/i,
    },
    {
        area: 'consumidor',
        keywords: /\b(consumidor|cdc|c[oó]digo de defesa|v[ií]cio do produto|fato do servi[çc]o|pr[aá]tica abusiva|venda casada|propaganda enganosa|invers[ãa]o do [oô]nus|direito de arrependimento|desconsideraç[ãa]o|recall|garantia legal|fornecedor|rela[çc][ãa]o de consumo)\b/i,
    },
    {
        area: 'tributario',
        keywords: /\b(tribut[aá]ri[ao]|imposto|icms|ipi|ir|irpf|irpj|iss|iptu|ipva|itbi|itcmd|cofins|pis|csll|contribui[çc][ãa]o|fato gerador|base de c[aá]lculo|al[ií]quota|lan[çc]amento|cr[eé]dito tribut[aá]rio|execu[çc][ãa]o fiscal|d[ií]vida ativa|ctn|anu|sonegaç[ãa]o|isen[çc][ãa]o|imunidade|elisão)\b/i,
    },
    {
        area: 'previdenciario',
        keywords: /\b(previdenci[aá]ri[ao]|inss|aposentadoria|aux[ií]lio.?doen[çc]a|aux[ií]lio.?acidente|pens[ãa]o por morte|bpc|loas|benefício|segurad[oa]|car[eê]ncia|per[ií]odo de graç[a]|incapacidade|invalidez|benefício por incapacidade|tempo de contribui[çc][ãa]o|atividade especial)\b/i,
    },
    {
        area: 'administrativo',
        keywords: /\b(administrativ[oa]|servidor|concurso p[uú]blic|licita[çc][ãa]o|contrato administrativ|ato administrativ|improbidade|mandado de seguranç[a]|poder de pol[ií]cia|desapropria[çc][ãa]o|concess[ãa]o|permiss[ãa]o|autoriza[çc][ãa]o|pad|processo administrativ|lei 8\.?112|lei 9\.?784|lei 14\.?133)\b/i,
    },
    {
        area: 'constitucional',
        keywords: /\b(constitucional|constitui[çc][ãa]o|direito fundamental|stf|adi|adc|adpf|controle de constitucionalidade|recurso extraordin[aá]rio|repercuss[ãa]o geral|s[uú]mula vinculante|mandado de injun[çc][ãa]o|habeas data|cl[aá]usula p[eé]trea|emenda constitucional)\b/i,
    },
    {
        area: 'empresarial',
        keywords: /\b(empresarial|societ[aá]ri[ao]|contrato social|ltda|s\.?a\.?|sociedade (limitada|an[oô]nima)|recupera[çc][ãa]o judicial|fal[eê]ncia|massa falida|marca registrada|patente|propriedade industrial|inpi|t[ií]tulo de cr[eé]dito|duplicata|nota promiss[oó]ria|endosso|aval|holding|mei|eireli|assembleia geral|trespasse|fundo de com[eé]rcio)\b/i,
    },
    {
        area: 'ambiental',
        keywords: /\b(ambiental|meio ambiente|licenciamento|eia|rima|poluidor|polui[çc][ãa]o|dano ambiental|[aá]rea de preserva[çc][ãa]o|reserva legal|app|desmatamento|ibama|conama|c[oó]digo florestal|unidade de conserva[çc][ãa]o|tac|crime ambiental|desenvolvimento sustent[aá]vel)\b/i,
    },
    {
        area: 'digital',
        keywords: /\b(lgpd|dado[s]? pessoal|dado[s]? sens[ií]vel|controlador|operador|encarregado|dpo|anpd|marco civil|internet|prote[çc][ãa]o de dados|privacidade|vazamento de dados|cibern[eé]tic|digital|anonimiza[çc][ãa]o|consentimento.*dado|portabilidade de dados|incidente de seguran[çc]a)\b/i,
    },
    {
        area: 'imobiliario',
        keywords: /\b(imobili[aá]ri[ao]|loca[çc][ãa]o|locador|locat[aá]rio|despejo|lei do inquilinato|lei 8\.?245|escritura p[uú]blica|registro de im[oó]vel|matr[ií]cula|incorpora[çc][ãa]o|condom[ií]nio|aliena[çc][ãa]o fiduci[aá]ria|direito de superf[ií]cie|usucapi[ãa]o|a[çc][ãa]o renovat[oó]ria|compromisso de compra e venda)\b/i,
    },
    {
        area: 'eleitoral',
        keywords: /\b(eleitoral|elei[çc][ãa]o|candidat|propaganda eleitoral|voto|urna|tse|tre|tse|inelegibilidade|ficha limpa|presta[çc][ãa]o de contas|fundo eleitoral|abuso de poder econ[oô]mico|dom[ií]c[ií]lio eleitoral|diploma|partido|cota de g[eê]nero)\b/i,
    },
];

/**
 * Detecta áreas do direito a partir de keywords no texto.
 * Retorna array de áreas detectadas, ordenadas por relevância (mais matches primeiro).
 */
export function detectLegalArea(text: string): string[] {
    if (!text || text.length < 5) return [];

    const scores: Array<{ area: string; score: number }> = [];

    for (const { area, keywords } of AREA_PATTERNS) {
        const matches = text.match(new RegExp(keywords.source, 'gi'));
        if (matches && matches.length > 0) {
            scores.push({ area, score: matches.length });
        }
    }

    return scores
        .sort((a, b) => b.score - a.score)
        .map(s => s.area);
}

// ── Sub-Área Detection ──────────────────────────────────────────────

interface SubAreaPattern {
    area: string;
    subArea: string;
    keywords: RegExp;
}

const SUB_AREA_PATTERNS: SubAreaPattern[] = [
    { area: 'trabalhista', subArea: 'rescisão', keywords: /\b(rescis[ãa]o|verbas rescis|aviso pr[eé]vio|justa causa|dispensa|pedido de demiss[ãa]o)\b/i },
    { area: 'trabalhista', subArea: 'jornada', keywords: /\b(hora[s]? extra|sobrejornada|intervalo|jornada|noturno|sobreaviso)\b/i },
    { area: 'trabalhista', subArea: 'acidente', keywords: /\b(acidente de trabalho|doen[çc]a ocupacional|insalubri|periculosi|cat |estabilidade acident[aá]ria)\b/i },
    { area: 'civil', subArea: 'contratos', keywords: /\b(contrat[ou]|inadimpl|resolu[çc][ãa]o contratual|resilição|novação|cláusula penal|rescis[ãa]o contratual)\b/i },
    { area: 'civil', subArea: 'responsabilidade', keywords: /\b(indeniza[çc][ãa]o|dano moral|dano material|responsabilidade (civil|objetiva|subjetiva)|nexo causal|culpa)\b/i },
    { area: 'civil', subArea: 'reais', keywords: /\b(usucapi[ãa]o|posse|propriedade|servidão|hipoteca|penhor|aliena[çc][ãa]o fiduci[aá]ria|registro de im[oó]vel)\b/i },
    { area: 'civil', subArea: 'obrigações', keywords: /\b(obriga[çc][ãa]o|pagamento|compensa[çc][ãa]o|cess[ãa]o de cr[eé]dito|sub-roga[çc][ãa]o|mora|inadimplemento)\b/i },
    { area: 'penal', subArea: 'patrimônio', keywords: /\b(furto|roubo|estelionato|apropria[çc][ãa]o ind[eé]bita|receptação|dano|extors[ãa]o)\b/i },
    { area: 'penal', subArea: 'pessoa', keywords: /\b(homic[ií]dio|les[ãa]o corporal|amea[çc]a|const?rangimento|sequestro|c[aá]rcere privado)\b/i },
    { area: 'penal', subArea: 'drogas', keywords: /\b(tr[aá]fico|entorpecente|droga[s]?|lei 11\.?343|uso de substância)\b/i },
    { area: 'penal', subArea: 'execução penal', keywords: /\b(progress[ãa]o de regime|livramento condicional|sursis|regime (fechado|semiaberto|aberto)|remi[çc][ãa]o|detração)\b/i },
    { area: 'tributario', subArea: 'execução fiscal', keywords: /\b(execu[çc][ãa]o fiscal|d[ií]vida ativa|cda|embargos [aà] execu[çc][ãa]o|penhora.*tribut|exceção de pr[eé]-executividade)\b/i },
    { area: 'tributario', subArea: 'planejamento', keywords: /\b(elis[ãa]o|planejamento tribut[aá]rio|simples nacional|holding|reorganiza[çc][ãa]o societ[aá]ria)\b/i },
    { area: 'familia', subArea: 'alimentos', keywords: /\b(alimento|pens[ãa]o aliment|alimentando|alimentante|execu[çc][ãa]o de alimentos|pris[ãa]o civil)\b/i },
    { area: 'familia', subArea: 'guarda', keywords: /\b(guarda|visitação|aliena[çc][ãa]o parental|conviv[eê]ncia|poder familiar)\b/i },
    { area: 'familia', subArea: 'sucessões', keywords: /\b(invent[aá]rio|testamento|heranç[a]|part[ií]lha|leg[ií]tima|herdeiro|colação|de cujus)\b/i },
];

/**
 * Detecta sub-áreas específicas dentro das áreas principais.
 * Retorna array de sub-áreas encontradas.
 */
export function detectSubAreas(text: string, areas: string[]): string[] {
    if (!text || areas.length === 0) return [];

    const subAreas: string[] = [];
    for (const { area, subArea, keywords } of SUB_AREA_PATTERNS) {
        if (areas.includes(area) && keywords.test(text)) {
            subAreas.push(`${area}:${subArea}`);
        }
    }
    return subAreas;
}

// ── Budget Tier ─────────────────────────────────────────────────────

export type BudgetTier = 'large' | 'medium' | 'small';

const BUDGET_LIMITS: Record<BudgetTier, number> = {
    large: 3500,
    medium: 2500,
    small: 1200,
};

const TERM_LIMITS: Record<BudgetTier, number> = {
    large: 10,
    medium: 6,
    small: 3,
};

// ── Seleção de Termos Relevantes ────────────────────────────────────

/**
 * Seleciona termos jurídicos relevantes para o contexto.
 * Prioriza: matches diretos > sub-área > área principal.
 */
export function getRelevantTerms(text: string, areas: string[], limit = 8): LegalTerm[] {
    if (!text || areas.length === 0) return [];

    const selected: LegalTerm[] = [];
    const seen = new Set<string>();

    // 1. Termos que aparecem literalmente no texto (máximo 3)
    const directMatches = searchTerms(text, 5);
    for (const term of directMatches) {
        if (selected.length >= 3) break;
        if (!seen.has(term.termo)) {
            selected.push(term);
            seen.add(term.termo);
        }
    }

    // 2. Sub-area weighted: prioriza termos da sub-área detectada
    const subAreas = detectSubAreas(text, areas);
    if (subAreas.length > 0) {
        // Sub-áreas retornam "area:subArea", buscar termos relacionados
        for (const sa of subAreas.slice(0, 2)) {
            const subAreaName = sa.split(':')[1]!;
            const subTerms = searchTerms(subAreaName, 5);
            for (const term of subTerms) {
                if (selected.length >= limit) break;
                if (!seen.has(term.termo)) {
                    selected.push(term);
                    seen.add(term.termo);
                }
            }
        }
    }

    // 3. Termos da área detectada (preenche o resto até o limit)
    for (const area of areas.slice(0, 2)) {
        const areaTerms = getTermsByArea(area);
        for (const term of areaTerms) {
            if (selected.length >= limit) break;
            if (!seen.has(term.termo)) {
                selected.push(term);
                seen.add(term.termo);
            }
        }
    }

    return selected.slice(0, limit);
}

// ── Bloco de Contexto Legal ─────────────────────────────────────────

/**
 * Monta bloco completo de contexto legal para injeção no prompt.
 * Budget-tier: 'large' = 3500, 'medium' = 2500, 'small' = 1200 chars.
 */
export function buildLegalContextBlock(
    objetivo: string,
    areas: string[],
    docType?: string,
    budgetTier: BudgetTier = 'medium'
): string | null {
    if (areas.length === 0) return null;

    const budget = BUDGET_LIMITS[budgetTier];
    const termLimit = TERM_LIMITS[budgetTier];
    const parts: string[] = ['## Consciência Jurídica'];

    // Área detectada
    const areaNames: Record<string, string> = {
        trabalhista: 'Direito do Trabalho',
        civil: 'Direito Civil',
        penal: 'Direito Penal',
        familia: 'Direito de Família',
        consumidor: 'Direito do Consumidor',
        tributario: 'Direito Tributário',
        previdenciario: 'Direito Previdenciário',
        administrativo: 'Direito Administrativo',
        constitucional: 'Direito Constitucional',
        empresarial: 'Direito Empresarial',
        ambiental: 'Direito Ambiental',
        digital: 'Direito Digital / LGPD',
        imobiliario: 'Direito Imobiliário',
        eleitoral: 'Direito Eleitoral',
        internacional: 'Direito Internacional',
    };

    const areasText = areas.slice(0, 2).map(a => areaNames[a] || a).join(' + ');

    // Sub-áreas detectadas
    const subAreas = detectSubAreas(objetivo, areas);
    const subAreaText = subAreas.length > 0
        ? ` (foco: ${subAreas.map(sa => sa.split(':')[1]).join(', ')})`
        : '';
    parts.push(`Área detectada: **${areasText}**${subAreaText}`);

    // Termos relevantes (compacto: termo → significado)
    const terms = getRelevantTerms(objetivo, areas, termLimit);
    if (terms.length > 0) {
        const termLines = terms.map(t => {
            let line = `- **${t.termo}**: ${t.significado}`;
            if (t.uso && line.length < 120) line += `. ${t.uso}`;
            return line.length > 150 ? line.substring(0, 147) + '...' : line;
        });
        parts.push(`### Vocabulário Contextual\n${termLines.join('\n')}`);
    }

    // Súmulas relevantes (do store dinâmico)
    try {
        const sumulas = searchSumulas(objetivo, 3);
        if (sumulas.length > 0) {
            const sumulaLines = sumulas.map(s => {
                const txt = s.texto.length > 120 ? s.texto.substring(0, 117) + '...' : s.texto;
                return `- **Súmula ${s.numero} do ${s.tribunal}**: ${txt}`;
            });
            parts.push(`### Súmulas Aplicáveis\n${sumulaLines.join('\n')}`);
        }
    } catch { /* store not initialized */ }

    // Artigos-chave (do store dinâmico)
    try {
        const articles = searchArticles(objetivo, 3);
        if (articles.length > 0) {
            const artLines = articles.map(a => {
                const txt = a.texto.length > 120 ? a.texto.substring(0, 117) + '...' : a.texto;
                return `- **${a.artigo} da ${a.lei}**: ${txt}`;
            });
            parts.push(`### Artigos de Lei\n${artLines.join('\n')}`);
        }
    } catch { /* store not initialized */ }

    // Teses prontas (do store dinâmico)
    try {
        const theses = searchTheses(objetivo, 2);
        if (theses.length > 0) {
            const thesisLines = theses.map(t =>
                `- **${t.nome}**: ${t.fundamentoLegal.join(', ')}${t.quantumUsual ? ` (quantum: ${t.quantumUsual})` : ''}`
            );
            parts.push(`### Teses Jurídicas\n${thesisLines.join('\n')}`);
        }
    } catch { /* store not initialized */ }

    // Estilo compacto (só verbos + conectivos, sem tratamento completo)
    const primaryArea = areas[0] || 'civil';
    parts.push(`### Estilo\n- Use linguagem técnico-jurídica de ${areaNames[primaryArea] || primaryArea}`);
    parts.push('- Cite artigos específicos (Art. Xº da Lei Y), não "conforme a legislação"');
    parts.push('- Verbos: requer, aduz, demonstra, impugna (NÃO: quer, diz, mostra, discorda)');

    const block = parts.join('\n');

    // Budget enforcement
    if (block.length > budget) {
        return block.substring(0, budget - 3) + '...';
    }

    return block;
}
