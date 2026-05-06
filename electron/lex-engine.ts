import { app } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ExecResult {
    stdout: string;
    stderr: string;
}

export interface LexEngineStatus {
    ok: boolean;
    platform: NodeJS.Platform;
    windowsPath: string;
    windowsPathExists: boolean;
    wsl: {
        distro: string;
        projectPath: string;
        available: boolean;
        projectPathExists: boolean;
        hermesAvailable: boolean;
        hermesPath?: string;
        error?: string;
    };
    messages: string[];
}

export interface LexEngineConsoleSpawn {
    shell: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
}

const STATUS_TIMEOUT_MS = 5000;
const ASK_TIMEOUT_MS = 180000;

function execFileSafe(file: string, args: string[], timeoutMs = STATUS_TIMEOUT_MS): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                const err = error as Error & { code?: string; signal?: string };
                reject(new Error(`${err.message}${stdout ? `\nstdout:\n${stdout}` : ''}${stderr ? `\nstderr:\n${stderr}` : ''}`));
                return;
            }
            resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}

async function execFileSucceeds(file: string, args: string[], timeoutMs = STATUS_TIMEOUT_MS): Promise<boolean> {
    try {
        await execFileSafe(file, args, timeoutMs);
        return true;
    } catch {
        return false;
    }
}

function getWindowsUserSlug(): string {
    return path.basename(app.getPath('home') || '').toLowerCase() || 'eder';
}

function getDefaultWindowsEnginePath(): string {
    return process.env['LEX_ENGINE_WINDOWS_PATH'] || path.join(app.getPath('home'), 'lex_engine');
}

function getDefaultWslDistro(): string {
    return process.env['LEX_ENGINE_WSL_DISTRO'] || 'Ubuntu';
}

function getDefaultWslProjectPath(): string {
    return process.env['LEX_ENGINE_WSL_PATH'] || `/home/${getWindowsUserSlug()}/lex_engine`;
}

function getWindowsMountedWslEnginePath(): string {
    return `/mnt/c/Users/${path.basename(app.getPath('home') || 'EDER')}/lex_engine`;
}

function bashQuote(value: string): string {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`;
}

export async function getLexEngineStatus(): Promise<LexEngineStatus> {
    const windowsPath = getDefaultWindowsEnginePath();
    const windowsPathExists = fs.existsSync(windowsPath);
    const distro = getDefaultWslDistro();
    const projectPath = getDefaultWslProjectPath();
    const mountedProjectPath = getWindowsMountedWslEnginePath();
    const messages: string[] = [];

    let available = false;
    let projectPathExists = false;
    let resolvedProjectPath: string | undefined;
    let hermesAvailable = false;
    let hermesPath: string | undefined;
    let error: string | undefined;

    if (process.platform === 'win32') {
        const quickStatus = process.env['LEX_ENGINE_DEEP_STATUS'] !== '1';
        if (quickStatus) {
            available = true;
            projectPathExists = windowsPathExists;
            resolvedProjectPath = projectPath;
            hermesAvailable = windowsPathExists;
            hermesPath = windowsPathExists ? 'hermes' : undefined;
        } else {
            const projectCandidates = Array.from(new Set([projectPath, mountedProjectPath]));
            const wslArgs = ['-d', distro, '--'];
            const probeErrors: string[] = [];

            try {
                const result = await execFileSafe('wsl.exe', [...wslArgs, 'echo', 'WSL_OK']);
                available = result.stdout.includes('WSL_OK');
            } catch (err: any) {
                probeErrors.push(err?.message || String(err));
            }

            if (available) {
                for (const candidate of projectCandidates) {
                    const exists = await execFileSucceeds('wsl.exe', [...wslArgs, 'test', '-d', candidate]);
                    if (exists) {
                        projectPathExists = true;
                        resolvedProjectPath = candidate;
                        break;
                    }
                }

                try {
                    const result = await execFileSafe('wsl.exe', [...wslArgs, 'bash', '-lc', 'command -v hermes']);
                    hermesPath = result.stdout.trim() || undefined;
                    hermesAvailable = Boolean(hermesPath);
                } catch (err: any) {
                    probeErrors.push(err?.message || String(err));
                }
            }

            error = probeErrors.join('\n') || undefined;
        }
    } else {
        available = true;
        projectPathExists = fs.existsSync(projectPath);
        resolvedProjectPath = projectPathExists ? projectPath : undefined;
        try {
            const result = await execFileSafe('bash', ['-lc', 'command -v hermes || true']);
            hermesPath = result.stdout.trim() || undefined;
            hermesAvailable = Boolean(hermesPath);
        } catch (err: any) {
            error = err?.message || String(err);
        }
    }

    if (!windowsPathExists) messages.push(`Pasta Windows nao encontrada: ${windowsPath}`);
    if (!available) messages.push(`WSL/distro nao disponivel: ${distro}`);
    if (!projectPathExists) messages.push(`Projeto no WSL nao encontrado: ${projectPath} ou ${mountedProjectPath}`);
    if (!hermesAvailable) messages.push('Comando interno do motor nao encontrado no ambiente do Lex Engine.');
    if (error) messages.push(error);

    return {
        ok: available && projectPathExists && hermesAvailable,
        platform: process.platform,
        windowsPath,
        windowsPathExists,
        wsl: {
            distro,
            projectPath: resolvedProjectPath || projectPath,
            available,
            projectPathExists,
            hermesAvailable,
            hermesPath,
            error,
        },
        messages,
    };
}

export function getLexEngineConsoleSpawn(sessionId: string): LexEngineConsoleSpawn {
    const distro = getDefaultWslDistro();
    const projectPath = getDefaultWslProjectPath();
    const windowsPath = getDefaultWindowsEnginePath();
    const cwd = fs.existsSync(windowsPath) ? windowsPath : app.getPath('home');
    const env = {
        LEX_DESKTOP: '1',
        LEX_ENGINE_SESSION_ID: sessionId,
        LEX_STATUS_BROWSER: 'verifique pelo indicador do Desktop',
        LEX_STATUS_PJE: 'verifique pelo indicador do Desktop',
        LEX_STATUS_TRIBUNAL: 'preferido no Desktop',
        LEX_STATUS_URL: '',
    };

    if (process.platform === 'win32') {
        return {
            shell: 'wsl.exe',
            args: ['-d', distro, '--', 'bash', '-lc', `cd ${bashQuote(projectPath)} && hermes`],
            cwd,
            env,
        };
    }

    return {
        shell: 'bash',
        args: ['-lc', `cd ${bashQuote(projectPath)} && hermes`],
        cwd,
        env,
    };
}

function buildGuardedPrompt(prompt: string): string {
    return [
        'Voce esta respondendo dentro do Lex Desktop em modo visual controlado.',
        'Nesta chamada, nao execute ferramentas, comandos, navegador, arquivos, PJe ou acoes externas.',
        'Se a pergunta exigir uma acao no sistema, explique que ela deve ser feita pelo Console/MCP com confirmacao no Electron.',
        'Responda em portugues do Brasil, com postura juridica cuidadosa e sem inventar jurisprudencia.',
        '',
        'Pedido do usuario:',
        prompt,
    ].join('\n');
}

function cleanHermesText(stdout: string): string {
    return String(stdout || '')
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('session_id:'))
        .join('\n')
        .trim();
}

export async function askLexEngine(prompt: string): Promise<{ text: string; stderr?: string }> {
    const trimmedPrompt = String(prompt || '').trim();
    if (!trimmedPrompt) {
        throw new Error('Prompt vazio.');
    }

    const projectPath = getDefaultWslProjectPath();
    const guardedPrompt = buildGuardedPrompt(trimmedPrompt);
    const args = [
        'chat',
        '-Q',
        '--max-turns',
        '1',
        '--source',
        'lex-desktop',
        '-q',
        guardedPrompt,
    ];

    if (process.platform === 'win32') {
        const distro = getDefaultWslDistro();
        const command = `cd ${bashQuote(projectPath)} && hermes ${args.map(bashQuote).join(' ')}`;
        const result = await execFileSafe('wsl.exe', ['-d', distro, '--', 'bash', '-lc', command], ASK_TIMEOUT_MS);
        return { text: cleanHermesText(result.stdout), stderr: result.stderr.trim() || undefined };
    }

    const command = `cd ${bashQuote(projectPath)} && hermes ${args.map(bashQuote).join(' ')}`;
    const result = await execFileSafe('bash', ['-lc', command], ASK_TIMEOUT_MS);
    return { text: cleanHermesText(result.stdout), stderr: result.stderr.trim() || undefined };
}
