/**
 * OS Tools
 *
 * Operações de sistema de arquivos e OS expostas ao agent.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { shell } from 'electron';
import { registrarAuditoriaOs } from './os-audit';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Limite de tamanho de arquivo para leitura (2 MB)
const MAX_READ_BYTES = 2 * 1024 * 1024;

// Extensões binárias que não podem ser lidas como texto
const BINARY_EXTENSIONS = new Set([
    '.exe', '.dll', '.bin', '.zip', '.tar', '.gz', '.7z', '.rar',
    '.mp3', '.mp4', '.avi', '.mkv', '.jpg', '.jpeg', '.png', '.gif',
    '.bmp', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.db', '.sqlite'
]);

// Extensões suportadas para busca de conteúdo
const TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm',
    '.js', '.ts', '.py', '.java', '.cs', '.cpp', '.c', '.h',
    '.pdf', '.docx', '.doc', '.rtf', '.odt', '.xlsx', '.xls'
]);

// Comandos bloqueados por segurança
const BLOCKED_COMMANDS = [
    'format', 'del /f', 'rm -rf', 'rmdir /s', 'rd /s',
    'shutdown', 'restart', 'reboot', 'taskkill /f',
    'reg delete', 'bcdedit', 'diskpart', 'cipher /w',
    'net user', 'net localgroup', 'icacls', 'takeown',
    'powershell -encodedcommand', 'certutil -decode'
];

export interface OsToolResult {
    sucesso: boolean;
    dados?: any;
    erro?: string;
    codigo?: string;
    sugestao?: string;
}

export type OsErrorCode =
    | 'destino_existe'
    | 'nao_encontrado'
    | 'caminho_ambiguo'
    | 'sem_permissao'
    | 'arquivo_binario'
    | 'arquivo_muito_grande'
    | 'pasta_nao_vazia'
    | 'comando_bloqueado'
    | 'erro_io'
    | 'operacao_invalida';

function erroOs(codigo: OsErrorCode, erro: string, sugestao?: string, dados?: any): OsToolResult {
    return { sucesso: false, codigo, erro, sugestao, dados };
}

function codigoFs(error: any): OsErrorCode {
    if (error?.code === 'ENOENT') return 'nao_encontrado';
    if (error?.code === 'EACCES' || error?.code === 'EPERM') return 'sem_permissao';
    return 'erro_io';
}

function sugestaoFs(codigo: OsErrorCode): string {
    switch (codigo) {
        case 'nao_encontrado':
            return 'Verifique se o caminho existe ou liste a pasta pai antes de tentar de novo.';
        case 'sem_permissao':
            return 'Escolha outro local ou execute com permissao suficiente.';
        default:
            return 'Verifique o caminho e tente novamente.';
    }
}

function erroFs(error: any, mensagem: string): OsToolResult {
    const codigo = codigoFs(error);
    return erroOs(codigo, `${mensagem}: ${error.message}`, sugestaoFs(codigo));
}

async function auditarMutacao(
    operacao: string,
    resultado: OsToolResult,
    detalhes: { origem?: string; destino?: string; alvos?: string[] } = {}
): Promise<OsToolResult> {
    await registrarAuditoriaOs({
        operacao,
        sucesso: resultado.sucesso,
        origem: detalhes.origem,
        destino: detalhes.destino,
        alvos: detalhes.alvos,
        codigo: resultado.codigo,
        erro: resultado.erro,
        dados: resultado.dados
    });
    return resultado;
}

const PATH_ALIASES: Record<string, string> = {
    '~': 'home',
    home: 'home',
    downloads: 'downloads',
    desktop: 'desktop',
    documentos: 'documentos',
    documents: 'documentos',
    imagens: 'imagens',
    pictures: 'imagens',
    videos: 'videos',
    musica: 'musica',
    music: 'musica',
    appdata: 'appData',
    temp: 'temp',
    tmp: 'temp',
    onedrive: 'oneDrive'
};

/**
 * Resolve caminhos amigaveis usados pelas OS skills:
 * - "downloads" -> pasta Downloads
 * - "downloads/a.pdf" -> Downloads/a.pdf
 * - "~/a.pdf" -> home/a.pdf
 * - caminhos absolutos ficam intactos
 */
export function resolverCaminhoOs(rawPath: string): string {
    const limpo = String(rawPath || '').trim();
    if (!limpo) return limpo;
    if (path.isAbsolute(limpo)) return path.normalize(limpo);

    const pastas = pastasConhecidas().dados!;
    const partes = limpo.split(/[/\\]/).filter(Boolean);
    if (partes.length === 0) return pastas.home;

    const primeira = partes[0]!.toLowerCase();
    const alias = PATH_ALIASES[primeira];
    if (!alias) return path.resolve(limpo);

    return path.join(pastas[alias], ...partes.slice(1));
}

export type ResolverEntradaOsOptions = {
    baseDir?: string;
    mustExist?: boolean;
};

function caminhoTemBasePropria(rawPath: string): boolean {
    const limpo = String(rawPath || '').trim();
    if (!limpo) return true;
    if (path.isAbsolute(limpo)) return true;
    if (/^~(?:[\\/]|$)/.test(limpo)) return true;

    const primeira = limpo.split(/[/\\]/).filter(Boolean)[0]?.toLowerCase();
    return Boolean(primeira && PATH_ALIASES[primeira]);
}

export function aplicarBaseCaminhoOs(rawPath: string, baseDir?: string): string {
    const limpo = String(rawPath || '').trim();
    if (!limpo || !baseDir || caminhoTemBasePropria(limpo)) return limpo;
    return path.join(resolverCaminhoOs(baseDir), limpo);
}

export async function resolverEntradaOs(rawPath: string, opts: ResolverEntradaOsOptions = {}): Promise<OsToolResult> {
    const entrada = aplicarBaseCaminhoOs(rawPath, opts.baseDir);
    const caminho = resolverCaminhoOs(entrada);

    if (!opts.mustExist) {
        return {
            sucesso: true,
            dados: {
                caminho,
                original: rawPath,
                baseDir: opts.baseDir,
                fuzzy: false
            }
        };
    }

    const resolucao = await resolverCaminhoExistenteOs(entrada);
    if (!resolucao.sucesso) return resolucao;

    return {
        sucesso: true,
        dados: {
            ...resolucao.dados,
            original: rawPath,
            baseDir: opts.baseDir
        }
    };
}

async function resolverCaminhoExistenteOs(rawPath: string): Promise<OsToolResult> {
    const resolved = resolverCaminhoOs(rawPath);
    try {
        await fs.access(resolved);
        return { sucesso: true, dados: { caminho: resolved, fuzzy: false } };
    } catch (error: any) {
        const recuperadoPorNome = await recuperarPorNomeNormalizado(resolved, rawPath);
        if (recuperadoPorNome) return recuperadoPorNome;

        if (!String(rawPath || '').includes('…')) {
            return erroFs(error, `Caminho "${rawPath}" nao encontrado`);
        }
    }

    const dir = path.dirname(resolved);
    const base = path.basename(resolved);
    const prefix = base.split('…')[0]?.trim();
    if (!prefix || prefix.length < 6) {
        return erroOs(
            'nao_encontrado',
            `Caminho "${rawPath}" esta truncado e nao tem prefixo suficiente para recuperar com seguranca.`,
            'Liste/busque o arquivo novamente e use o caminho completo.'
        );
    }

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const prefixNorm = normalizarParaComparacao(prefix);
        const matches = entries
            .filter(e => normalizarParaComparacao(e.name).startsWith(prefixNorm))
            .map(e => path.join(dir, e.name));

        if (matches.length === 1) {
            return { sucesso: true, dados: { caminho: matches[0], fuzzy: true, original: rawPath } };
        }

        if (matches.length > 1) {
            return erroOs(
                'caminho_ambiguo',
                `Caminho truncado "${rawPath}" corresponde a ${matches.length} itens.`,
                'Peça para listar os resultados e escolha o caminho completo antes de deletar.',
                { candidatos: matches.slice(0, 10), total: matches.length }
            );
        }

        return erroOs(
            'nao_encontrado',
            `Caminho "${rawPath}" nao existe e nenhum arquivo com prefixo "${prefix}" foi encontrado em "${dir}".`,
            'Busque o arquivo novamente e use um dos caminhos retornados.'
        );
    } catch (error: any) {
        return erroFs(error, `Erro ao recuperar caminho truncado "${rawPath}"`);
    }
}

async function recuperarPorNomeNormalizado(resolved: string, rawPath: string): Promise<OsToolResult | null> {
    try {
        const dir = path.dirname(resolved);
        const baseRaw = path.basename(resolved);
        const baseNorm = normalizarParaComparacao(baseRaw);
        const baseLoose = normalizarParaComparacaoSolta(baseRaw);
        const entries = await fs.readdir(dir, { withFileTypes: true });
        let matchedEntries = entries
            .filter(e => normalizarParaComparacao(e.name) === baseNorm);
        let matches = matchedEntries.map(e => path.join(dir, e.name));

        if (matches.length === 0 && baseLoose.length >= 8) {
            matchedEntries = entries
                .filter(e => normalizarParaComparacaoSolta(e.name) === baseLoose);
            matches = matchedEntries.map(e => path.join(dir, e.name));
        }

        if (matches.length === 1) {
            return { sucesso: true, dados: { caminho: matches[0], fuzzy: true, original: rawPath } };
        }

        if (matches.length > 1) {
            const escolhido = escolherMatchMaisEspecifico(baseRaw, matchedEntries.map(e => e.name));
            if (escolhido) {
                return { sucesso: true, dados: { caminho: path.join(dir, escolhido), fuzzy: true, original: rawPath, candidatosIgnorados: matches.length - 1 } };
            }

            return erroOs(
                'caminho_ambiguo',
                `Caminho "${rawPath}" corresponde a ${matches.length} itens apos normalizacao.`,
                'Liste os resultados e escolha o caminho completo antes de deletar.',
                { candidatos: matches.slice(0, 10), total: matches.length }
            );
        }
    } catch {
        return null;
    }

    return null;
}

function normalizarParaComparacao(value: string): string {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function normalizarUnicode(value: string): string {
    return String(value || '').normalize('NFC');
}

function temAcento(value: string): boolean {
    return /[\u0300-\u036f]/.test(String(value || '').normalize('NFD'));
}

function iniciaComMaiuscula(value: string): boolean {
    return /^[A-ZÁÀÂÃÉÈÊÍÌÓÒÔÕÚÙÛÇ]/.test(normalizarUnicode(value));
}

function escolherMatchMaisEspecifico(rawBase: string, nomes: string[]): string | null {
    const rawNfc = normalizarUnicode(rawBase);
    const exato = nomes.filter(nome => normalizarUnicode(nome) === rawNfc);
    if (exato.length === 1) return exato[0]!;

    const exatoSemCase = nomes.filter(nome => normalizarUnicode(nome).toLocaleLowerCase('pt-BR') === rawNfc.toLocaleLowerCase('pt-BR'));
    if (exatoSemCase.length === 1) return exatoSemCase[0]!;

    const rawAcento = temAcento(rawBase);
    const porAcento = nomes.filter(nome => temAcento(nome) === rawAcento);
    if (rawAcento && porAcento.length === 1) return porAcento[0]!;

    const rawMaiuscula = iniciaComMaiuscula(rawBase);
    const baseParaCase = porAcento.length > 0 ? porAcento : nomes;
    const porCaseInicial = baseParaCase.filter(nome => iniciaComMaiuscula(nome) === rawMaiuscula);
    if (porCaseInicial.length === 1) return porCaseInicial[0]!;

    return null;
}

function normalizarParaComparacaoSolta(value: string): string {
    return normalizarParaComparacao(value)
        .replace(/[^a-z0-9]+/g, '');
}

// ============================================================================
// FILESYSTEM
// ============================================================================

/**
 * Lista conteúdo de um diretório
 */
export async function listarDiretorio(dirPath: string): Promise<OsToolResult> {
    try {
        const resolucao = await resolverEntradaOs(dirPath, { mustExist: true });
        if (!resolucao.sucesso) return resolucao;
        const resolved = resolucao.dados.caminho;
        const entries = await fs.readdir(resolved, { withFileTypes: true });

        const itens = await Promise.all(
            entries.map(async (e) => {
                const fullPath = path.join(resolved, e.name);
                let tamanho: number | undefined;
                let modificado: string | undefined;

                try {
                    const stat = await fs.stat(fullPath);
                    tamanho = e.isFile() ? stat.size : undefined;
                    modificado = stat.mtime.toISOString();
                } catch { /* ignora erros de stat em arquivos protegidos */ }

                return {
                    nome: e.name,
                    tipo: e.isDirectory() ? 'pasta' : 'arquivo',
                    tamanho,
                    modificado,
                    caminho: fullPath
                };
            })
        );

        return { sucesso: true, dados: { caminho: resolved, fuzzy: Boolean(resolucao.dados.fuzzy), itens } };
    } catch (error: any) {
        return erroFs(error, `Erro ao listar "${dirPath}"`);
    }
}

/**
 * Lê conteúdo de um arquivo — suporta texto, PDF e DOCX automaticamente
 */
export async function lerArquivo(filePath: string): Promise<OsToolResult> {
    try {
        const resolucao = await resolverEntradaOs(filePath, { mustExist: true });
        if (!resolucao.sucesso) return resolucao;
        const resolved = resolucao.dados.caminho;
        const stat = await fs.stat(resolved);
        const ext = path.extname(resolved).toLowerCase();

        if (ext === '.pdf') return lerPDF(resolved, stat.size);
        if (ext === '.docx' || ext === '.doc') return lerDocx(resolved, stat.size);
        if (ext === '.xlsx' || ext === '.xls') return lerXlsx(resolved, stat.size);

        if (BINARY_EXTENSIONS.has(ext)) {
            return erroOs('arquivo_binario', `Arquivo binario (${ext}) nao pode ser lido como texto.`, 'Use os_sistema abrir para visualizar o arquivo no aplicativo padrao.');
        }

        if (stat.size > MAX_READ_BYTES) {
            return erroOs('arquivo_muito_grande', `Arquivo muito grande (${(stat.size / 1024).toFixed(0)} KB). Limite: 2 MB.`, 'Use busca por conteudo, resumo por trechos ou reduza o arquivo antes de ler inteiro.');
        }

        const conteudo = await fs.readFile(resolved, 'utf-8');
        return {
            sucesso: true,
            dados: { caminho: resolved, fuzzy: Boolean(resolucao.dados.fuzzy), conteudo, tamanho: stat.size, linhas: conteudo.split('\n').length, formato: 'texto' }
        };
    } catch (error: any) {
        return erroFs(error, `Erro ao ler "${filePath}"`);
    }
}

/**
 * Extrai texto de um PDF via pdf-parse
 */
async function lerPDF(filePath: string, tamanho: number): Promise<OsToolResult> {
    try {
        // pdf-parse usa export = (CJS), require é mais direto que dynamic import
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string; numpages: number }>;
        const buffer = await fs.readFile(filePath);
        const data = await pdfParse(buffer);
        return {
            sucesso: true,
            dados: {
                caminho: filePath,
                conteudo: data.text,
                tamanho,
                linhas: data.text.split('\n').length,
                paginas: data.numpages,
                formato: 'pdf'
            }
        };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao ler PDF "${filePath}": ${error.message}` };
    }
}

/**
 * Extrai texto de um DOCX/DOC via mammoth
 */
async function lerDocx(filePath: string, tamanho: number): Promise<OsToolResult> {
    try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return {
            sucesso: true,
            dados: {
                caminho: filePath,
                conteudo: result.value,
                tamanho,
                linhas: result.value.split('\n').length,
                formato: 'docx'
            }
        };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao ler DOCX "${filePath}": ${error.message}` };
    }
}

/**
 * Lê planilha XLSX/XLS via SheetJS — retorna todas as abas em CSV
 */
async function lerXlsx(filePath: string, tamanho: number): Promise<OsToolResult> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const XLSX = require('xlsx') as typeof import('xlsx');
        const workbook = XLSX.readFile(filePath);
        const abas: Record<string, string> = {};
        let conteudoTotal = '';

        for (const nomAba of workbook.SheetNames) {
            const sheet = workbook.Sheets[nomAba]!;
            const csv = XLSX.utils.sheet_to_csv(sheet);
            abas[nomAba] = csv;
            conteudoTotal += `=== Aba: ${nomAba} ===\n${csv}\n\n`;
        }

        return {
            sucesso: true,
            dados: {
                caminho: filePath,
                conteudo: conteudoTotal.trim(),
                tamanho,
                linhas: conteudoTotal.split('\n').length,
                abas: workbook.SheetNames,
                formato: 'xlsx'
            }
        };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao ler planilha "${filePath}": ${error.message}` };
    }
}

/**
 * Busca texto dentro do conteúdo de arquivos (grep)
 * Suporta .txt, .md, .csv, .json, .xml, .pdf, .docx e outros textos
 */
export async function buscarConteudo(
    dirPath: string,
    texto: string,
    extensoes: string[] = [],
    recursivo = true
): Promise<OsToolResult> {
    try {
        const resolucao = await resolverEntradaOs(dirPath, { mustExist: true });
        if (!resolucao.sucesso) return resolucao;
        const resolved = resolucao.dados.caminho;
        const textoBusca = texto.toLowerCase();
        const extsFilter = extensoes.length > 0
            ? new Set(extensoes.map(e => e.startsWith('.') ? e : '.' + e))
            : TEXT_EXTENSIONS;

        const resultados: Array<{ arquivo: string; ocorrencias: number; trechos: string[] }> = [];

        async function varrer(dir: string, profundidade: number): Promise<void> {
            if (profundidade > 8 || resultados.length >= 50) return;
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const e of entries) {
                if (resultados.length >= 50) return;
                const fullPath = path.join(dir, e.name);
                const ext = path.extname(e.name).toLowerCase();

                if (e.isDirectory()) {
                    if (recursivo) {
                        try { await varrer(fullPath, profundidade + 1); } catch { /* sem permissão */ }
                    }
                    continue;
                }

                if (!extsFilter.has(ext)) continue;

                let conteudo = '';
                try {
                    const stat = await fs.stat(fullPath);
                    if (ext === '.pdf') {
                        const r = await lerPDF(fullPath, stat.size);
                        if (r.sucesso) conteudo = r.dados.conteudo;
                    } else if (ext === '.docx' || ext === '.doc') {
                        const r = await lerDocx(fullPath, stat.size);
                        if (r.sucesso) conteudo = r.dados.conteudo;
                    } else if (ext === '.xlsx' || ext === '.xls') {
                        const r = await lerXlsx(fullPath, stat.size);
                        if (r.sucesso) conteudo = r.dados.conteudo;
                    } else {
                        if (stat.size > MAX_READ_BYTES) continue;
                        conteudo = await fs.readFile(fullPath, 'utf-8');
                    }
                } catch { continue; }

                if (!conteudo.toLowerCase().includes(textoBusca)) continue;

                const linhas = conteudo.split('\n');
                const trechos: string[] = [];
                let ocorrencias = 0;

                for (let i = 0; i < linhas.length; i++) {
                    if (!linhas[i]!.toLowerCase().includes(textoBusca)) continue;
                    ocorrencias++;
                    if (trechos.length < 3) {
                        const inicio = Math.max(0, i - 1);
                        const fim = Math.min(linhas.length - 1, i + 1);
                        trechos.push(
                            linhas.slice(inicio, fim + 1)
                                .map((l, idx) => `  L${inicio + idx + 1}: ${l.trim()}`)
                                .join('\n')
                        );
                    }
                }

                resultados.push({ arquivo: fullPath, ocorrencias, trechos });
            }
        }

        await varrer(resolved, 0);
        return { sucesso: true, dados: { texto, baseDir: resolved, fuzzy: Boolean(resolucao.dados.fuzzy), resultados, total: resultados.length } };
    } catch (error: any) {
        return erroFs(error, `Erro ao buscar conteudo em "${dirPath}"`);
    }
}

/**
 * Cria ou sobrescreve um arquivo com conteúdo texto
 */
export async function escreverArquivo(filePath: string, conteudo: string): Promise<OsToolResult> {
    const resolved = resolverCaminhoOs(filePath);
    try {
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, conteudo, 'utf-8');
        return auditarMutacao('escrever_arquivo', { sucesso: true, dados: { caminho: resolved, bytesEscritos: Buffer.byteLength(conteudo) } }, { destino: resolved });
    } catch (error: any) {
        return auditarMutacao('escrever_arquivo', erroFs(error, `Erro ao escrever "${filePath}"`), { destino: resolved });
    }
}

/**
 * Se destino e uma pasta existente (ou termina com separador), junta o basename
 * da origem pra formar o caminho final — convencao Unix mv/cp.
 * Retorna { destino: caminho final, coagido: true se foi ajustado }.
 */
async function coagirDestinoComoPasta(resolvedOrigem: string, resolvedDestino: string): Promise<{ destino: string; coagido: boolean }> {
    const terminaComSep = /[\\/]$/.test(resolvedDestino);
    if (terminaComSep) {
        return { destino: path.join(resolvedDestino, path.basename(resolvedOrigem)), coagido: true };
    }
    try {
        const stat = await fs.stat(resolvedDestino);
        if (stat.isDirectory()) {
            return { destino: path.join(resolvedDestino, path.basename(resolvedOrigem)), coagido: true };
        }
    } catch { /* destino nao existe, segue */ }
    return { destino: resolvedDestino, coagido: false };
}

/**
 * Guardrail: se origem tem extensao mas destino final nao, e provavel que
 * o LLM/usuario tenha confundido destino-pasta com destino-arquivo. Executar
 * assim renomearia o arquivo pra um nome sem extensao (foi assim que 3 PDFs
 * viraram "pastas" sem extensao em 2026-04-20). Bloqueia antes do rename/copy
 * e sugere o formato correto.
 */
function detectarExtensaoAmbigua(resolvedOrigem: string, resolvedDestino: string, coagido: boolean): OsToolResult | null {
    if (coagido) return null; // ja foi coagido como pasta, destino final tem a extensao da origem
    const extOrigem = path.extname(resolvedOrigem);
    const extDestino = path.extname(resolvedDestino);
    if (!extOrigem || extDestino) return null;
    return erroOs(
        'operacao_invalida',
        `Destino "${resolvedDestino}" nao tem extensao mas origem tem ("${extOrigem}"). Executar assim criaria um arquivo sem extensao no lugar de mover para dentro de uma pasta.`,
        `Se o destino e uma pasta, use "${resolvedDestino}${path.sep}" (com separador no final) ou "${path.join(resolvedDestino, path.basename(resolvedOrigem))}" explicitamente. Se realmente quer renomear tirando a extensao, inclua um "." no final do destino.`
    );
}

/**
 * Move ou renomeia um arquivo/pasta
 */
export async function moverItem(origem: string, destino: string): Promise<OsToolResult> {
    const resolucaoOrigem = await resolverCaminhoExistenteOs(origem);
    const resolvedOrigem = resolucaoOrigem.dados?.caminho || resolverCaminhoOs(origem);
    if (!resolucaoOrigem.sucesso) {
        return auditarMutacao('mover', resolucaoOrigem, { origem: resolvedOrigem, destino: resolverCaminhoOs(destino) });
    }
    const resolvedDestinoBruto = resolverCaminhoOs(destino);
    const { destino: resolvedDestino, coagido } = await coagirDestinoComoPasta(resolvedOrigem, resolvedDestinoBruto);
    const ambiguo = detectarExtensaoAmbigua(resolvedOrigem, resolvedDestino, coagido);
    if (ambiguo) return auditarMutacao('mover', ambiguo, { origem: resolvedOrigem, destino: resolvedDestino });
    try {
        await fs.mkdir(path.dirname(resolvedDestino), { recursive: true });
        try {
            await fs.access(resolvedDestino);
            return auditarMutacao('mover', erroOs(
                'destino_existe',
                `Destino "${resolvedDestino}" ja existe. Movimento/renomeacao bloqueado para evitar sobrescrever item existente.`,
                'Escolha outro nome, mova para uma pasta vazia ou remova o destino antes.'
            ), { origem: resolvedOrigem, destino: resolvedDestino });
        } catch {
            // Destino nao existe: ok mover.
        }
        await fs.rename(resolvedOrigem, resolvedDestino);
        return auditarMutacao('mover', { sucesso: true, dados: { origem: resolvedOrigem, destino: resolvedDestino, destinoCoagido: coagido, fuzzy: Boolean(resolucaoOrigem.dados?.fuzzy) } }, { origem: resolvedOrigem, destino: resolvedDestino });
    } catch (error: any) {
        return auditarMutacao('mover', erroFs(error, `Erro ao mover "${origem}" -> "${destino}"`), { origem: resolvedOrigem, destino: resolvedDestino });
    }
}

/**
 * Copia um arquivo
 */
export async function copiarArquivo(origem: string, destino: string): Promise<OsToolResult> {
    const resolucaoOrigem = await resolverCaminhoExistenteOs(origem);
    const resolvedOrigem = resolucaoOrigem.dados?.caminho || resolverCaminhoOs(origem);
    if (!resolucaoOrigem.sucesso) {
        return auditarMutacao('copiar', resolucaoOrigem, { origem: resolvedOrigem, destino: resolverCaminhoOs(destino) });
    }
    const resolvedDestinoBruto = resolverCaminhoOs(destino);
    const { destino: resolvedDestino, coagido } = await coagirDestinoComoPasta(resolvedOrigem, resolvedDestinoBruto);
    const ambiguo = detectarExtensaoAmbigua(resolvedOrigem, resolvedDestino, coagido);
    if (ambiguo) return auditarMutacao('copiar', ambiguo, { origem: resolvedOrigem, destino: resolvedDestino });
    try {
        await fs.mkdir(path.dirname(resolvedDestino), { recursive: true });
        try {
            await fs.access(resolvedDestino);
            return auditarMutacao('copiar', erroOs(
                'destino_existe',
                `Destino "${resolvedDestino}" ja existe. Copia bloqueada para evitar sobrescrever arquivo existente.`,
                'Escolha outro nome, copie para uma pasta vazia ou remova o destino antes.'
            ), { origem: resolvedOrigem, destino: resolvedDestino });
        } catch {
            // Destino nao existe: ok copiar.
        }
        await fs.copyFile(resolvedOrigem, resolvedDestino);
        return auditarMutacao('copiar', { sucesso: true, dados: { origem: resolvedOrigem, destino: resolvedDestino, destinoCoagido: coagido, fuzzy: Boolean(resolucaoOrigem.dados?.fuzzy) } }, { origem: resolvedOrigem, destino: resolvedDestino });
    } catch (error: any) {
        return auditarMutacao('copiar', erroFs(error, `Erro ao copiar "${origem}"`), { origem: resolvedOrigem, destino: resolvedDestino });
    }
}

/**
 * Cria pasta(s) recursivamente
 */
export async function criarPasta(dirPath: string): Promise<OsToolResult> {
    const resolved = resolverCaminhoOs(dirPath);
    try {
        await fs.mkdir(resolved, { recursive: true });
        return auditarMutacao('criar_pasta', { sucesso: true, dados: { caminho: resolved } }, { destino: resolved });
    } catch (error: any) {
        return auditarMutacao('criar_pasta', erroFs(error, `Erro ao criar pasta "${dirPath}"`), { destino: resolved });
    }
}

/**
 * Move arquivo/pasta para a Lixeira do sistema (reversível via Restaurar).
 * Funciona com pastas não-vazias (diferente de deletarPermanente).
 */
async function enviarParaLixeiraSistema(resolved: string): Promise<{ metodo: string }> {
    const erros: string[] = [];

    try {
        const trashItem = (shell as any)?.trashItem;
        if (typeof trashItem !== 'function') {
            throw new Error('Electron shell.trashItem indisponivel neste contexto.');
        }
        await trashItem.call(shell, resolved);
        return { metodo: 'electron.shell.trashItem' };
    } catch (error: any) {
        erros.push(`electron: ${error?.message || String(error)}`);
    }

    if (process.platform === 'win32') {
        try {
            const script = [
                '& { param([string]$item)',
                "$ErrorActionPreference = 'Stop'",
                'Add-Type -AssemblyName Microsoft.VisualBasic',
                'if ([System.IO.Directory]::Exists($item)) {',
                '  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($item, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)',
                '} elseif ([System.IO.File]::Exists($item)) {',
                '  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($item, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)',
                '} else {',
                '  throw "Item not found: $item"',
                '}',
                '}'
            ].join('; ');

            await execFileAsync('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                script,
                resolved
            ], { timeout: 20_000, windowsHide: true });

            return { metodo: 'powershell.recyclebin' };
        } catch (error: any) {
            const stderr = error?.stderr ? ` stderr: ${String(error.stderr).trim()}` : '';
            erros.push(`powershell: ${error?.message || String(error)}${stderr}`);
        }
    }

    throw new Error(erros.join(' | '));
}

export async function moverParaLixeira(filePath: string): Promise<OsToolResult> {
    const resolucao = await resolverCaminhoExistenteOs(filePath);
    const resolved = resolucao.dados?.caminho || resolverCaminhoOs(filePath);
    if (!resolucao.sucesso) {
        return auditarMutacao('lixeira', resolucao, { origem: resolved });
    }
    try {
        await fs.access(resolved); // valida existência antes
        const { metodo } = await enviarParaLixeiraSistema(resolved);
        return auditarMutacao('lixeira', { sucesso: true, dados: { lixeira: resolved, reversivel: true, fuzzy: Boolean(resolucao.dados?.fuzzy), metodo } }, { origem: resolved });
    } catch (error: any) {
        return auditarMutacao('lixeira', erroFs(error, `Erro ao mover "${filePath}" para Lixeira`), { origem: resolved });
    }
}

/**
 * Deleta arquivo PERMANENTEMENTE (irreversível). Prefira moverParaLixeira.
 * Pastas precisam estar vazias.
 */
export async function deletarPermanente(filePath: string): Promise<OsToolResult> {
    const resolucao = await resolverCaminhoExistenteOs(filePath);
    const resolved = resolucao.dados?.caminho || resolverCaminhoOs(filePath);
    if (!resolucao.sucesso) {
        return auditarMutacao('deletar_permanente', resolucao, { origem: resolved });
    }
    try {
        const stat = await fs.stat(resolved);

        if (stat.isDirectory()) {
            const entries = await fs.readdir(resolved);
            if (entries.length > 0) {
                return auditarMutacao('deletar_permanente', erroOs(
                    'pasta_nao_vazia',
                    `Pasta "${resolved}" nao esta vazia. Exclusao permanente bloqueada.`,
                    'Use delete para Lixeira ou esvazie a pasta antes de deletar permanentemente.'
                ), { origem: resolved });
            }
            await fs.rmdir(resolved);
        } else {
            await fs.unlink(resolved);
        }

        return auditarMutacao('deletar_permanente', { sucesso: true, dados: { removido: resolved, reversivel: false } }, { origem: resolved });
    } catch (error: any) {
        return auditarMutacao('deletar_permanente', erroFs(error, `Erro ao deletar "${filePath}"`), { origem: resolved });
    }
}

/**
 * Alias legado — aponta para deletarPermanente pra não quebrar chamadores.
 * @deprecated use moverParaLixeira ou deletarPermanente explicitamente
 */
export async function deletarArquivo(filePath: string): Promise<OsToolResult> {
    return deletarPermanente(filePath);
}

/**
 * Verifica se caminho existe e retorna metadados
 */
export async function infoItem(itemPath: string): Promise<OsToolResult> {
    const resolucao = await resolverEntradaOs(itemPath, { mustExist: true });
    if (!resolucao.sucesso) {
        if (resolucao.codigo === 'caminho_ambiguo') return resolucao;
        return { sucesso: true, dados: { caminho: resolverCaminhoOs(itemPath), existe: false, erro: resolucao.erro, codigo: resolucao.codigo } };
    }

    try {
        let resolved = resolucao.dados.caminho;
        let fuzzy = Boolean(resolucao.dados.fuzzy);
        if (String(itemPath || '').includes('…')) {
            const resolucao = await resolverCaminhoExistenteOs(itemPath);
            if (!resolucao.sucesso) return resolucao;
            resolved = resolucao.dados.caminho;
            fuzzy = Boolean(resolucao.dados.fuzzy);
        }
        const stat = await fs.stat(resolved);
        return {
            sucesso: true,
            dados: {
                caminho: resolved,
                fuzzy,
                existe: true,
                tipo: stat.isDirectory() ? 'pasta' : 'arquivo',
                tamanho: stat.size,
                criado: stat.birthtime.toISOString(),
                modificado: stat.mtime.toISOString(),
                extensao: path.extname(resolved)
            }
        };
    } catch {
        const resolved = resolverCaminhoOs(itemPath);
        const recuperadoPorNome = await recuperarPorNomeNormalizado(resolved, itemPath);
        if (recuperadoPorNome?.sucesso) {
            try {
                const stat = await fs.stat(recuperadoPorNome.dados.caminho);
                return {
                    sucesso: true,
                    dados: {
                        caminho: recuperadoPorNome.dados.caminho,
                        fuzzy: true,
                        existe: true,
                        tipo: stat.isDirectory() ? 'pasta' : 'arquivo',
                        tamanho: stat.size,
                        criado: stat.birthtime.toISOString(),
                        modificado: stat.mtime.toISOString(),
                        extensao: path.extname(recuperadoPorNome.dados.caminho)
                    }
                };
            } catch { /* cai para inexistente */ }
        }
        if (recuperadoPorNome && !recuperadoPorNome.sucesso) return recuperadoPorNome;
        return { sucesso: true, dados: { caminho: resolved, existe: false } };
    }
}

/**
 * Converte glob simples (* e ?) em RegExp case-insensitive.
 */
function globParaRegex(glob: string): RegExp {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const pattern = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    return new RegExp(pattern, 'i');
}

/**
 * Pastas ignoradas por default em varreduras recursivas — contêm
 * milhões de arquivos/GBs de cache sem interesse pro usuário e fazem
 * os_tamanho/os_buscar demorarem eternidades se incluídas.
 */
const DIRS_IGNORADOS_PADRAO = new Set([
    'AppData', 'Application Data', 'Local Settings',
    'Temporary Internet Files', '$Recycle.Bin', 'System Volume Information',
    'node_modules', '.git', '.svn', '.hg', '.cache',
    '.next', '.nuxt', '.turbo', '.vercel', '.parcel-cache',
    'dist', 'build', 'out', 'coverage', '.venv', '__pycache__'
]);

function deveIgnorarDir(nome: string, ignorados: Set<string>): boolean {
    if (ignorados.has(nome)) return true;
    // junções/pastas ocultas de sistema do Windows — nomes com prefixo $ também
    if (nome.startsWith('$')) return true;
    return false;
}

/**
 * Busca arquivos por nome/padrão em um diretório.
 * Aceita glob (* ?) ou substring case-insensitive.
 * Ignora pastas de sistema/cache e symlinks. Tem deadline interno pra
 * evitar travar (retorna parcial com motivo).
 */
export async function buscarArquivos(
    dirPath: string,
    padrao: string,
    recursivo = true,
    limite = 200,
    profundidadeMax = 10,
    deadlineMs = 45_000
): Promise<OsToolResult> {
    try {
        const resolucao = await resolverEntradaOs(dirPath, { mustExist: true });
        if (!resolucao.sucesso) return resolucao;
        const resolved = resolucao.dados.caminho;
        const baseStat = await fs.stat(resolved);
        if (!baseStat.isDirectory()) {
            return erroOs('operacao_invalida', `Base de busca "${resolved}" nao e uma pasta.`, 'Informe uma pasta como caminho base para buscar arquivos.');
        }
        const temGlob = /[*?]/.test(padrao);
        const regex = temGlob ? globParaRegex(padrao) : null;
        const needle = padrao.toLowerCase();
        const resultados: Array<{ caminho: string; tipo: 'arquivo' | 'pasta'; tamanho?: number; modificado?: string }> = [];
        const inicio = Date.now();
        let parcialMotivo: string | null = null;

        async function varrer(dir: string, profundidade: number): Promise<void> {
            if (parcialMotivo) return;
            if (Date.now() - inicio > deadlineMs) { parcialMotivo = 'deadline'; return; }
            if (profundidade > profundidadeMax || resultados.length >= limite) return;
            let entries: any[];
            try {
                entries = await fs.readdir(dir, { withFileTypes: true });
            } catch { return; /* sem permissão */ }

            for (const e of entries) {
                if (parcialMotivo) return;
                if (resultados.length >= limite) return;
                const fullPath = path.join(dir, e.name);
                const match = regex ? regex.test(e.name) : e.name.toLowerCase().includes(needle);
                if (match) {
                    let tamanho: number | undefined;
                    let modificado: string | undefined;
                    try {
                        const stat = await fs.stat(fullPath);
                        tamanho = e.isFile() ? stat.size : undefined;
                        modificado = stat.mtime.toISOString();
                    } catch { /* ignora */ }
                    resultados.push({
                        caminho: fullPath,
                        tipo: e.isDirectory() ? 'pasta' : 'arquivo',
                        tamanho,
                        modificado
                    });
                }
                if (recursivo && e.isDirectory()) {
                    if (deveIgnorarDir(e.name, DIRS_IGNORADOS_PADRAO)) continue;
                    // lstat pra não seguir junctions/symlinks (Windows AppData/Local tem loops)
                    try {
                        const ls = await fs.lstat(fullPath);
                        if (ls.isSymbolicLink()) continue;
                    } catch { continue; }
                    await varrer(fullPath, profundidade + 1);
                }
            }
        }

        await varrer(resolved, 0);
        return {
            sucesso: true,
            dados: {
                padrao,
                baseDir: resolved,
                fuzzy: Boolean(resolucao.dados.fuzzy),
                resultados,
                total: resultados.length,
                truncado: resultados.length >= limite,
                parcial: Boolean(parcialMotivo),
                motivoParcial: parcialMotivo
            }
        };
    } catch (error: any) {
        return erroFs(error, `Erro ao buscar em "${dirPath}"`);
    }
}

type DuplicadoNomeItem = {
    caminho: string;
    nome: string;
    tamanho?: number;
    modificado?: string;
    marcadorCopia: boolean;
};

function normalizarNomeDuplicado(nomeArquivo: string): { chave: string; marcadorCopia: boolean } {
    const ext = path.extname(nomeArquivo).toLowerCase();
    const baseOriginal = path.basename(nomeArquivo, ext);
    let base = baseOriginal
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    let marcadorCopia = false;
    let anterior = '';
    while (base !== anterior) {
        anterior = base;
        const proximo = base
            .replace(/\s*\(\d+\)\s*$/i, '')
            .replace(/\s*[-_ ]+(copy|copia)\s*(?:\(\d+\)|\d+)?\s*$/i, '')
            .replace(/\s+copy\s*(?:\(\d+\)|\d+)?\s*$/i, '')
            .trim();
        if (proximo !== base) marcadorCopia = true;
        base = proximo;
    }

    return { chave: `${base}${ext}`, marcadorCopia };
}

/**
 * Encontra duplicatas "obvias" por nome: arquivos com sufixos de copia como
 * "arquivo (1).pdf", "arquivo - copy.pdf" ou "arquivo copia.pdf".
 * Nao compara hash/conteudo; e uma busca rapida e explicavel.
 */
export async function buscarDuplicadosPorNome(
    dirPath: string,
    recursivo = true,
    limiteGrupos = 100,
    profundidadeMax = 10,
    deadlineMs = 45_000
): Promise<OsToolResult> {
    try {
        const resolucao = await resolverEntradaOs(dirPath, { mustExist: true });
        if (!resolucao.sucesso) return resolucao;
        const resolved = resolucao.dados.caminho;
        const baseStat = await fs.stat(resolved);
        if (!baseStat.isDirectory()) {
            return erroOs('operacao_invalida', `Base de busca "${resolved}" nao e uma pasta.`, 'Informe uma pasta como caminho base para buscar duplicatas.');
        }
        const grupos = new Map<string, DuplicadoNomeItem[]>();
        const inicio = Date.now();
        let parcialMotivo: string | null = null;
        let arquivosVisitados = 0;

        async function varrer(dir: string, profundidade: number): Promise<void> {
            if (parcialMotivo) return;
            if (Date.now() - inicio > deadlineMs) { parcialMotivo = 'deadline'; return; }
            if (profundidade > profundidadeMax) return;

            let entries: any[];
            try {
                entries = await fs.readdir(dir, { withFileTypes: true });
            } catch { return; }

            for (const e of entries) {
                if (parcialMotivo) return;
                const fullPath = path.join(dir, e.name);

                if (e.isDirectory()) {
                    if (!recursivo) continue;
                    if (deveIgnorarDir(e.name, DIRS_IGNORADOS_PADRAO)) continue;
                    try {
                        const ls = await fs.lstat(fullPath);
                        if (ls.isSymbolicLink()) continue;
                    } catch { continue; }
                    await varrer(fullPath, profundidade + 1);
                    continue;
                }

                if (!e.isFile()) continue;
                arquivosVisitados++;

                const { chave, marcadorCopia } = normalizarNomeDuplicado(e.name);
                if (!marcadorCopia) {
                    // Guarda originais tambem, pois eles formam o par com "arquivo (1)".
                    // A filtragem final remove grupos sem nenhum marcador de copia.
                }

                let tamanho: number | undefined;
                let modificado: string | undefined;
                try {
                    const stat = await fs.stat(fullPath);
                    tamanho = stat.size;
                    modificado = stat.mtime.toISOString();
                } catch { /* ignora metadados indisponiveis */ }

                const lista = grupos.get(chave) || [];
                lista.push({ caminho: fullPath, nome: e.name, tamanho, modificado, marcadorCopia });
                grupos.set(chave, lista);
            }
        }

        await varrer(resolved, 0);

        const duplicatas = Array.from(grupos.entries())
            .map(([chave, itens]) => ({ chave, itens }))
            .filter(g => g.itens.length > 1 && g.itens.some(i => i.marcadorCopia))
            .sort((a, b) => b.itens.length - a.itens.length || a.chave.localeCompare(b.chave, 'pt-BR'))
            .slice(0, limiteGrupos);

        return {
            sucesso: true,
            dados: {
                caminho: resolved,
                fuzzy: Boolean(resolucao.dados.fuzzy),
                arquivosVisitados,
                totalGrupos: duplicatas.length,
                grupos: duplicatas,
                parcial: Boolean(parcialMotivo),
                motivoParcial: parcialMotivo
            }
        };
    } catch (error: any) {
        return erroFs(error, `Erro ao buscar duplicatas em "${dirPath}"`);
    }
}

/**
 * Calcula tamanho recursivo de uma pasta.
 * Retorna total, contagem e top N subpastas por tamanho.
 * Ignora pastas de sistema/cache (AppData, node_modules, etc) e symlinks.
 * Tem deadline interno — se estourar, retorna resultado parcial.
 */
export async function tamanhoRecursivo(
    dirPath: string,
    topN = 10,
    profundidadeMax = 20,
    deadlineMs = 45_000
): Promise<OsToolResult> {
    try {
        const resolucao = await resolverEntradaOs(dirPath, { mustExist: true });
        if (!resolucao.sucesso) return resolucao;
        const resolved = resolucao.dados.caminho;
        const baseStat = await fs.stat(resolved);
        if (!baseStat.isDirectory()) {
            return erroOs('operacao_invalida', `Caminho "${resolved}" nao e uma pasta.`, 'Informe uma pasta para medir tamanho recursivo.');
        }
        let totalBytes = 0;
        let totalArquivos = 0;
        let totalPastas = 0;
        const porSubpastaNivel1: Record<string, number> = {};
        const inicio = Date.now();
        let parcialMotivo: string | null = null;
        const ignoradas: string[] = [];

        async function varrer(dir: string, profundidade: number, chaveNivel1: string | null): Promise<number> {
            if (parcialMotivo) return 0;
            if (Date.now() - inicio > deadlineMs) { parcialMotivo = 'deadline'; return 0; }
            if (profundidade > profundidadeMax) return 0;
            let dirBytes = 0;
            let entries: any[];
            try {
                entries = await fs.readdir(dir, { withFileTypes: true });
            } catch { return 0; /* sem permissão */ }

            for (const e of entries) {
                if (parcialMotivo) return dirBytes;
                const fullPath = path.join(dir, e.name);
                try {
                    if (e.isDirectory()) {
                        // Pula pastas-lixo e symlinks/junctions
                        if (deveIgnorarDir(e.name, DIRS_IGNORADOS_PADRAO)) {
                            if (chaveNivel1 === null) ignoradas.push(e.name);
                            continue;
                        }
                        try {
                            const ls = await fs.lstat(fullPath);
                            if (ls.isSymbolicLink()) continue;
                        } catch { continue; }
                        totalPastas++;
                        const chave = chaveNivel1 ?? e.name;
                        const sub = await varrer(fullPath, profundidade + 1, chave);
                        dirBytes += sub;
                        if (chaveNivel1 === null) {
                            porSubpastaNivel1[e.name] = sub;
                        }
                    } else if (e.isFile()) {
                        // lstat evita seguir symlinks de arquivo
                        const stat = await fs.lstat(fullPath);
                        if (stat.isSymbolicLink()) continue;
                        totalBytes += stat.size;
                        dirBytes += stat.size;
                        totalArquivos++;
                    }
                } catch { /* ignora */ }
            }
            return dirBytes;
        }

        await varrer(resolved, 0, null);

        const topSubpastas = Object.entries(porSubpastaNivel1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN)
            .map(([nome, bytes]) => ({ nome, bytes }));

        return {
            sucesso: true,
            dados: {
                caminho: resolved,
                fuzzy: Boolean(resolucao.dados.fuzzy),
                totalBytes,
                totalArquivos,
                totalPastas,
                topSubpastas,
                parcial: Boolean(parcialMotivo),
                motivoParcial: parcialMotivo,
                pastasIgnoradas: ignoradas
            }
        };
    } catch (error: any) {
        return erroFs(error, `Erro ao medir "${dirPath}"`);
    }
}

// ============================================================================
// OS INFO
// ============================================================================

/**
 * Retorna informações do sistema operacional
 */
export function infoSistema(): OsToolResult {
    return {
        sucesso: true,
        dados: {
            plataforma: os.platform(),
            arquitetura: os.arch(),
            versao: os.release(),
            hostname: os.hostname(),
            usuario: os.userInfo().username,
            homeDir: os.homedir(),
            tempDir: os.tmpdir(),
            cpus: os.cpus().length,
            memoriaTotal: os.totalmem(),
            memoriaLivre: os.freemem(),
            uptime: os.uptime(),
            variaveis: {
                USERPROFILE: process.env['USERPROFILE'],
                APPDATA: process.env['APPDATA'],
                LOCALAPPDATA: process.env['LOCALAPPDATA'],
                TEMP: process.env['TEMP'],
                OneDrive: process.env['OneDrive']
            }
        }
    };
}

// ============================================================================
// SHELL (com allowlist de segurança)
// ============================================================================

/**
 * Executa comando shell com proteção contra comandos perigosos.
 * Sempre requer confirmação do usuário antes de executar.
 */
export async function executarComando(
    comando: string,
    cwd?: string
): Promise<OsToolResult> {
    const cmdLower = comando.toLowerCase().trim();

    // Verifica blocklist
    for (const blocked of BLOCKED_COMMANDS) {
        if (cmdLower.includes(blocked)) {
            return erroOs(
                'comando_bloqueado',
                `Comando bloqueado por seguranca: contem "${blocked}".`,
                'Use as ferramentas especificas de filesystem ou ajuste o comando para uma operacao segura.'
            );
        }
    }

    // Limita tempo de execução a 30s
    const timeoutMs = 30_000;

    try {
        const opts: any = { timeout: timeoutMs };
        if (cwd) opts.cwd = resolverCaminhoOs(cwd);

        const { stdout, stderr } = await execAsync(comando, opts);
        return {
            sucesso: true,
            dados: {
                comando,
                stdout: stdout.toString().trim(),
                stderr: stderr.toString().trim()
            }
        };
    } catch (error: any) {
        return {
            ...erroOs('erro_io', `Erro ao executar "${comando}": ${error.message}`, 'Verifique o comando, o diretorio de trabalho e as permissoes.'),
            dados: {
                stdout: error.stdout?.trim(),
                stderr: error.stderr?.trim(),
                codigo: error.code
            }
        };
    }
}

/**
 * Abre arquivo/URL/pasta com o aplicativo padrão do sistema.
 * Usa child_process — sem dependência do Electron.
 */
export async function abrirComSistema(alvo: string): Promise<OsToolResult> {
    try {
        const alvoResolvido = /^https?:\/\//i.test(alvo) ? alvo : resolverCaminhoOs(alvo);
        if (/^https?:\/\//i.test(alvoResolvido)) {
            await shell.openExternal(alvoResolvido);
        } else {
            const erro = await shell.openPath(alvoResolvido);
            if (erro) {
                return erroOs('erro_io', `Erro ao abrir "${alvoResolvido}": ${erro}`, 'Verifique se o arquivo existe e se ha aplicativo padrao associado.');
            }
        }
        return { sucesso: true, dados: { alvo: alvoResolvido } };
    } catch (error: any) {
        return erroFs(error, `Erro ao abrir "${alvo}"`);
    }
}

// ============================================================================
// CLIPBOARD
// ============================================================================

/**
 * Lê texto da área de transferência — sem dependência do Electron.
 */
export function lerClipboard(): OsToolResult {
    try {
        const { execSync } = require('child_process');
        let texto: string;
        if (process.platform === 'win32') {
            texto = execSync('powershell -command "Get-Clipboard"', { encoding: 'utf8' }).replace(/\r\n$/, '');
        } else if (process.platform === 'darwin') {
            texto = execSync('pbpaste', { encoding: 'utf8' });
        } else {
            texto = execSync('xclip -selection clipboard -o', { encoding: 'utf8' });
        }
        return {
            sucesso: true,
            dados: { texto, vazio: texto.length === 0 }
        };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao ler clipboard: ${error.message}` };
    }
}

/**
 * Escreve texto na área de transferência — sem dependência do Electron.
 */
export function escreverClipboard(texto: string): OsToolResult {
    try {
        const { execSync } = require('child_process');
        if (process.platform === 'win32') {
            execSync('clip', { input: texto, encoding: 'utf8' });
        } else if (process.platform === 'darwin') {
            execSync('pbcopy', { input: texto, encoding: 'utf8' });
        } else {
            execSync('xclip -selection clipboard', { input: texto, encoding: 'utf8' });
        }
        return {
            sucesso: true,
            dados: { bytesEscritos: Buffer.byteLength(texto, 'utf-8') }
        };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao escrever clipboard: ${error.message}` };
    }
}

// ============================================================================
// PROCESSOS DO SISTEMA
// ============================================================================

/**
 * Lista processos em execução via tasklist (Windows)
 */
export async function listarProcessos(filtro?: string): Promise<OsToolResult> {
    try {
        // Sanitiza: nomes de processo só contêm letras, dígitos, ponto, hífen e espaço
        const safeFiltro = filtro ? filtro.replace(/[^a-zA-Z0-9.\- ]/g, '') : undefined;
        const cmd = safeFiltro
            ? `tasklist /fo csv /nh /fi "IMAGENAME eq ${safeFiltro}"`
            : 'tasklist /fo csv /nh';
        const { stdout } = await execAsync(cmd, { timeout: 10_000 });

        const linhas = stdout.trim().split('\n').filter(Boolean);
        const processos = linhas.map(linha => {
            // CSV: "nome","pid","sessão","num","mem"
            const partes = linha.split('","').map(p => p.replace(/"/g, '').trim());
            return {
                nome: partes[0] || '',
                pid: Number(partes[1]) || 0,
                sessao: partes[2] || '',
                memoria: partes[4] || ''
            };
        });

        return {
            sucesso: true,
            dados: { processos, total: processos.length, filtro: filtro || null }
        };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao listar processos: ${error.message}` };
    }
}

/**
 * Encerra um processo pelo PID ou nome (sem /f — terminação graciosa)
 * Requer confirmação explícita do usuário antes de chamar
 */
export async function encerrarProcesso(alvo: string | number): Promise<OsToolResult> {
    try {
        const cmd = typeof alvo === 'number'
            ? `taskkill /pid ${alvo}`
            : `taskkill /im "${alvo}"`;
        const { stdout, stderr } = await execAsync(cmd, { timeout: 10_000 });
        return {
            sucesso: true,
            dados: { alvo, stdout: stdout.trim(), stderr: stderr.trim() }
        };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao encerrar processo "${alvo}": ${error.message}` };
    }
}

// ============================================================================
// WEB FETCH
// ============================================================================

/**
 * Retorna true se o hostname da URL é um endereço privado/loopback (SSRF guard)
 */
function isPrivateHost(urlString: string): boolean {
    try {
        const { hostname } = new URL(urlString);
        if (hostname === 'localhost' || hostname === '::1') return true;
        // IPv4 loopback e privados
        const parts = hostname.split('.').map(Number);
        if (parts.length === 4 && parts.every(n => !isNaN(n))) {
            const [a, b] = parts as [number, number, number, number];
            if (a === 127) return true;                    // 127.x.x.x loopback
            if (a === 10) return true;                     // 10.x.x.x
            if (a === 172 && b >= 16 && b <= 31) return true; // 172.16–31.x.x
            if (a === 192 && b === 168) return true;       // 192.168.x.x
            if (a === 169 && b === 254) return true;       // link-local
        }
        return false;
    } catch {
        return true; // URL inválida → bloqueia
    }
}

/**
 * Busca conteúdo de uma URL e retorna como texto
 * Limite de 500 KB para evitar respostas enormes
 */
export async function fetchUrl(url: string, timeoutMs = 15_000): Promise<OsToolResult> {
    if (isPrivateHost(url)) {
        return { sucesso: false, erro: 'URL bloqueada: endereços internos e privados não são permitidos.' };
    }

    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);

        const resp = await fetch(url, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'LEX-Agent/1.0' }
        });
        clearTimeout(timer);

        if (!resp.ok) {
            return { sucesso: false, erro: `HTTP ${resp.status}: ${resp.statusText}` };
        }

        const contentType = resp.headers.get('content-type') || '';
        const isHtml = contentType.includes('text/html');
        let texto = await resp.text();

        // Remove tags HTML para leitura pelo LLM
        if (isHtml) {
            texto = texto
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
        }

        const MAX_FETCH = 500 * 1024;
        if (texto.length > MAX_FETCH) {
            texto = texto.substring(0, MAX_FETCH) + '\n\n[... conteúdo truncado]';
        }

        return {
            sucesso: true,
            dados: {
                url,
                status: resp.status,
                contentType,
                tamanho: texto.length,
                conteudo: texto
            }
        };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao buscar "${url}": ${error.message}` };
    }
}

/**
 * Pastas conhecidas do usuário Windows
 */
export function pastasConhecidas(): OsToolResult {
    const home = os.homedir();
    return {
        sucesso: true,
        dados: {
            home,
            downloads: path.join(home, 'Downloads'),
            documentos: path.join(home, 'Documents'),
            desktop: path.join(home, 'Desktop'),
            imagens: path.join(home, 'Pictures'),
            videos: path.join(home, 'Videos'),
            musica: path.join(home, 'Music'),
            appData: process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming'),
            temp: os.tmpdir(),
            oneDrive: process.env['OneDrive'] || path.join(home, 'OneDrive')
        }
    };
}
