/**
 * OS Tools
 *
 * Operações de sistema de arquivos e OS expostas ao agent.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
}

// ============================================================================
// FILESYSTEM
// ============================================================================

/**
 * Lista conteúdo de um diretório
 */
export async function listarDiretorio(dirPath: string): Promise<OsToolResult> {
    try {
        const resolved = path.resolve(dirPath);
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

        return { sucesso: true, dados: { caminho: resolved, itens } };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao listar "${dirPath}": ${error.message}` };
    }
}

/**
 * Lê conteúdo de um arquivo — suporta texto, PDF e DOCX automaticamente
 */
export async function lerArquivo(filePath: string): Promise<OsToolResult> {
    try {
        const resolved = path.resolve(filePath);
        const stat = await fs.stat(resolved);
        const ext = path.extname(resolved).toLowerCase();

        if (ext === '.pdf') return lerPDF(resolved, stat.size);
        if (ext === '.docx' || ext === '.doc') return lerDocx(resolved, stat.size);
        if (ext === '.xlsx' || ext === '.xls') return lerXlsx(resolved, stat.size);

        if (BINARY_EXTENSIONS.has(ext)) {
            return { sucesso: false, erro: `Arquivo binário (${ext}) não pode ser lido como texto.` };
        }

        if (stat.size > MAX_READ_BYTES) {
            return { sucesso: false, erro: `Arquivo muito grande (${(stat.size / 1024).toFixed(0)} KB). Limite: 2 MB.` };
        }

        const conteudo = await fs.readFile(resolved, 'utf-8');
        return {
            sucesso: true,
            dados: { caminho: resolved, conteudo, tamanho: stat.size, linhas: conteudo.split('\n').length, formato: 'texto' }
        };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao ler "${filePath}": ${error.message}` };
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
        const resolved = path.resolve(dirPath);
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
        return { sucesso: true, dados: { texto, baseDir: resolved, resultados, total: resultados.length } };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao buscar conteúdo em "${dirPath}": ${error.message}` };
    }
}

/**
 * Cria ou sobrescreve um arquivo com conteúdo texto
 */
export async function escreverArquivo(filePath: string, conteudo: string): Promise<OsToolResult> {
    try {
        const resolved = path.resolve(filePath);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, conteudo, 'utf-8');
        return { sucesso: true, dados: { caminho: resolved, bytesEscritos: Buffer.byteLength(conteudo) } };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao escrever "${filePath}": ${error.message}` };
    }
}

/**
 * Move ou renomeia um arquivo/pasta
 */
export async function moverItem(origem: string, destino: string): Promise<OsToolResult> {
    try {
        const resolvedOrigem = path.resolve(origem);
        const resolvedDestino = path.resolve(destino);
        await fs.mkdir(path.dirname(resolvedDestino), { recursive: true });
        await fs.rename(resolvedOrigem, resolvedDestino);
        return { sucesso: true, dados: { origem: resolvedOrigem, destino: resolvedDestino } };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao mover "${origem}" → "${destino}": ${error.message}` };
    }
}

/**
 * Copia um arquivo
 */
export async function copiarArquivo(origem: string, destino: string): Promise<OsToolResult> {
    try {
        const resolvedOrigem = path.resolve(origem);
        const resolvedDestino = path.resolve(destino);
        await fs.mkdir(path.dirname(resolvedDestino), { recursive: true });
        await fs.copyFile(resolvedOrigem, resolvedDestino);
        return { sucesso: true, dados: { origem: resolvedOrigem, destino: resolvedDestino } };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao copiar "${origem}": ${error.message}` };
    }
}

/**
 * Cria pasta(s) recursivamente
 */
export async function criarPasta(dirPath: string): Promise<OsToolResult> {
    try {
        const resolved = path.resolve(dirPath);
        await fs.mkdir(resolved, { recursive: true });
        return { sucesso: true, dados: { caminho: resolved } };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao criar pasta "${dirPath}": ${error.message}` };
    }
}

/**
 * Deleta arquivo (NÃO deleta pastas com conteúdo por segurança)
 */
export async function deletarArquivo(filePath: string): Promise<OsToolResult> {
    try {
        const resolved = path.resolve(filePath);
        const stat = await fs.stat(resolved);

        if (stat.isDirectory()) {
            const entries = await fs.readdir(resolved);
            if (entries.length > 0) {
                return {
                    sucesso: false,
                    erro: `Pasta "${resolved}" não está vazia. Liste o conteúdo primeiro e confirme a exclusão item por item.`
                };
            }
            await fs.rmdir(resolved);
        } else {
            await fs.unlink(resolved);
        }

        return { sucesso: true, dados: { removido: resolved } };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao deletar "${filePath}": ${error.message}` };
    }
}

/**
 * Verifica se caminho existe e retorna metadados
 */
export async function infoItem(itemPath: string): Promise<OsToolResult> {
    try {
        const resolved = path.resolve(itemPath);
        const stat = await fs.stat(resolved);
        return {
            sucesso: true,
            dados: {
                caminho: resolved,
                existe: true,
                tipo: stat.isDirectory() ? 'pasta' : 'arquivo',
                tamanho: stat.size,
                criado: stat.birthtime.toISOString(),
                modificado: stat.mtime.toISOString(),
                extensao: path.extname(resolved)
            }
        };
    } catch {
        return { sucesso: true, dados: { caminho: path.resolve(itemPath), existe: false } };
    }
}

/**
 * Busca arquivos por nome/padrão em um diretório
 */
export async function buscarArquivos(
    dirPath: string,
    padrao: string,
    recursivo = true
): Promise<OsToolResult> {
    try {
        const resolved = path.resolve(dirPath);
        const padraoLower = padrao.toLowerCase();
        const resultados: string[] = [];

        async function varrer(dir: string, profundidade: number): Promise<void> {
            if (profundidade > 10) return; // Limita profundidade
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const e of entries) {
                const fullPath = path.join(dir, e.name);
                if (e.name.toLowerCase().includes(padraoLower)) {
                    resultados.push(fullPath);
                }
                if (recursivo && e.isDirectory()) {
                    try { await varrer(fullPath, profundidade + 1); } catch { /* ignora permissão */ }
                }
                if (resultados.length >= 200) return; // Limite de resultados
            }
        }

        await varrer(resolved, 0);
        return { sucesso: true, dados: { padrao, baseDir: resolved, resultados, total: resultados.length } };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao buscar em "${dirPath}": ${error.message}` };
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
            return {
                sucesso: false,
                erro: `Comando bloqueado por segurança: contém "${blocked}". Use as ferramentas específicas de filesystem.`
            };
        }
    }

    // Limita tempo de execução a 30s
    const timeoutMs = 30_000;

    try {
        const opts: any = { timeout: timeoutMs };
        if (cwd) opts.cwd = path.resolve(cwd);

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
            sucesso: false,
            erro: `Erro ao executar "${comando}": ${error.message}`,
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
        const { exec } = await import('child_process');
        await new Promise<void>((resolve, reject) => {
            let cmd: string;
            if (process.platform === 'win32') {
                cmd = alvo.startsWith('http://') || alvo.startsWith('https://')
                    ? `start "" "${alvo}"`
                    : `start "" "${alvo}"`;
            } else if (process.platform === 'darwin') {
                cmd = `open "${alvo}"`;
            } else {
                cmd = `xdg-open "${alvo}"`;
            }
            exec(cmd, (err) => err ? reject(err) : resolve());
        });
        return { sucesso: true, dados: { alvo } };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao abrir "${alvo}": ${error.message}` };
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
