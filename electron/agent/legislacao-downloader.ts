/**
 * Lex — Downloader de Legislação
 *
 * Baixa os principais códigos brasileiros do Planalto.gov.br,
 * converte para texto limpo e salva em userData/lex-legislacao/.
 * Os arquivos são indexados automaticamente pelo RAG TF-IDF.
 *
 * Ciclo de vida automático:
 *   1. No boot do app (15s de delay) — baixa o que falta silenciosamente
 *   2. A cada 24h — verifica arquivos > MAX_IDADE_DIAS e re-baixa
 *   3. Usuário pode forçar re-download manual pela UI
 *
 * Metadados rastreados em lex-legislacao/meta.json por arquivo.
 */

import * as fs   from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIG
// ============================================================================

/** Dias até um arquivo ser considerado desatualizado */
export const MAX_IDADE_DIAS = 30;

// ============================================================================
// CATÁLOGO DE LEGISLAÇÃO
// ============================================================================

export interface LegislacaoItem {
    id:   string;   // nome do arquivo gerado (sem .txt)
    nome: string;   // nome legível para logs/UI
    url:  string;   // URL do texto compilado no Planalto
    area: string;   // área do direito
}

export const CATALOGO_LEGISLACAO: LegislacaoItem[] = [
    // Constituição
    { id: 'CF_1988',      nome: 'Constituição Federal de 1988',                         url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',              area: 'constitucional' },
    // Civil / Processual
    { id: 'CC_2002',      nome: 'Código Civil (Lei 10.406/2002)',                        url: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm',             area: 'civil' },
    { id: 'CPC_2015',     nome: 'Código de Processo Civil (Lei 13.105/2015)',            url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm',        area: 'processual' },
    { id: 'CDC',          nome: 'Código de Defesa do Consumidor (Lei 8.078/1990)',       url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm',                  area: 'consumidor' },
    // Trabalhista
    { id: 'CLT',          nome: 'CLT — Consolidação das Leis do Trabalho',              url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm',         area: 'trabalhista' },
    { id: 'Lei_9799_1999',nome: 'Lei 9.799/1999 (Mercado de Trabalho - Mulher)',         url: 'https://www.planalto.gov.br/ccivil_03/leis/l9799.htm',                           area: 'trabalhista' },
    // Penal
    { id: 'CP',           nome: 'Código Penal (Decreto-Lei 2.848/1940)',                 url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm',         area: 'penal' },
    { id: 'CPP',          nome: 'Código de Processo Penal (Decreto-Lei 3.689/1941)',     url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm',         area: 'penal' },
    // Tributário
    { id: 'CTN',          nome: 'Código Tributário Nacional (Lei 5.172/1966)',           url: 'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm',                  area: 'tributario' },
    // Social / Família
    { id: 'ECA',          nome: 'Estatuto da Criança e do Adolescente (Lei 8.069/1990)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8069.htm',                           area: 'familia' },
    { id: 'Lei_8213_1991',nome: 'Lei 8.213/1991 (Benefícios Previdenciários)',           url: 'https://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm',                       area: 'previdenciario' },
    // Administrativo
    { id: 'Lei_8666_1993',nome: 'Lei 8.666/1993 (Licitações e Contratos)',               url: 'https://www.planalto.gov.br/ccivil_03/leis/l8666cons.htm',                       area: 'administrativo' },
    { id: 'Lei_9784_1999',nome: 'Lei 9.784/1999 (Processo Administrativo Federal)',      url: 'https://www.planalto.gov.br/ccivil_03/leis/l9784.htm',                           area: 'administrativo' },
];

// ============================================================================
// METADADOS
// ============================================================================

interface MetaEntry {
    downloadedAt: string;   // ISO date (YYYY-MM-DD)
    bytes:        number;
}
type MetaStore = Record<string, MetaEntry>;

function metaPath(legDir: string): string {
    return path.join(legDir, 'meta.json');
}

function readMeta(legDir: string): MetaStore {
    try {
        const p = metaPath(legDir);
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* ignora */ }
    return {};
}

function writeMeta(legDir: string, meta: MetaStore): void {
    try {
        fs.writeFileSync(metaPath(legDir), JSON.stringify(meta, null, 2), 'utf8');
    } catch { /* ignora falha de escrita */ }
}

function idadeEmDias(dateStr: string): number {
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return Infinity;
    return (Date.now() - then) / (1000 * 60 * 60 * 24);
}

// ============================================================================
// HTML → TEXTO LIMPO
// ============================================================================

function htmlParaTexto(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<aside[\s\S]*?<\/aside>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();
}

// ============================================================================
// VERIFICAÇÃO DE ATUALIZAÇÕES
// ============================================================================

/**
 * Retorna a lista de itens que precisam de (re)download:
 * - Arquivo .txt ausente ou menor que 1 KB
 * - Metadado ausente ou mais antigo que maxIdadeDias
 */
export function verificarDesatualizados(
    userDataDir: string,
    maxIdadeDias = MAX_IDADE_DIAS
): LegislacaoItem[] {
    const legDir = path.join(userDataDir, 'lex-legislacao');
    const meta   = readMeta(legDir);

    return CATALOGO_LEGISLACAO.filter(item => {
        const filePath = path.join(legDir, `${item.id}.txt`);
        const existe   = fs.existsSync(filePath);
        const tamanhoOk = existe && fs.statSync(filePath).size > 1000;

        if (!tamanhoOk) return true;  // arquivo ausente ou corrompido

        const entrada = meta[item.id];
        if (!entrada) return true;    // nunca foi registrado nos metadados

        return idadeEmDias(entrada.downloadedAt) > maxIdadeDias;
    });
}

// ============================================================================
// DOWNLOAD DE UM ITEM
// ============================================================================

async function downloadItem(
    item: LegislacaoItem,
    legDir: string,
    meta: MetaStore,
    onProgress?: (msg: string) => void
): Promise<boolean> {
    onProgress?.(`[↓] ${item.nome}…`);

    try {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30_000);

        const resp = await fetch(item.url, {
            signal:  ctrl.signal,
            headers: {
                'User-Agent': 'LEX-Agent/1.0 (indexacao legislacao oficial)',
                'Accept':     'text/html,application/xhtml+xml'
            }
        });
        clearTimeout(timer);

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const html  = await resp.text();
        const texto = htmlParaTexto(html);

        if (texto.length < 500) {
            throw new Error('Conteúdo muito curto — possível bloqueio');
        }

        const conteudo = [
            `# ${item.nome}`,
            `Fonte: ${item.url}`,
            `Área: ${item.area}`,
            `Atualizado: ${new Date().toISOString().split('T')[0]}`,
            '',
            texto
        ].join('\n');

        const filePath = path.join(legDir, `${item.id}.txt`);
        fs.writeFileSync(filePath, conteudo, 'utf8');

        // Atualiza metadados
        meta[item.id] = {
            downloadedAt: new Date().toISOString().split('T')[0]!,
            bytes:        conteudo.length
        };

        onProgress?.(`[✓] ${item.nome} — ${(conteudo.length / 1024).toFixed(0)} KB`);
        return true;

    } catch (e: any) {
        onProgress?.(`[✗] ${item.nome} — ${e.message ?? 'erro'}`);
        return false;
    }
}

// ============================================================================
// DOWNLOAD INCREMENTAL (público — só baixa o que está faltando/desatualizado)
// ============================================================================

export interface DownloadSummary {
    dir:       string;
    total:     number;
    sucesso:   number;
    falhas:    number;
    pulados:   number;
}

type ProgressCallback = (msg: string) => void;

/**
 * Baixa apenas os itens ausentes ou desatualizados (>= maxIdadeDias).
 * Ideal para o ciclo automático (boot + interval).
 */
export async function downloadIncremental(
    userDataDir: string,
    onProgress?: ProgressCallback,
    maxIdadeDias = MAX_IDADE_DIAS
): Promise<DownloadSummary> {
    const legDir = path.join(userDataDir, 'lex-legislacao');
    if (!fs.existsSync(legDir)) fs.mkdirSync(legDir, { recursive: true });

    const meta     = readMeta(legDir);
    const pendentes = verificarDesatualizados(userDataDir, maxIdadeDias);
    const pulados   = CATALOGO_LEGISLACAO.length - pendentes.length;

    if (pendentes.length === 0) {
        onProgress?.('Legislação em dia — nenhuma atualização necessária.');
        return { dir: legDir, total: CATALOGO_LEGISLACAO.length, sucesso: 0, falhas: 0, pulados };
    }

    onProgress?.(`${pendentes.length} arquivo(s) para atualizar…`);

    let sucesso = 0;
    let falhas  = 0;

    for (const item of pendentes) {
        const ok = await downloadItem(item, legDir, meta, onProgress);
        if (ok) sucesso++; else falhas++;

        // Salva metadados após cada item (mesmo em falhas parciais)
        writeMeta(legDir, meta);

        // Pausa gentil entre requests
        if (pendentes.indexOf(item) < pendentes.length - 1) {
            await new Promise(r => setTimeout(r, 800));
        }
    }

    writeMeta(legDir, meta);
    onProgress?.(`Concluído: ${sucesso} atualizados, ${falhas} falhas, ${pulados} já em dia.`);

    return { dir: legDir, total: CATALOGO_LEGISLACAO.length, sucesso, falhas, pulados };
}

/**
 * Força re-download de todos os itens, independente da idade.
 * Para uso manual pelo usuário.
 */
export async function downloadTudo(
    userDataDir: string,
    onProgress?: ProgressCallback
): Promise<DownloadSummary> {
    return downloadIncremental(userDataDir, onProgress, 0);
}

// ============================================================================
// STATS
// ============================================================================

export interface LegislacaoStats {
    total:    number;
    baixados: number;
    dir:      string;
    proximaVerificacao: string | null;
    arquivos: Array<{ id: string; nome: string; kb: number; area: string; downloadedAt: string | null }>;
}

export function getLegislacaoStats(userDataDir: string): LegislacaoStats {
    const legDir = path.join(userDataDir, 'lex-legislacao');
    const meta   = readMeta(legDir);

    const arquivos = CATALOGO_LEGISLACAO.map(item => {
        const filePath = path.join(legDir, `${item.id}.txt`);
        const existe   = fs.existsSync(filePath);
        const kb       = existe ? Math.round(fs.statSync(filePath).size / 1024) : 0;
        const m        = meta[item.id];
        return {
            id:           item.id,
            nome:         item.nome,
            kb,
            area:         item.area,
            downloadedAt: m?.downloadedAt ?? null,
            baixado:      existe && kb > 1
        };
    });

    // Próxima verificação = data do arquivo mais antigo + MAX_IDADE_DIAS
    const datas = Object.values(meta).map(m => new Date(m.downloadedAt).getTime()).filter(n => !isNaN(n));
    const maisAntigo = datas.length > 0 ? Math.min(...datas) : null;
    const proximaVerificacao = maisAntigo
        ? new Date(maisAntigo + MAX_IDADE_DIAS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
        : null;

    return {
        total:    CATALOGO_LEGISLACAO.length,
        baixados: arquivos.filter(a => a.baixado).length,
        dir:      legDir,
        proximaVerificacao,
        arquivos: arquivos.filter(a => a.baixado)
    };
}
