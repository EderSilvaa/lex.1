/**
 * DataJud API Client
 *
 * Wrapper para a API Pública do DataJud (CNJ).
 * Base: https://api-publica.datajud.cnj.jus.br
 *
 * Cada tribunal tem endpoint próprio: /api_publica_{tribunal}/_search
 * Auth: APIKey no header Authorization.
 * Body: Elasticsearch query.
 *
 * Rate limit: 800ms entre requests (respeitoso com a API pública).
 */

import { createHash } from 'crypto';
import {
    ProcessoDataJud,
    DataJudMovimentacao,
    DataJudParte,
    RATE_LIMIT_MS,
    REQUEST_TIMEOUT_MS,
} from './types';

// ═══════════════════════════════════════════════════════════════════════
// MAPA DE TRIBUNAIS → ENDPOINT DATAJUD
// ═══════════════════════════════════════════════════════════════════════

/**
 * Mapa tribunal → sufixo da API DataJud.
 * DataJud usa nomes em lowercase como sufixo do endpoint.
 * Ex: TJSP → api_publica_tjsp/_search
 */
const DATAJUD_TRIBUNAIS: Record<string, string> = {
    // Supremo e Superiores
    STF: 'stf',
    STJ: 'stj',
    TST: 'tst',
    TSE: 'tse',
    STM: 'stm',

    // Tribunais Regionais Federais
    TRF1: 'trf1', TRF2: 'trf2', TRF3: 'trf3', TRF4: 'trf4', TRF5: 'trf5', TRF6: 'trf6',

    // Tribunais Regionais do Trabalho
    TRT1: 'trt1', TRT2: 'trt2', TRT3: 'trt3', TRT4: 'trt4', TRT5: 'trt5',
    TRT6: 'trt6', TRT7: 'trt7', TRT8: 'trt8', TRT9: 'trt9', TRT10: 'trt10',
    TRT11: 'trt11', TRT12: 'trt12', TRT13: 'trt13', TRT14: 'trt14', TRT15: 'trt15',
    TRT16: 'trt16', TRT17: 'trt17', TRT18: 'trt18', TRT19: 'trt19', TRT20: 'trt20',
    TRT21: 'trt21', TRT22: 'trt22', TRT23: 'trt23', TRT24: 'trt24',

    // Tribunais de Justiça Estaduais
    TJAC: 'tjac', TJAL: 'tjal', TJAM: 'tjam', TJAP: 'tjap', TJBA: 'tjba',
    TJCE: 'tjce', TJDFT: 'tjdft', TJES: 'tjes', TJGO: 'tjgo', TJMA: 'tjma',
    TJMG: 'tjmg', TJMS: 'tjms', TJMT: 'tjmt', TJPA: 'tjpa', TJPB: 'tjpb',
    TJPE: 'tjpe', TJPI: 'tjpi', TJPR: 'tjpr', TJRJ: 'tjrj', TJRN: 'tjrn',
    TJRO: 'tjro', TJRR: 'tjrr', TJRS: 'tjrs', TJSC: 'tjsc', TJSE: 'tjse',
    TJSP: 'tjsp', TJTO: 'tjto',

    // Tribunais Regionais Eleitorais
    TRE_AC: 'tre-ac', TRE_AL: 'tre-al', TRE_AM: 'tre-am', TRE_AP: 'tre-ap',
    TRE_BA: 'tre-ba', TRE_CE: 'tre-ce', TRE_DF: 'tre-df', TRE_ES: 'tre-es',
    TRE_GO: 'tre-go', TRE_MA: 'tre-ma', TRE_MG: 'tre-mg', TRE_MS: 'tre-ms',
    TRE_MT: 'tre-mt', TRE_PA: 'tre-pa', TRE_PB: 'tre-pb', TRE_PE: 'tre-pe',
    TRE_PI: 'tre-pi', TRE_PR: 'tre-pr', TRE_RJ: 'tre-rj', TRE_RN: 'tre-rn',
    TRE_RO: 'tre-ro', TRE_RR: 'tre-rr', TRE_RS: 'tre-rs', TRE_SC: 'tre-sc',
    TRE_SE: 'tre-se', TRE_SP: 'tre-sp', TRE_TO: 'tre-to',
};

const BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Hash MD5 simples para detectar mudanças em movimentações */
export function hashMovimentacoes(movs: DataJudMovimentacao[]): string {
    const text = movs.map(m => `${m.codigo}:${m.dataHora}:${m.nome}`).join('|');
    return createHash('md5').update(text).digest('hex').substring(0, 16);
}

/**
 * Resolve o código do tribunal para o sufixo da API DataJud.
 * Tenta match exato, depois uppercase, depois inferência pelo número CNJ.
 */
function resolveEndpoint(tribunal: string): string | null {
    // Match exato
    if (DATAJUD_TRIBUNAIS[tribunal]) return DATAJUD_TRIBUNAIS[tribunal]!;

    // Tenta uppercase
    const upper = tribunal.toUpperCase();
    if (DATAJUD_TRIBUNAIS[upper]) return DATAJUD_TRIBUNAIS[upper]!;

    // Tenta sem hífen/underscore
    const cleaned = upper.replace(/[-_\s]/g, '');
    if (DATAJUD_TRIBUNAIS[cleaned]) return DATAJUD_TRIBUNAIS[cleaned]!;

    return null;
}

/**
 * Infere o código do tribunal a partir do número CNJ.
 * Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
 * J = Justiça (5=trabalho, 8=estadual, 4=federal)
 * TR = Tribunal (código de 2 dígitos)
 */
export function inferTribunalFromCNJ(numeroCNJ: string): string | null {
    const match = numeroCNJ.match(/\d{7}-\d{2}\.\d{4}\.(\d)\.(\d{2})\.\d{4}/);
    if (!match || !match[1] || !match[2]) return null;

    const justica = parseInt(match[1], 10);
    const tribunalCode = parseInt(match[2], 10);

    switch (justica) {
        case 1: return 'STF';
        case 2: return 'STJ';
        case 3: return 'TSE';
        case 4: return `TRF${tribunalCode}`;
        case 5: return `TRT${tribunalCode}`;
        case 6: return 'STM';
        case 8: {
            // Justiça Estadual — código do tribunal → sigla do estado
            const TJ_MAP: Record<number, string> = {
                1: 'TJAC', 2: 'TJAL', 3: 'TJAM', 4: 'TJAP', 5: 'TJBA',
                6: 'TJCE', 7: 'TJDFT', 8: 'TJES', 9: 'TJGO', 10: 'TJMA',
                11: 'TJMG', 12: 'TJMS', 13: 'TJMT', 14: 'TJPA', 15: 'TJPB',
                16: 'TJPE', 17: 'TJPI', 18: 'TJPR', 19: 'TJRJ', 20: 'TJRN',
                21: 'TJRO', 22: 'TJRR', 23: 'TJRS', 24: 'TJSC', 25: 'TJSE',
                26: 'TJSP', 27: 'TJTO',
            };
            return TJ_MAP[tribunalCode] || null;
        }
        default: return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// DATAJUD CLIENT
// ═══════════════════════════════════════════════════════════════════════

export class DataJudClient {
    private apiKey: string;
    private lastRequestTime = 0;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    // ── Rate-limited fetch ──────────────────────────────────────────

    private async rateLimitedFetch(url: string, body: object): Promise<any> {
        // Rate limit: aguarda 800ms desde último request
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < RATE_LIMIT_MS) {
            await delay(RATE_LIMIT_MS - elapsed);
        }

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

        try {
            this.lastRequestTime = Date.now();
            const res = await fetch(url, {
                method: 'POST',
                signal: ctrl.signal,
                headers: {
                    'Authorization': `APIKey ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(body),
            });

            clearTimeout(timer);

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`DataJud HTTP ${res.status}: ${text.substring(0, 200)}`);
            }

            return await res.json();
        } catch (err: any) {
            clearTimeout(timer);
            if (err.name === 'AbortError') {
                throw new Error('DataJud timeout (14s)');
            }
            throw err;
        }
    }

    private getEndpointUrl(tribunal: string): string | null {
        const suffix = resolveEndpoint(tribunal);
        if (!suffix) return null;
        return `${BASE_URL}/api_publica_${suffix}/_search`;
    }

    // ── Buscar por número CNJ ───────────────────────────────────────

    async buscarPorNumero(numero: string, tribunal?: string): Promise<ProcessoDataJud | null> {
        // Infere tribunal se não fornecido
        const trib = tribunal || inferTribunalFromCNJ(numero);
        if (!trib) throw new Error('Tribunal não identificado. Forneça o código ou use número CNJ completo.');

        const url = this.getEndpointUrl(trib);
        if (!url) throw new Error(`Tribunal '${trib}' não suportado no DataJud.`);

        const query = {
            size: 1,
            query: {
                match: {
                    numeroProcesso: numero.replace(/[.\-]/g, ''),
                }
            },
            sort: [{ '@timestamp': { order: 'desc' } }],
        };

        const result = await this.rateLimitedFetch(url, query);
        const hits = result?.hits?.hits;
        if (!hits || hits.length === 0) return null;

        return this.parseProcesso(hits[0]._source, trib);
    }

    // ── Buscar movimentações ────────────────────────────────────────

    async buscarMovimentacoes(numero: string, tribunal: string): Promise<DataJudMovimentacao[]> {
        const processo = await this.buscarPorNumero(numero, tribunal);
        if (!processo) return [];
        return processo.movimentacoes;
    }

    // ── Buscar por parte ────────────────────────────────────────────

    async buscarPorParte(nome: string, tribunal: string, limite = 10): Promise<ProcessoDataJud[]> {
        const url = this.getEndpointUrl(tribunal);
        if (!url) throw new Error(`Tribunal '${tribunal}' não suportado no DataJud.`);

        const query = {
            size: Math.min(limite, 20),
            query: {
                nested: {
                    path: 'dadosBasicos.polo',
                    query: {
                        nested: {
                            path: 'dadosBasicos.polo.parte',
                            query: {
                                match: {
                                    'dadosBasicos.polo.parte.nome': nome,
                                }
                            }
                        }
                    }
                }
            },
            sort: [{ '@timestamp': { order: 'desc' } }],
        };

        try {
            const result = await this.rateLimitedFetch(url, query);
            const hits = result?.hits?.hits || [];
            return hits.map((h: any) => this.parseProcesso(h._source, tribunal));
        } catch {
            // Fallback: busca simples por texto
            return this.buscarPorTexto(nome, tribunal, limite);
        }
    }

    // ── Busca genérica por texto ────────────────────────────────────

    async buscarPorTexto(texto: string, tribunal: string, limite = 10): Promise<ProcessoDataJud[]> {
        const url = this.getEndpointUrl(tribunal);
        if (!url) throw new Error(`Tribunal '${tribunal}' não suportado no DataJud.`);

        const query = {
            size: Math.min(limite, 20),
            query: {
                multi_match: {
                    query: texto,
                    fields: ['classe.nome', 'assunto.nome', 'orgaoJulgador.nome'],
                }
            },
            sort: [{ '@timestamp': { order: 'desc' } }],
        };

        const result = await this.rateLimitedFetch(url, query);
        const hits = result?.hits?.hits || [];
        return hits.map((h: any) => this.parseProcesso(h._source, tribunal));
    }

    // ── Health check ────────────────────────────────────────────────

    async healthCheck(): Promise<boolean> {
        try {
            // Testa com um tribunal qualquer (STJ é estável)
            const url = `${BASE_URL}/api_publica_stj/_search`;
            const query = { size: 0 }; // sem resultados, só testa conexão
            await this.rateLimitedFetch(url, query);
            return true;
        } catch {
            return false;
        }
    }

    // ── Parser ──────────────────────────────────────────────────────

    private parseProcesso(source: any, tribunal: string): ProcessoDataJud {
        const dados = source?.dadosBasicos || source || {};
        const movs = source?.movimento || source?.movimentacoes || [];

        // Extrai partes dos polos
        const partes: DataJudParte[] = [];
        const polos = dados.polo || [];
        for (const polo of polos) {
            const tipoPolo = (polo.polo || '').toUpperCase();
            for (const parte of (polo.parte || [])) {
                partes.push({
                    nome: parte.nome || 'Não informado',
                    tipo: tipoPolo === 'AT' ? 'AUTOR' : tipoPolo === 'PA' ? 'REU' : tipoPolo,
                    documento: parte.documento || undefined,
                });
            }
        }

        // Extrai movimentações
        const movimentacoes: DataJudMovimentacao[] = Array.isArray(movs)
            ? movs.map((m: any) => ({
                codigo: m.codigo || m.codigoNacional || 0,
                nome: m.nome || m.descricao || 'Movimentação',
                dataHora: m.dataHora || m.data || '',
                complemento: m.complemento || m.complementosTabelados?.map((c: any) => c.descricao).join('; ') || undefined,
            }))
            : [];

        // Ordena movimentações por data (mais recente primeiro)
        movimentacoes.sort((a, b) => {
            if (!a.dataHora || !b.dataHora) return 0;
            return b.dataHora.localeCompare(a.dataHora);
        });

        return {
            numero: dados.numero || source?.numeroProcesso || '',
            classe: dados.classeProcessual?.nome || dados.classe?.nome || '',
            assunto: Array.isArray(dados.assunto)
                ? dados.assunto.map((a: any) => a.nome).join(', ')
                : (dados.assunto?.nome || ''),
            tribunal,
            orgaoJulgador: dados.orgaoJulgador?.nome || '',
            dataAjuizamento: dados.dataAjuizamento || '',
            grau: dados.grau || source?.grau || '',
            nivelSigilo: dados.nivelSigilo || 0,
            partes,
            movimentacoes,
            _fetchedAt: new Date().toISOString(),
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

export { DATAJUD_TRIBUNAIS, resolveEndpoint };
