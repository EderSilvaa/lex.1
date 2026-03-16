/**
 * Skill: pesquisa_jurisprudencia
 *
 * Pesquisa jurisprudência em fontes oficiais brasileiras em tempo real.
 *
 * ARQUITETURA: Parser fixo → LLM extractor (fallback)
 *   1. Faz HTTP fetch no portal do tribunal
 *   2. Tenta parser HTML específico (rápido, zero tokens)
 *   3. Se parser retorna vazio → LLM extractor (universal, ~400 tokens)
 *
 * FONTES:
 *   Tier 1 (JSON API): STF, TST
 *   Tier 2 (HTML + parser fixo + LLM fallback): STJ, TRF1, TRF4, TJSP, TRT2
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';

// ============================================================================
// TYPES
// ============================================================================

interface Acordao {
    tribunal: string;
    numero:   string;
    ementa:   string;
    data?:    string;
    relator?: string;
    url?:     string;
}

// ============================================================================
// HTTP HELPERS
// ============================================================================

/** Fetch genérico para APIs JSON */
async function httpGet(url: string, timeoutMs = 14_000): Promise<string> {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, {
            signal: ctrl.signal,
            headers: {
                'Accept':     'application/json, application/xml, */*',
                'User-Agent': 'LEX-Juridico/1.0'
            }
        });
        clearTimeout(timer);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.text();
    } catch (e) { clearTimeout(timer); throw e; }
}

async function httpPost(url: string, body: object, timeoutMs = 14_000): Promise<string> {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
                'Content-Type': 'application/json',
                'Accept':       'application/json',
                'User-Agent':   'LEX-Juridico/1.0'
            },
            body: JSON.stringify(body)
        });
        clearTimeout(timer);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.text();
    } catch (e) { clearTimeout(timer); throw e; }
}

/** Fetch com headers de browser — necessário para portais que verificam User-Agent */
async function httpGetHtml(url: string, timeoutMs = 14_000): Promise<string> {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, {
            signal: ctrl.signal,
            headers: {
                'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Cache-Control':   'no-cache'
            }
        });
        clearTimeout(timer);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.text();
    } catch (e) { clearTimeout(timer); throw e; }
}

// ============================================================================
// LLM EXTRACTOR — fallback universal quando parser fixo retorna vazio
// ============================================================================

/**
 * Converte HTML bruto em texto limpo e compacto para o LLM.
 * Mantém estrutura suficiente para identificar decisões.
 */
function htmlParaTextoCompacto(html: string, maxChars = 6000): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|li|tr|td|th)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .substring(0, maxChars);
}

/**
 * Usa LLM para extrair decisões de qualquer HTML de tribunal.
 * Custo: ~400 tokens por chamada. Usa maxTokens pequeno para economizar.
 */
async function llmExtractor(html: string, tribunal: string, limite: number): Promise<Acordao[]> {
    const texto = htmlParaTextoCompacto(html, 5500);
    if (texto.length < 150) return [];

    try {
        const { callAI } = await import('../../ai-handler');

        const resposta = await callAI({
            system: `Você é um extrator de jurisprudência brasileira. Analise o texto de portal judicial abaixo e extraia as decisões encontradas.
Retorne SOMENTE um array JSON válido (sem markdown, sem explicação):
[{"numero":"número do processo ou acórdão","ementa":"resumo da decisão (máx 500 chars)","data":"data da decisão","relator":"nome do relator"}]
Se não encontrar decisões claras, retorne [].`,
            user:        `Tribunal: ${tribunal}\n\n${texto}`,
            maxTokens:   700,
            temperature: 0.0
        });

        const match = resposta.match(/\[[\s\S]*\]/);
        if (!match) return [];
        const arr = JSON.parse(match[0]);
        if (!Array.isArray(arr)) return [];

        console.log(`[Jurisprudência] LLM extractor ${tribunal}: ${arr.length} resultado(s)`);

        return arr.slice(0, limite).map((item: any) => ({
            tribunal,
            numero:  String(item.numero  ?? '').trim(),
            ementa:  String(item.ementa  ?? '').substring(0, 700).trim(),
            data:    String(item.data    ?? '').trim(),
            relator: String(item.relator ?? '').trim(),
            url:     ''
        })).filter((a: Acordao) => a.numero || a.ementa);

    } catch (e: any) {
        console.warn(`[Jurisprudência] LLM extractor ${tribunal} falhou:`, e.message);
        return [];
    }
}

/**
 * Wrapper: tenta parser fixo primeiro, cai no LLM extractor se vazio.
 */
async function buscarComFallback(
    tribunal: string,
    url:      string,
    parser:   (html: string, limite: number) => Acordao[],
    consulta: string,
    limite:   number
): Promise<Acordao[]> {
    const html   = await httpGetHtml(url);
    const fixos  = parser(html, limite);
    if (fixos.length > 0) {
        console.log(`[Jurisprudência] ${tribunal} parser: ${fixos.length} resultado(s)`);
        return fixos;
    }
    console.log(`[Jurisprudência] ${tribunal}: parser vazio → LLM extractor`);
    return llmExtractor(html, tribunal, limite);
}

// ============================================================================
// PARSERS HTML ESPECÍFICOS POR TRIBUNAL
// ============================================================================

/** Extrai texto de um campo usando regex, remove tags internas */
function campo(html: string, pattern: RegExp): string {
    return (html.match(pattern)?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * STJ — SCON (Sistema de Consulta à Jurisprudência)
 * HTML gerado server-side. Resultados em blocos com padrões conhecidos.
 */
function parseSTJ(html: string, limite: number): Acordao[] {
    const results: Acordao[] = [];

    // O SCON agrupa cada resultado em <tr> com class "tr1" ou similar,
    // ou em blocos separados por linhas de separação.
    // Busca por blocos contendo "PROCESSO:" ou número de processo STJ
    const blocoRe = /PROCESSO:\s*([\w.\-/ ]+)/gi;
    const ementaRe = /(?:EMENTA|Ementa)[:\s]*([\s\S]{50,800}?)(?=\n\n|\r\n\r\n|PROCESSO:|ÓRGÃO|RELATOR|DATA DO JULG|<)/gi;
    const relatorRe = /RELATOR[A]?:\s*([^\n<]{5,80})/i;
    const dataRe    = /(?:DATA DO JULGAMENTO|JULGADO EM|Data):\s*(\d{1,2}\/\d{2}\/\d{4})/i;

    let mNum: RegExpExecArray | null;
    const processos: Array<{ numero: string; posicao: number }> = [];

    while ((mNum = blocoRe.exec(html)) !== null && processos.length < limite * 2) {
        processos.push({ numero: mNum[1]!.trim(), posicao: mNum.index });
    }

    for (let i = 0; i < Math.min(processos.length, limite); i++) {
        const start = processos[i]!.posicao;
        const end   = processos[i + 1]?.posicao ?? Math.min(start + 3000, html.length);
        const bloco = html.substring(start, end);

        const ementa  = campo(bloco, /(?:EMENTA|Ementa)[:\s]*([\s\S]{50,700}?)(?=\n\n|RELATOR|ÓRGÃO|PROCESSO:)/i);
        const relator = campo(bloco, /RELATOR[A]?[:\s]+([^\n<]{5,80})/i);
        const data    = campo(bloco, /(?:DATA DO JULGAMENTO|JULGADO EM)[:\s]+(\d{1,2}\/\d{2}\/\d{4})/i);

        if (processos[i]!.numero) {
            results.push({
                tribunal: 'STJ',
                numero:   processos[i]!.numero,
                ementa:   ementa.substring(0, 700),
                data,
                relator,
                url: `https://scon.stj.jus.br/SCON/jurisprudencia/toc.jsp?livre=${encodeURIComponent(processos[i]!.numero)}&b=ACOR`
            });
        }
    }

    // Fallback mais agressivo: busca números no formato STJ (REsp, AgRg, HC, MS...)
    if (results.length === 0) {
        const numRe = /\b((?:REsp|AgRg|HC|MS|RHC|ARE|AI|RE|AREsp|EDcl|EAREsp|EAg|CC|AR|EREsp|Rcl)\s+[\d.,]+\/\w{2})/gi;
        let m: RegExpExecArray | null;
        while ((m = numRe.exec(html)) !== null && results.length < limite) {
            const bloco   = html.substring(m.index, m.index + 2000);
            const ementa  = campo(bloco, /(?:ementa|EMENTA)[:\s]*([\s\S]{50,600}?)(?=\n\n|relator|RELATOR)/i);
            const relator = campo(bloco, /RELATOR[A]?[:\s]+([^\n<]{5,80})/i);
            const data    = campo(bloco, /(\d{1,2}\/\d{2}\/\d{4})/);
            results.push({
                tribunal: 'STJ',
                numero:   m[1]!,
                ementa:   ementa.substring(0, 700),
                data,
                relator,
                url: `https://scon.stj.jus.br/SCON/jurisprudencia/toc.jsp?livre=${encodeURIComponent(m[1]!)}&b=ACOR`
            });
        }
    }

    return results;
}

/**
 * TJSP — eSAJ (sistema usado por SP e vários outros TJs)
 * Resultados em tabela com linhas alternadas.
 */
function parseTJSP(html: string, limite: number): Acordao[] {
    const results: Acordao[] = [];

    // eSAJ: cada resultado fica em <tr class="fundoPadrao"> ou "fundoAlternadoClaro"
    const rowRe = /<tr[^>]*class=["'][^"']*(?:fundoPadrao|fundoAlternadoCla)[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
    let m: RegExpExecArray | null;

    while ((m = rowRe.exec(html)) !== null && results.length < limite) {
        const row = m[1]!;

        // Número do processo: link com texto tipo "0001234-56.2023.8.26.0000"
        const numero  = campo(row, /href="[^"]*getArquivo[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
                     || campo(row, /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
        const ementa  = campo(row, /class=["'][^"']*ementa[^"']*["'][^>]*>([\s\S]{50,700}?)<\//i)
                     || campo(row, /Ementa[:\s]*([\s\S]{50,600}?)(?=\n\n|<\/td>)/i);
        const relator = campo(row, /(?:Relator[a]?|Rel\.?)[:\s]*([^\n<]{5,60})/i);
        const data    = campo(row, /(\d{1,2}\/\d{2}\/\d{4})/);

        if (numero || ementa) {
            results.push({
                tribunal: 'TJSP',
                numero:   numero.substring(0, 60),
                ementa:   ementa.substring(0, 700),
                data,
                relator,
                url: `https://esaj.tjsp.jus.br/cjsg/resultados.do?q=${encodeURIComponent(numero)}`
            });
        }
    }

    return results;
}

/**
 * TRF4 — Tribunal Regional Federal da 4ª Região (RS, SC, PR)
 * Importante para previdenciário e tributário na região sul.
 */
function parseTRF4(html: string, limite: number): Acordao[] {
    const results: Acordao[] = [];

    // TRF4 usa portal moderno mas ementa aparece em blocos textuais
    const numRe = /\b(\d{4,7}-\d{2}\.\d{4}\.4\.\d{2}\.\d{4}|\bAC\s+\d{4,}\/\w{2}|\bAMS\s+\d{4,})/gi;
    let m: RegExpExecArray | null;

    while ((m = numRe.exec(html)) !== null && results.length < limite) {
        const bloco   = html.substring(m.index, m.index + 2500);
        const ementa  = campo(bloco, /(?:ementa|EMENTA)[:\s]*([\s\S]{50,700}?)(?=\n\n|relator|RELATOR|<\/)/i);
        const relator = campo(bloco, /(?:RELATOR[A]?|Relator[a]?)[:\s]+([^\n<]{5,80})/i);
        const data    = campo(bloco, /(?:Julgado?|Data)[:\s]*(\d{1,2}\/\d{2}\/\d{4})/i)
                     || campo(bloco, /(\d{1,2}\/\d{2}\/\d{4})/);

        if (m[1]) {
            results.push({
                tribunal: 'TRF4',
                numero:   m[1].trim(),
                ementa:   ementa.substring(0, 700),
                data,
                relator,
                url: `https://jurisprudencia.trf4.jus.br/`
            });
        }
    }

    return results;
}

/**
 * TRF1 — Maior TRF por território (Norte, Nordeste, Centro-Oeste)
 * Crítico para previdenciário, administrativo e ambiental.
 */
function parseTRF1(html: string, limite: number): Acordao[] {
    const results: Acordao[] = [];

    const numRe = /\b(\d{4,7}-\d{2}\.\d{4}\.4\.01\.\d{4}|\bAC\s+\d{4,}\/\w{2}|\bAMS\s+\d{4,}|\bREO\s+\d{4,})/gi;
    let m: RegExpExecArray | null;

    while ((m = numRe.exec(html)) !== null && results.length < limite) {
        const bloco   = html.substring(m.index, m.index + 2500);
        const ementa  = campo(bloco, /(?:ementa|EMENTA)[:\s]*([\s\S]{50,700}?)(?=\n\n|RELATOR|<\/)/i);
        const relator = campo(bloco, /RELATOR[A]?[:\s]+([^\n<]{5,80})/i);
        const data    = campo(bloco, /(\d{1,2}\/\d{2}\/\d{4})/);

        if (m[1]) {
            results.push({
                tribunal: 'TRF1',
                numero:   m[1].trim(),
                ementa:   ementa.substring(0, 700),
                data,
                relator,
                url: `https://jurisprudencia.trf1.jus.br/`
            });
        }
    }

    return results;
}

/**
 * TRT2 — São Paulo (maior TRT do Brasil, ~3M de processos)
 */
function parseTRT2(html: string, limite: number): Acordao[] {
    const results: Acordao[] = [];

    // TRT2 numera processos no padrão CNJ: NNNNNNN-DD.AAAA.5.02.XXXX
    const numRe = /\b(\d{7}-\d{2}\.\d{4}\.5\.02\.\d{4}|\bRO\s+\d{4,}\/\d{4}|\bRORSUM\s+\d{4,})/gi;
    let m: RegExpExecArray | null;

    while ((m = numRe.exec(html)) !== null && results.length < limite) {
        const bloco   = html.substring(m.index, m.index + 2000);
        const ementa  = campo(bloco, /(?:ementa|EMENTA)[:\s]*([\s\S]{50,700}?)(?=\n\n|RELATOR|<\/)/i);
        const relator = campo(bloco, /(?:RELATOR[A]?|Desembargador[a]?)[:\s]+([^\n<]{5,80})/i);
        const data    = campo(bloco, /(\d{1,2}\/\d{2}\/\d{4})/);

        results.push({
            tribunal: 'TRT2',
            numero:   m[1]!.trim(),
            ementa:   ementa.substring(0, 700),
            data,
            relator,
            url: `https://jurisprudencia.trt2.jus.br/`
        });
    }

    return results;
}

// ============================================================================
// BUSCADORES POR TRIBUNAL
// ============================================================================

async function buscarSTF(consulta: string, limite: number): Promise<Acordao[]> {
    const qs  = new URLSearchParams({ query: consulta, rows: String(limite), sort: 'date' }).toString();
    const raw = await httpGet(`https://jurisprudencia.stf.jus.br/api/search/search?${qs}`);
    const json = JSON.parse(raw);
    const hits: any[] = json?.hits?.hits ?? json?.result ?? json?.results ?? [];
    return hits.slice(0, limite).map((h: any) => {
        const s = h._source ?? h;
        return {
            tribunal: 'STF',
            numero:   String(s.numeroProcesso ?? s.numero ?? s.id ?? '').trim(),
            ementa:   String(s.ementa ?? s.texto ?? '').substring(0, 700).trim(),
            data:     String(s.dataJulgamento ?? s.data ?? '').trim(),
            relator:  String(s.relator ?? s.ministro ?? '').trim(),
            url:      s.url ?? 'https://jurisprudencia.stf.jus.br/'
        };
    }).filter((a: Acordao) => a.numero || a.ementa);
}

async function buscarTST(consulta: string, limite: number): Promise<Acordao[]> {
    const raw  = await httpPost('https://jurisprudencia.tst.jus.br/rest/jurisprudencia/pesquisar',
        { consulta, quantidade: limite, inicio: 0 });
    const json = JSON.parse(raw);
    const hits: any[] = json?.jurisprudencias ?? json?.hits?.hits ?? json?.results ?? [];
    return hits.slice(0, limite).map((h: any) => {
        const s = h._source ?? h;
        return {
            tribunal: 'TST',
            numero:   String(s.numAcordao ?? s.numero ?? s.numeroProcesso ?? '').trim(),
            ementa:   String(s.ementa ?? s.texto ?? '').substring(0, 700).trim(),
            data:     String(s.dataJulgamento ?? s.dataPublicacao ?? s.data ?? '').trim(),
            relator:  String(s.relator ?? s.ministro ?? '').trim(),
            url:      s.url ?? 'https://jurisprudencia.tst.jus.br/'
        };
    }).filter((a: Acordao) => a.numero || a.ementa);
}

async function buscarSTJ(consulta: string, limite: number): Promise<Acordao[]> {
    const qs  = new URLSearchParams({
        b:                  'ACOR',
        livre:              consulta,
        tipo_visualizacao:  'RESUMO',
        i:                  '1',
        f:                  String(limite)
    }).toString();
    const url = `https://scon.stj.jus.br/SCON/pesquisar.jsp?${qs}`;
    return buscarComFallback('STJ', url, parseSTJ, consulta, limite);
}

async function buscarTRF4(consulta: string, limite: number): Promise<Acordao[]> {
    const qs  = new URLSearchParams({ descricao: consulta, tipo: '1', acao: 'pesquisar' }).toString();
    const url = `https://jurisprudencia.trf4.jus.br/pesquisa/resultado.php?${qs}`;
    return buscarComFallback('TRF4', url, parseTRF4, consulta, limite);
}

async function buscarTRF1(consulta: string, limite: number): Promise<Acordao[]> {
    const qs  = new URLSearchParams({ palavras: consulta, acao: 'pesquisar' }).toString();
    const url = `https://jurisprudencia.trf1.jus.br/geral/index.php?${qs}`;
    return buscarComFallback('TRF1', url, parseTRF1, consulta, limite);
}

async function buscarTJSP(consulta: string, limite: number): Promise<Acordao[]> {
    const qs  = new URLSearchParams({
        q:              consulta,
        pesquisaLivre:  consulta,
        tipoDecisao:    'A',
        codigoCnj:      '',
        dtInicio:       '',
        dtFim:          ''
    }).toString();
    const url = `https://esaj.tjsp.jus.br/cjsg/resultados.do?${qs}`;
    return buscarComFallback('TJSP', url, parseTJSP, consulta, limite);
}

async function buscarTRT2(consulta: string, limite: number): Promise<Acordao[]> {
    // TRT2 tem portal de jurisprudência no domínio trt2.jus.br
    const qs  = new URLSearchParams({ q: consulta, rows: String(limite) }).toString();
    const url = `https://jurisprudencia.trt2.jus.br/pesquisa?${qs}`;
    return buscarComFallback('TRT2', url, parseTRT2, consulta, limite);
}

// ============================================================================
// REGISTRY
// ============================================================================

const BUSCADORES: Record<string, (consulta: string, limite: number) => Promise<Acordao[]>> = {
    STF:  buscarSTF,
    TST:  buscarTST,
    STJ:  buscarSTJ,
    TRF1: buscarTRF1,
    TRF4: buscarTRF4,
    TJSP: buscarTJSP,
    TRT2: buscarTRT2,
};

// Agrupamentos por área para roteamento inteligente
const AREAS: Record<string, string[]> = {
    constitucional: ['STF'],
    federal:        ['STF', 'STJ', 'TRF1', 'TRF4'],
    trabalhista:    ['TST', 'TRT2'],
    consumidor:     ['STJ', 'TJSP'],
    previdenciario: ['TRF1', 'TRF4', 'STJ'],
    estadual:       ['TJSP'],
    todos:          ['STF', 'TST', 'STJ'],
};

// ============================================================================
// SKILL
// ============================================================================

const pesquisaJurisprudencia: Skill = {
    nome:      'pesquisa_jurisprudencia',
    descricao: 'Pesquisa jurisprudência em fontes oficiais brasileiras (STF, TST, STJ, TRF1, TRF4, TJSP, TRT2) em tempo real. Use SEMPRE antes de citar acórdãos ou súmulas para evitar alucinação.',
    categoria: 'pesquisa',

    parametros: {
        consulta: {
            tipo:        'string',
            descricao:   'Termos de busca: tema jurídico, súmula, número de processo ou palavra-chave',
            obrigatorio: true
        },
        area: {
            tipo:        'string',
            descricao:   'Área do direito para roteamento automático: "constitucional", "federal", "trabalhista", "consumidor", "previdenciario", "estadual", "todos"',
            obrigatorio: false,
            default:     'todos',
            enum:        ['constitucional', 'federal', 'trabalhista', 'consumidor', 'previdenciario', 'estadual', 'todos']
        },
        tribunal: {
            tipo:        'string',
            descricao:   'Tribunal específico (sobrescreve "area"): "STF", "TST", "STJ", "TRF1", "TRF4", "TJSP", "TRT2"',
            obrigatorio: false,
            default:     ''
        },
        limite: {
            tipo:        'number',
            descricao:   'Máximo de resultados por tribunal (1-5, padrão 3)',
            obrigatorio: false,
            default:     3
        }
    },

    retorno: 'Lista de acórdãos com tribunal, número, ementa, data e relator. Cite SOMENTE resultados retornados aqui — nunca invente números de processo.',

    exemplos: [
        '{ "skill": "pesquisa_jurisprudencia", "parametros": { "consulta": "horas extras intervalo intrajornada", "area": "trabalhista" } }',
        '{ "skill": "pesquisa_jurisprudencia", "parametros": { "consulta": "rescisão indireta mora salarial", "tribunal": "TST" } }',
        '{ "skill": "pesquisa_jurisprudencia", "parametros": { "consulta": "dano moral relação consumo", "area": "consumidor" } }',
        '{ "skill": "pesquisa_jurisprudencia", "parametros": { "consulta": "benefício previdenciário incapacidade", "area": "previdenciario" } }',
        '{ "skill": "pesquisa_jurisprudencia", "parametros": { "consulta": "mandado de segurança STF súmula 635", "area": "constitucional" } }'
    ],

    execute: async (params: Record<string, any>, _context: AgentContext): Promise<SkillResult> => {
        const consulta = String(params['consulta'] || '').trim();
        const area     = String(params['area']     || 'todos');
        const tribunal = String(params['tribunal'] || '').trim().toUpperCase();
        const limite   = Math.min(5, Math.max(1, Number(params['limite'] || 3)));

        if (!consulta) {
            return { sucesso: false, erro: 'Parâmetro "consulta" obrigatório.', mensagem: '❌ Informe os termos de busca.' };
        }

        // Resolve fontes: tribunal específico ou área
        let fontes: string[];
        if (tribunal) {
            if (!BUSCADORES[tribunal]) {
                return {
                    sucesso:  false,
                    erro:     `Tribunal "${tribunal}" não reconhecido.`,
                    mensagem: `❌ Tribunais disponíveis: ${Object.keys(BUSCADORES).join(', ')}`
                };
            }
            fontes = [tribunal];
        } else {
            fontes = AREAS[area] ?? AREAS['todos']!;
        }

        console.log(`[Jurisprudência] "${consulta}" | area=${area} | fontes=[${fontes.join(', ')}]`);

        // Executa em paralelo com tolerância a falhas
        const resultados = await Promise.allSettled(
            fontes.map(f => BUSCADORES[f]!(consulta, limite))
        );

        const acordaos:            Acordao[] = [];
        const fontesSucesso:       string[]  = [];
        const fontesIndisponiveis: string[]  = [];

        resultados.forEach((r, i) => {
            const id = fontes[i]!;
            if (r.status === 'fulfilled' && r.value.length > 0) {
                acordaos.push(...r.value);
                fontesSucesso.push(id);
            } else {
                fontesIndisponiveis.push(id);
                if (r.status === 'rejected') {
                    console.warn(`[Jurisprudência] ${id}: ${(r.reason as Error)?.message ?? 'erro'}`);
                }
            }
        });

        if (acordaos.length === 0) {
            return {
                sucesso: false,
                erro:    `Nenhum resultado para "${consulta}"`,
                mensagem: [
                    `🔍 Nenhum resultado para **"${consulta}"**`,
                    `Fontes: ${fontes.join(', ')}`,
                    fontesIndisponiveis.length === fontes.length ? `(todas indisponíveis — verifique conexão)` : '',
                    ``,
                    `⚠️ **Não cite jurisprudência sem verificação por esta ferramenta.**`
                ].filter(Boolean).join('\n')
            };
        }

        const linhas = acordaos.map((a, i) => [
            `**${i + 1}. [${a.tribunal}]** ${a.numero || '(sem número)'}`,
            a.data    ? `📅 ${a.data}`     : '',
            a.relator ? `👤 ${a.relator}`  : '',
            a.ementa  ? `📝 ${a.ementa}`   : '(sem ementa)',
            a.url     ? `🔗 ${a.url}`      : ''
        ].filter(Boolean).join('\n'));

        const aviso = fontesIndisponiveis.length > 0
            ? `\n\n⚠️ Indisponíveis: ${fontesIndisponiveis.join(', ')}`
            : '';

        return {
            sucesso: true,
            dados: {
                consulta,
                total:                acordaos.length,
                acordaos,
                fontes_consultadas:   fontes,
                fontes_com_resultados: fontesSucesso,
                fontes_indisponiveis:  fontesIndisponiveis
            },
            mensagem: [
                `⚖️ **"${consulta}"** — ${acordaos.length} resultado(s) de [${fontesSucesso.join(', ')}]`,
                '',
                linhas.join('\n\n'),
                aviso
            ].join('\n')
        };
    }
};

export default pesquisaJurisprudencia;
export { pesquisaJurisprudencia };
