import { app } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ExecResult {
    stdout: string;
    stderr: string;
}

type LexEngineMode = 'external-wsl' | 'repo-wsl' | 'repo-windows';

export interface LexEngineStatus {
    ok: boolean;
    platform: NodeJS.Platform;
    engineMode: string;
    engineSource: string;
    engineRuntimePath: string;
    repoEnginePath: string;
    repoEnginePathExists: boolean;
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

interface LexEngineRuntime {
    mode: LexEngineMode;
    source: string;
    windowsPath: string;
    wslPath: string;
    command: string;
    cwd: string;
    supported: boolean;
    unsupportedReason?: string;
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

export function getLexEngineRepoPath(): string {
    return process.env['LEX_ENGINE_REPO_PATH'] || path.join(app.getAppPath(), 'engine', 'lex-engine');
}

function getLexEngineMode(): LexEngineMode {
    const mode = process.env['LEX_ENGINE_MODE'] || 'repo-wsl';
    if (mode === 'repo-wsl' || mode === 'repo-windows' || mode === 'external-wsl') return mode;
    return 'external-wsl';
}

function getDefaultWslDistro(): string {
    return process.env['LEX_ENGINE_WSL_DISTRO'] || 'Ubuntu';
}

function getDefaultWslProjectPath(): string {
    return process.env['LEX_ENGINE_WSL_PATH'] || `/home/${getWindowsUserSlug()}/lex_engine`;
}

function getDefaultWslPythonPath(): string {
    return process.env['LEX_ENGINE_WSL_PYTHON'] || `${getDefaultWslProjectPath()}/venv/bin/python`;
}

export function windowsPathToWslPath(windowsPath: string): string {
    const normalized = path.resolve(windowsPath).replace(/\\/g, '/');
    const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
    if (!match) return normalized;
    const drive = match[1] || 'c';
    const rest = match[2] || '';
    return `/mnt/${drive.toLowerCase()}/${rest}`;
}

function getRepoWslProjectPath(): string {
    return process.env['LEX_ENGINE_REPO_WSL_PATH'] || windowsPathToWslPath(getLexEngineRepoPath());
}

function getRepoWslPythonPath(): string {
    return process.env['LEX_ENGINE_REPO_PYTHON'] || getDefaultWslPythonPath();
}

export function getLexEngineAgoraBoardPath(): string {
    return process.env['LEX_AGORA_BOARD_PATH'] || path.join(app.getPath('userData'), 'agora', 'engine-board.json');
}

export function getLexEngineKanbanHomePath(): string {
    return process.env['HERMES_KANBAN_HOME'] || process.env['LEX_KANBAN_HOME'] || path.join(app.getPath('userData'), 'agora-kanban');
}

export function getLexEngineKanbanBridgeEnv(): Record<string, string> {
    const runtime = resolveLexEngineRuntime();
    const env: Record<string, string> = {
        HERMES_KANBAN_HOME: getLexEngineKanbanHomePath(),
        LEX_KANBAN_ENABLE_WORKER_SPAWN: process.env['LEX_AGORA_ENABLE_WORKERS'] === '1' ? '1' : '0',
    };

    if (process.platform === 'win32' && (runtime.mode === 'repo-wsl' || runtime.mode === 'external-wsl')) {
        env['LEX_KANBAN_SPAWN_MODE'] = 'wsl';
        env['LEX_KANBAN_WSL_DISTRO'] = getDefaultWslDistro();
        env['LEX_KANBAN_WSL_PROJECT_PATH'] = runtime.wslPath;
        env['LEX_KANBAN_WSL_COMMAND'] = runtime.command;
        env['LEX_KANBAN_WSL_HOME'] = windowsPathToWslPath(getLexEngineKanbanHomePath());
    } else {
        env['LEX_KANBAN_SPAWN_MODE'] = 'local';
    }

    return env;
}

function getWindowsMountedWslEnginePath(): string {
    return `/mnt/c/Users/${path.basename(app.getPath('home') || 'EDER')}/lex_engine`;
}

function resolveLexEngineRuntime(): LexEngineRuntime {
    const mode = getLexEngineMode();
    const repoEnginePath = getLexEngineRepoPath();
    const externalWindowsPath = getDefaultWindowsEnginePath();

    if (mode === 'repo-wsl') {
        return {
            mode,
            source: 'repo-wsl',
            windowsPath: repoEnginePath,
            wslPath: getRepoWslProjectPath(),
            command: `${bashQuote(getRepoWslPythonPath())} hermes`,
            cwd: fs.existsSync(repoEnginePath) ? repoEnginePath : app.getPath('home'),
            supported: true,
        };
    }

    if (mode === 'repo-windows') {
        return {
            mode,
            source: 'repo-windows',
            windowsPath: repoEnginePath,
            wslPath: getRepoWslProjectPath(),
            command: 'python hermes',
            cwd: fs.existsSync(repoEnginePath) ? repoEnginePath : app.getPath('home'),
            supported: false,
            unsupportedReason: 'LEX_ENGINE_MODE=repo-windows ainda nao e runtime suportado. Use external-wsl ou repo-wsl.',
        };
    }

    return {
        mode: 'external-wsl',
        source: 'external-wsl',
        windowsPath: externalWindowsPath,
        wslPath: getDefaultWslProjectPath(),
        command: 'hermes',
        cwd: fs.existsSync(externalWindowsPath) ? externalWindowsPath : app.getPath('home'),
        supported: true,
    };
}

function bashQuote(value: string): string {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`;
}

export async function getLexEngineStatus(): Promise<LexEngineStatus> {
    const runtime = resolveLexEngineRuntime();
    const engineMode = runtime.mode;
    const repoEnginePath = getLexEngineRepoPath();
    const repoEnginePathExists = fs.existsSync(repoEnginePath);
    const windowsPath = runtime.windowsPath;
    const windowsPathExists = fs.existsSync(windowsPath);
    const distro = getDefaultWslDistro();
    const projectPath = runtime.wslPath;
    const mountedProjectPath = runtime.mode === 'external-wsl' ? getWindowsMountedWslEnginePath() : getRepoWslProjectPath();
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
            hermesAvailable = runtime.supported && windowsPathExists;
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

    if (!runtime.supported) messages.push(runtime.unsupportedReason || 'Modo de Engine nao suportado.');
    if (!windowsPathExists) messages.push(`Pasta Windows nao encontrada: ${windowsPath}`);
    if (!available) messages.push(`WSL/distro nao disponivel: ${distro}`);
    if (!projectPathExists) messages.push(`Projeto no WSL nao encontrado: ${projectPath} ou ${mountedProjectPath}`);
    if (!hermesAvailable) messages.push('Comando interno do motor nao encontrado no ambiente do Lex Engine.');
    if (error) messages.push(error);

    return {
        ok: runtime.supported && available && projectPathExists && hermesAvailable,
        platform: process.platform,
        engineMode,
        engineSource: runtime.source,
        engineRuntimePath: resolvedProjectPath || projectPath,
        repoEnginePath,
        repoEnginePathExists,
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
    const runtime = resolveLexEngineRuntime();
    const engineMode = runtime.mode;
    const distro = getDefaultWslDistro();
    const projectPath = runtime.wslPath;
    const cwd = runtime.cwd;
    const agoraBoardPath = getLexEngineAgoraBoardPath();
    const kanbanHomePath = getLexEngineKanbanHomePath();
    try {
        fs.mkdirSync(path.dirname(agoraBoardPath), { recursive: true });
        fs.mkdirSync(kanbanHomePath, { recursive: true });
    } catch {
        // Best-effort; the engine tool also creates its parent directory.
    }
    const env = {
        LEX_DESKTOP: '1',
        LEX_ENGINE_SESSION_ID: sessionId,
        LEX_ENGINE_MODE: engineMode,
        LEX_AGORA_BOARD_PATH: agoraBoardPath,
        HERMES_KANBAN_HOME: kanbanHomePath,
        LEX_STATUS_BROWSER: 'verifique pelo indicador do Desktop',
        LEX_STATUS_PJE: 'verifique pelo indicador do Desktop',
        LEX_STATUS_TRIBUNAL: 'preferido no Desktop',
        LEX_STATUS_URL: '',
    };

    if (!runtime.supported) {
        throw new Error(runtime.unsupportedReason || 'Modo de Engine nao suportado.');
    }

    if (process.platform === 'win32') {
        const wslAgoraBoardPath = windowsPathToWslPath(agoraBoardPath);
        const wslKanbanHomePath = windowsPathToWslPath(kanbanHomePath);
        return {
            shell: 'wsl.exe',
            args: ['-d', distro, '--', 'bash', '-lc', `cd ${bashQuote(projectPath)} && LEX_AGORA_BOARD_PATH=${bashQuote(wslAgoraBoardPath)} HERMES_KANBAN_HOME=${bashQuote(wslKanbanHomePath)} ${runtime.command}`],
            cwd,
            env,
        };
    }

    return {
        shell: 'bash',
        args: ['-lc', `cd ${bashQuote(projectPath)} && ${runtime.command}`],
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

    const runtime = resolveLexEngineRuntime();
    if (!runtime.supported) {
        throw new Error(runtime.unsupportedReason || 'Modo de Engine nao suportado.');
    }
    const projectPath = runtime.wslPath;
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
        const command = `cd ${bashQuote(projectPath)} && ${runtime.command} ${args.map(bashQuote).join(' ')}`;
        const result = await execFileSafe('wsl.exe', ['-d', distro, '--', 'bash', '-lc', command], ASK_TIMEOUT_MS);
        return { text: cleanHermesText(result.stdout), stderr: result.stderr.trim() || undefined };
    }

    const command = `cd ${bashQuote(projectPath)} && ${runtime.command} ${args.map(bashQuote).join(' ')}`;
    const result = await execFileSafe('bash', ['-lc', command], ASK_TIMEOUT_MS);
    return { text: cleanHermesText(result.stdout), stderr: result.stderr.trim() || undefined };
}
