/**
 * OS Tools
 *
 * Operações de sistema de arquivos e OS expostas ao agent.
 * Usa apenas APIs nativas do Node.js — sem dependências externas.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Limite de tamanho de arquivo para leitura (2 MB)
const MAX_READ_BYTES = 2 * 1024 * 1024;

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
 * Lê conteúdo de um arquivo texto
 */
export async function lerArquivo(filePath: string): Promise<OsToolResult> {
    try {
        const resolved = path.resolve(filePath);
        const stat = await fs.stat(resolved);

        if (stat.size > MAX_READ_BYTES) {
            return {
                sucesso: false,
                erro: `Arquivo muito grande (${(stat.size / 1024).toFixed(0)} KB). Limite: 2 MB.`
            };
        }

        const conteudo = await fs.readFile(resolved, 'utf-8');
        return {
            sucesso: true,
            dados: {
                caminho: resolved,
                conteudo,
                tamanho: stat.size,
                linhas: conteudo.split('\n').length
            }
        };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao ler "${filePath}": ${error.message}` };
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
                stdout: stdout.trim(),
                stderr: stderr.trim()
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
 * Abre arquivo/URL/pasta com o aplicativo padrão do sistema
 */
export async function abrirComSistema(alvo: string): Promise<OsToolResult> {
    try {
        // No Windows usa 'start', no Mac 'open', no Linux 'xdg-open'
        const cmd = process.platform === 'win32'
            ? `start "" "${alvo}"`
            : process.platform === 'darwin'
                ? `open "${alvo}"`
                : `xdg-open "${alvo}"`;

        await execAsync(cmd);
        return { sucesso: true, dados: { alvo } };
    } catch (error: any) {
        return { sucesso: false, erro: `Erro ao abrir "${alvo}": ${error.message}` };
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
