import { app } from 'electron';
import { execFile, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { ProviderId } from './provider-config';

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

export interface LexEngineProviderSnapshot {
    available: boolean;
    desktopProviderId?: ProviderId;
    hermesProviderId?: string;
    agentModel?: string;
    visionModel?: string;
    configPath?: string;
    envPath?: string;
    source?: string;
    error?: string;
}

export interface LexEngineSkillsRuntimeSnapshot {
    available: boolean;
    source?: string;
    distro?: string;
    projectPath?: string;
    configPath?: string;
    hermesHome?: string;
    totalSkills?: number;
    activeSkills?: number;
    disabledSkills?: number;
    legalSkills?: number;
    activeSkillNames?: string[];
    disabledSkillNames?: string[];
    memoryProvider?: string;
    memoriesDir?: string;
    memoryFiles?: Array<{
        name: string;
        exists: boolean;
        charCount: number;
        entryCount: number;
        modifiedAt?: string;
    }>;
    recentSkillUpdates?: Array<{
        name: string;
        path: string;
        modifiedAt?: string;
    }>;
    error?: string;
}

export interface LexEngineConnectorMcpServer {
    id: string;
    name: string;
    enabled: boolean;
    transport: string;
    command?: string;
    url?: string;
    argsCount: number;
    envKeys: string[];
    toolFilters: string[];
}

export interface LexEngineConnectorGatewayRuntime {
    manager: string;
    running: boolean;
    serviceInstalled: boolean;
    serviceRunning: boolean;
    serviceScope?: string;
    hasProcessServiceMismatch: boolean;
    gatewayPids: number[];
}

export interface LexEngineConnectorGatewayPlatform {
    id: string;
    label: string;
    toolset?: string;
    kind: string;
    enabled: boolean;
    connected: boolean;
    hasHomeChannel: boolean;
    hasCredentials: boolean;
    extraKeys: string[];
}

export interface LexEngineConnectorsSnapshot {
    available: boolean;
    source?: string;
    distro?: string;
    projectPath?: string;
    configPath?: string;
    hermesHome?: string;
    mcpServers: LexEngineConnectorMcpServer[];
    gatewayRuntime?: LexEngineConnectorGatewayRuntime;
    gatewayPlatforms: LexEngineConnectorGatewayPlatform[];
    error?: string;
}

const STATUS_TIMEOUT_MS = 5000;
const ASK_TIMEOUT_MS = 180000;
const PROVIDER_SYNC_TIMEOUT_MS = 30000;

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
    const configured = String(process.env['LEX_ENGINE_WSL_DISTRO'] || '').trim();
    if (configured) return configured;

    if (process.platform === 'win32') {
        try {
            const output = execFileSync('wsl.exe', ['-l', '-q'], {
                encoding: 'utf16le',
                stdio: ['ignore', 'pipe', 'ignore'],
                windowsHide: true,
                timeout: 5000,
            });
            const first = String(output || '')
                .replace(/\0/g, '')
                .split(/\r?\n/)
                .map((line) => line.replace(/^\*/, '').trim())
                .find(Boolean);
            if (first) return first;
        } catch {
            // Fall back to the historical default below.
        }
    }

    return 'Ubuntu';
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

function getRuntimePythonPath(runtime: LexEngineRuntime): string {
    if (runtime.mode === 'repo-wsl') return getRepoWslPythonPath();
    if (runtime.mode === 'external-wsl') return getDefaultWslPythonPath();
    return 'python';
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

function buildBashEnvPrefix(env: Record<string, string>): string {
    return Object.entries(env)
        .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
        .map(([key, value]) => `${key}=${bashQuote(String(value ?? ''))}`)
        .join(' ');
}

async function execLexEngineCommand(command: string, timeoutMs = STATUS_TIMEOUT_MS): Promise<ExecResult> {
    const runtime = resolveLexEngineRuntime();
    if (!runtime.supported) {
        throw new Error(runtime.unsupportedReason || 'Modo de Engine nao suportado.');
    }

    if (process.platform === 'win32') {
        const distro = getDefaultWslDistro();
        const fullCommand = `cd ${bashQuote(runtime.wslPath)} && ${command}`;
        return execFileSafe('wsl.exe', ['-d', distro, '--', 'bash', '-lc', fullCommand], timeoutMs);
    }

    const fullCommand = `cd ${bashQuote(runtime.wslPath)} && ${command}`;
    return execFileSafe('bash', ['-lc', fullCommand], timeoutMs);
}

function mapDesktopProviderToHermesProvider(providerId: ProviderId): string {
    switch (providerId) {
        case 'google':
            return 'gemini';
        case 'ollama':
            return 'custom';
        default:
            return providerId;
    }
}

function mapHermesProviderToDesktopProvider(providerId: string, baseUrl = ''): ProviderId | undefined {
    const normalized = String(providerId || '').trim().toLowerCase();
    const normalizedBaseUrl = String(baseUrl || '').trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'gemini') return 'google';
    if (normalized === 'custom' && (normalizedBaseUrl.includes('11434') || normalizedBaseUrl.includes('ollama'))) {
        return 'ollama';
    }
    if (normalized === 'anthropic' || normalized === 'openai' || normalized === 'openrouter' || normalized === 'groq') {
        return normalized;
    }
    return undefined;
}

function getHermesEnvVarForProvider(providerId: ProviderId): string | null {
    switch (providerId) {
        case 'anthropic':
            return 'ANTHROPIC_API_KEY';
        case 'openai':
        case 'ollama':
            return 'OPENAI_API_KEY';
        case 'openrouter':
            return 'OPENROUTER_API_KEY';
        case 'google':
            return 'GOOGLE_API_KEY';
        case 'groq':
            return 'GROQ_API_KEY';
        default:
            return null;
    }
}

const TEXT_AUXILIARY_TASKS = [
    'compression',
    'title_generation',
    'web_extract',
    'session_search',
    'skills_hub',
    'approval',
    'mcp',
];

export async function syncLexEngineProviderConfig(config: {
    providerId: ProviderId;
    apiKey: string;
    agentModel: string;
    visionModel: string;
}): Promise<void> {
    const runtime = resolveLexEngineRuntime();
    if (!runtime.supported) {
        throw new Error(runtime.unsupportedReason || 'Modo de Engine nao suportado.');
    }

    const hermesProvider = mapDesktopProviderToHermesProvider(config.providerId);
    const commands = [
        `${runtime.command} config set model.provider ${bashQuote(hermesProvider)}`,
        `${runtime.command} config set model.default ${bashQuote(config.agentModel)}`,
        `${runtime.command} config set auxiliary.vision.provider ${bashQuote(hermesProvider)}`,
        `${runtime.command} config set auxiliary.vision.model ${bashQuote(config.visionModel)}`,
    ];

    for (const task of TEXT_AUXILIARY_TASKS) {
        commands.push(`${runtime.command} config set auxiliary.${task}.provider ${bashQuote(hermesProvider)}`);
        commands.push(`${runtime.command} config set auxiliary.${task}.model ${bashQuote(config.agentModel)}`);
    }

    if (config.providerId === 'ollama') {
        const ollamaBaseUrl = 'http://localhost:11434/v1';
        commands.push(`${runtime.command} config set model.base_url ${bashQuote(ollamaBaseUrl)}`);
        commands.push(`${runtime.command} config set auxiliary.vision.base_url ${bashQuote(ollamaBaseUrl)}`);
        for (const task of TEXT_AUXILIARY_TASKS) {
            commands.push(`${runtime.command} config set auxiliary.${task}.base_url ${bashQuote(ollamaBaseUrl)}`);
        }
    } else {
        // Clear stale endpoint overrides when moving back to built-in providers.
        // Without this, Hermes can keep an old OpenRouter/custom base_url while
        // the provider was switched to Anthropic/OpenAI/etc., causing hybrid
        // routing such as provider=anthropic -> endpoint=openrouter.ai.
        commands.push(`${runtime.command} config set model.base_url ${bashQuote('')}`);
        commands.push(`${runtime.command} config set auxiliary.vision.base_url ${bashQuote('')}`);
        for (const task of TEXT_AUXILIARY_TASKS) {
            commands.push(`${runtime.command} config set auxiliary.${task}.base_url ${bashQuote('')}`);
        }
    }

    const envValue = (config.apiKey || (config.providerId === 'ollama' ? 'ollama' : '')).trim();
    const envVar = getHermesEnvVarForProvider(config.providerId);
    if (config.providerId === 'anthropic' && envValue) {
        // Hermes resolves ANTHROPIC_TOKEN before ANTHROPIC_API_KEY. When the
        // desktop saves a fresh API key we must also clear any stale OAuth/setup
        // token, otherwise the engine can keep authenticating with the old one.
        commands.push(`${runtime.command} config set ANTHROPIC_API_KEY ${bashQuote(envValue)}`);
        commands.push(`${runtime.command} config set ANTHROPIC_TOKEN ${bashQuote('')}`);
    } else if (envVar && envValue) {
        commands.push(`${runtime.command} config set ${envVar} ${bashQuote(envValue)}`);
    }

    try {
        await execLexEngineCommand(commands.join(' && '), PROVIDER_SYNC_TIMEOUT_MS);
    } catch {
        // The command contains provider credentials; never propagate its text to logs.
        throw new Error('Falha ao sincronizar configuracao do provider com o Hermes.');
    }
}

export async function getLexEngineProviderSnapshot(): Promise<LexEngineProviderSnapshot> {
    const runtime = resolveLexEngineRuntime();
    if (!runtime.supported) {
        return {
            available: false,
            source: runtime.source,
            error: runtime.unsupportedReason || 'Modo de Engine nao suportado.',
        };
    }

    const pythonPath = getRuntimePythonPath(runtime);
    const pythonCode = [
        'import json',
        'from hermes_cli.config import load_config, get_config_path, get_env_path, get_env_value',
        'cfg = load_config() or {}',
        'model_cfg = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}',
        'aux_cfg = cfg.get("auxiliary") if isinstance(cfg.get("auxiliary"), dict) else {}',
        'vision_cfg = aux_cfg.get("vision") if isinstance(aux_cfg.get("vision"), dict) else {}',
        'provider = str(model_cfg.get("provider") or "").strip()',
        'agent_model = str(model_cfg.get("default") or model_cfg.get("model") or "").strip()',
        'base_url = str(model_cfg.get("base_url") or "").strip()',
        'vision_model = str(vision_cfg.get("model") or get_env_value("AUXILIARY_VISION_MODEL") or "").strip()',
        'payload = {',
        '    "provider": provider,',
        '    "agent_model": agent_model,',
        '    "vision_model": vision_model,',
        '    "base_url": base_url,',
        '    "config_path": str(get_config_path()),',
        '    "env_path": str(get_env_path()),',
        '}',
        'print(json.dumps(payload))',
    ].join('\n');

    try {
        const result = await execLexEngineCommand(
            `${bashQuote(pythonPath)} -c ${bashQuote(pythonCode)}`,
            PROVIDER_SYNC_TIMEOUT_MS,
        );
        const payload = JSON.parse(String(result.stdout || '').trim() || '{}') as Record<string, string>;
        return {
            available: true,
            source: runtime.source,
            hermesProviderId: payload['provider'] || '',
            desktopProviderId: mapHermesProviderToDesktopProvider(payload['provider'] || '', payload['base_url'] || ''),
            agentModel: payload['agent_model'] || '',
            visionModel: payload['vision_model'] || '',
            configPath: payload['config_path'] || '',
            envPath: payload['env_path'] || '',
        };
    } catch (error: any) {
        return {
            available: false,
            source: runtime.source,
            error: error?.message || String(error),
        };
    }
}

export async function getLexEngineSkillsRuntimeSnapshot(): Promise<LexEngineSkillsRuntimeSnapshot> {
    const runtime = resolveLexEngineRuntime();
    if (!runtime.supported) {
        return {
            available: false,
            source: runtime.source,
            error: runtime.unsupportedReason || 'Modo de Engine nao suportado.',
        };
    }

    const pythonPath = getRuntimePythonPath(runtime);
    const pythonCode = [
        'import json',
        'from pathlib import Path',
        'from hermes_cli.config import load_config, get_config_path, get_hermes_home',
        'from hermes_cli.skills_config import get_disabled_skills',
        'from tools.skills_tool import _find_all_skills',
        'cfg = load_config() or {}',
        'hermes_home = Path(get_hermes_home())',
        'memories_dir = hermes_home / "memories"',
        'all_skills = _find_all_skills(skip_disabled=True)',
        'disabled = sorted(get_disabled_skills(cfg))',
        'disabled_set = set(disabled)',
        'active = [s for s in all_skills if str(s.get("name") or "") not in disabled_set]',
        'legal = [s for s in active if str(s.get("category") or "") == "legal"]',
        'def memory_stats(filename):',
        '    target = memories_dir / filename',
        '    if not target.exists():',
        '        return {"name": filename, "exists": False, "char_count": 0, "entry_count": 0}',
        '    text = target.read_text(encoding="utf-8")',
        '    parts = [p.strip() for p in text.split("\\n§\\n") if p.strip()]',
        '    return {',
        '        "name": filename,',
        '        "exists": True,',
        '        "char_count": len(text),',
        '        "entry_count": len(parts),',
        '        "modified_at": __import__("datetime").datetime.fromtimestamp(target.stat().st_mtime, __import__("datetime").timezone.utc).isoformat(),',
        '    }',
        'skill_updates = []',
        'skills_root = hermes_home / "skills"',
        'if skills_root.exists():',
        '    for skill_file in skills_root.rglob("SKILL.md"):',
        '        try:',
        '            stat = skill_file.stat()',
        '            skill_updates.append({',
        '                "name": skill_file.parent.name,',
        '                "path": str(skill_file),',
        '                "modified_at": __import__("datetime").datetime.fromtimestamp(stat.st_mtime, __import__("datetime").timezone.utc).isoformat(),',
        '                "modified_ts": stat.st_mtime,',
        '            })',
        '        except Exception:',
        '            pass',
        'skill_updates.sort(key=lambda item: item.get("modified_ts") or 0, reverse=True)',
        'for item in skill_updates:',
        '    item.pop("modified_ts", None)',
        'payload = {',
        '    "config_path": str(get_config_path()),',
        '    "hermes_home": str(hermes_home),',
        '    "total_skills": len(all_skills),',
        '    "active_skills": len(active),',
        '    "disabled_skills": len(disabled),',
        '    "legal_skills": len(legal),',
        '    "active_skill_names": sorted(str(s.get("name") or "") for s in active)[:80],',
        '    "disabled_skill_names": disabled[:80],',
        '    "memory_provider": str(((cfg.get("memory") or {}).get("provider")) or "builtin"),',
        '    "memories_dir": str(memories_dir),',
        '    "memory_files": [memory_stats("MEMORY.md"), memory_stats("USER.md")],',
        '    "recent_skill_updates": skill_updates[:6],',
        '}',
        'print(json.dumps(payload))',
    ].join('\n');

    try {
        const result = await execLexEngineCommand(
            `${bashQuote(pythonPath)} -c ${bashQuote(pythonCode)}`,
            PROVIDER_SYNC_TIMEOUT_MS,
        );
        const payload = JSON.parse(String(result.stdout || '').trim() || '{}') as Record<string, any>;
        const gatewayRuntimePayload = payload['gateway_runtime'] as Record<string, any> | undefined;
        return {
            available: true,
            source: runtime.source,
            distro: getDefaultWslDistro(),
            projectPath: runtime.wslPath,
            configPath: String(payload['config_path'] || ''),
            hermesHome: String(payload['hermes_home'] || ''),
            totalSkills: Number(payload['total_skills'] || 0),
            activeSkills: Number(payload['active_skills'] || 0),
            disabledSkills: Number(payload['disabled_skills'] || 0),
            legalSkills: Number(payload['legal_skills'] || 0),
            activeSkillNames: Array.isArray(payload['active_skill_names']) ? payload['active_skill_names'].map(String) : [],
            disabledSkillNames: Array.isArray(payload['disabled_skill_names']) ? payload['disabled_skill_names'].map(String) : [],
            memoryProvider: String(payload['memory_provider'] || 'builtin'),
            memoriesDir: String(payload['memories_dir'] || ''),
            memoryFiles: Array.isArray(payload['memory_files'])
                ? payload['memory_files'].map((item: any) => ({
                    name: String(item?.name || ''),
                    exists: Boolean(item?.exists),
                    charCount: Number(item?.char_count || 0),
                    entryCount: Number(item?.entry_count || 0),
                    modifiedAt: item?.modified_at ? String(item.modified_at) : undefined,
                }))
                : [],
            recentSkillUpdates: Array.isArray(payload['recent_skill_updates'])
                ? payload['recent_skill_updates'].map((item: any) => ({
                    name: String(item?.name || ''),
                    path: String(item?.path || ''),
                    modifiedAt: item?.modified_at ? String(item.modified_at) : undefined,
                }))
                : [],
        };
    } catch (error: any) {
        return {
            available: false,
            source: runtime.source,
            distro: getDefaultWslDistro(),
            projectPath: runtime.wslPath,
            error: error?.message || String(error),
        };
    }
}

export async function getLexEngineConnectorsSnapshot(): Promise<LexEngineConnectorsSnapshot> {
    const runtime = resolveLexEngineRuntime();
    if (!runtime.supported) {
        return {
            available: false,
            source: runtime.source,
            error: runtime.unsupportedReason || 'Modo de Engine nao suportado.',
            mcpServers: [],
            gatewayPlatforms: [],
        };
    }

    const pythonPath = getRuntimePythonPath(runtime);
    const pythonCode = [
        'import json',
        'from hermes_cli.config import load_config, get_config_path, get_hermes_home',
        'from hermes_cli.gateway import get_gateway_runtime_snapshot',
        'from hermes_cli.platforms import PLATFORMS',
        'from gateway.config import load_gateway_config',
        'cfg = load_config() or {}',
        'gateway_cfg = load_gateway_config()',
        'runtime = get_gateway_runtime_snapshot()',
        'connected_keys = {getattr(platform, "value", str(platform)) for platform in gateway_cfg.get_connected_platforms()}',
        'mcp_cfg = cfg.get("mcp_servers") if isinstance(cfg.get("mcp_servers"), dict) else {}',
        'def infer_kind(key):',
        '    messaging = {"telegram", "discord", "slack", "whatsapp", "signal", "mattermost", "matrix", "email", "sms", "dingtalk", "feishu", "wecom", "wecom_callback", "weixin", "bluebubbles", "qqbot", "yuanbao"}',
        '    if key in {"api_server", "webhook"}:',
        '        return "api"',
        '    if key in {"cron", "scheduler"}:',
        '        return "automation"',
        '    if key in messaging:',
        '        return "messaging"',
        '    return "general"',
        'def normalize_server(name, raw):',
        '    raw = raw if isinstance(raw, dict) else {}',
        '    command = str(raw.get("command") or "").strip()',
        '    url = str(raw.get("url") or raw.get("endpoint") or "").strip()',
        '    args = raw.get("args") if isinstance(raw.get("args"), list) else []',
        '    env = raw.get("env") if isinstance(raw.get("env"), dict) else {}',
        '    filters = raw.get("tool_filters") if isinstance(raw.get("tool_filters"), list) else []',
        '    enabled = bool(raw.get("enabled", not raw.get("disabled", False)))',
        '    transport = "stdio" if command else ("http" if url else "unknown")',
        '    return {',
        '        "id": str(name),',
        '        "name": str(raw.get("name") or name),',
        '        "enabled": enabled,',
        '        "transport": transport,',
        '        "command": command,',
        '        "url": url,',
        '        "args_count": len(args),',
        '        "env_keys": sorted(str(key) for key in env.keys())[:8],',
        '        "tool_filters": [str(item) for item in filters][:8],',
        '    }',
        'mcp_servers = [normalize_server(name, raw) for name, raw in sorted(mcp_cfg.items())]',
        'platform_entries = []',
        'known_keys = [key for key in PLATFORMS.keys() if key not in {"cli", "cron"}]',
        'for key in known_keys:',
        '    info = PLATFORMS.get(key)',
        '    platform_key = next((item for item in gateway_cfg.platforms.keys() if getattr(item, "value", str(item)) == key), None)',
        '    platform_cfg = gateway_cfg.platforms.get(platform_key) if platform_key is not None else None',
        '    extra = dict(getattr(platform_cfg, "extra", {}) or {}) if platform_cfg is not None else {}',
        '    token = str(getattr(platform_cfg, "token", "") or "") if platform_cfg is not None else ""',
        '    api_key = str(getattr(platform_cfg, "api_key", "") or "") if platform_cfg is not None else ""',
        '    has_home = bool(getattr(platform_cfg, "home_channel", None)) if platform_cfg is not None else False',
        '    has_credentials = bool(token or api_key or extra or has_home)',
        '    enabled = bool(getattr(platform_cfg, "enabled", False)) if platform_cfg is not None else False',
        '    platform_entries.append({',
        '        "id": key,',
        '        "label": str(getattr(info, "label", key)),',
        '        "toolset": str(getattr(info, "default_toolset", "")),',
        '        "kind": infer_kind(key),',
        '        "enabled": enabled,',
        '        "connected": key in connected_keys,',
        '        "has_home_channel": has_home,',
        '        "has_credentials": has_credentials,',
        '        "extra_keys": sorted(str(item) for item in extra.keys())[:8],',
        '    })',
        'payload = {',
        '    "config_path": str(get_config_path()),',
        '    "hermes_home": str(get_hermes_home()),',
        '    "mcp_servers": mcp_servers,',
        '    "gateway_runtime": {',
        '        "manager": str(runtime.manager),',
        '        "running": bool(runtime.running),',
        '        "service_installed": bool(runtime.service_installed),',
        '        "service_running": bool(runtime.service_running),',
        '        "service_scope": str(runtime.service_scope or ""),',
        '        "has_process_service_mismatch": bool(runtime.has_process_service_mismatch),',
        '        "gateway_pids": [int(pid) for pid in getattr(runtime, "gateway_pids", ())],',
        '    },',
        '    "gateway_platforms": platform_entries,',
        '}',
        'print(json.dumps(payload))',
    ].join('\n');

    try {
        const result = await execLexEngineCommand(
            `${bashQuote(pythonPath)} -c ${bashQuote(pythonCode)}`,
            PROVIDER_SYNC_TIMEOUT_MS,
        );
        const payload = JSON.parse(String(result.stdout || '').trim() || '{}') as Record<string, any>;
        const gatewayRuntimePayload = payload['gateway_runtime'] as Record<string, any> | undefined;
        return {
            available: true,
            source: runtime.source,
            distro: getDefaultWslDistro(),
            projectPath: runtime.wslPath,
            configPath: String(payload['config_path'] || ''),
            hermesHome: String(payload['hermes_home'] || ''),
            mcpServers: Array.isArray(payload['mcp_servers'])
                ? payload['mcp_servers'].map((item: any) => ({
                    id: String(item?.id || ''),
                    name: String(item?.name || item?.id || ''),
                    enabled: Boolean(item?.enabled),
                    transport: String(item?.transport || 'unknown'),
                    command: item?.command ? String(item.command) : undefined,
                    url: item?.url ? String(item.url) : undefined,
                    argsCount: Number(item?.args_count || 0),
                    envKeys: Array.isArray(item?.env_keys) ? item.env_keys.map(String) : [],
                    toolFilters: Array.isArray(item?.tool_filters) ? item.tool_filters.map(String) : [],
                }))
                : [],
            gatewayRuntime: gatewayRuntimePayload
                ? {
                    manager: String(gatewayRuntimePayload?.['manager'] || 'manual process'),
                    running: Boolean(gatewayRuntimePayload?.['running']),
                    serviceInstalled: Boolean(gatewayRuntimePayload?.['service_installed']),
                    serviceRunning: Boolean(gatewayRuntimePayload?.['service_running']),
                    serviceScope: gatewayRuntimePayload?.['service_scope'] ? String(gatewayRuntimePayload['service_scope']) : undefined,
                    hasProcessServiceMismatch: Boolean(gatewayRuntimePayload?.['has_process_service_mismatch']),
                    gatewayPids: Array.isArray(gatewayRuntimePayload?.['gateway_pids'])
                        ? gatewayRuntimePayload['gateway_pids'].map((pid: any) => Number(pid || 0)).filter((pid: number) => Number.isFinite(pid) && pid > 0)
                        : [],
                }
                : undefined,
            gatewayPlatforms: Array.isArray(payload['gateway_platforms'])
                ? payload['gateway_platforms'].map((item: any) => ({
                    id: String(item?.id || ''),
                    label: String(item?.label || item?.id || ''),
                    toolset: item?.toolset ? String(item.toolset) : undefined,
                    kind: String(item?.kind || 'general'),
                    enabled: Boolean(item?.enabled),
                    connected: Boolean(item?.connected),
                    hasHomeChannel: Boolean(item?.has_home_channel),
                    hasCredentials: Boolean(item?.has_credentials),
                    extraKeys: Array.isArray(item?.extra_keys) ? item.extra_keys.map(String) : [],
                }))
                : [],
        };
    } catch (error: any) {
        return {
            available: false,
            source: runtime.source,
            distro: getDefaultWslDistro(),
            projectPath: runtime.wslPath,
            error: error?.message || String(error),
            mcpServers: [],
            gatewayPlatforms: [],
        };
    }
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
            resolvedProjectPath = projectPath;
            try {
                const result = await execFileSafe('wsl.exe', ['-d', distro, '--', 'echo', 'WSL_OK']);
                available = result.stdout.includes('WSL_OK');
            } catch (err: any) {
                available = false;
                error = err?.message || String(err);
            }
            projectPathExists = available && windowsPathExists;
            hermesAvailable = runtime.supported && available && windowsPathExists;
            hermesPath = hermesAvailable ? 'hermes' : undefined;
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

export function getLexEngineConsoleSpawn(sessionId: string, extraEnv: Record<string, string> = {}): LexEngineConsoleSpawn {
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
        LEX_DESKTOP_REQUIRED_TOOLSETS: 'web,browser,terminal,file,vision,skills,todo,memory,session_search,clarify,delegation,cronjob',
        ...extraEnv,
    };

    if (!runtime.supported) {
        throw new Error(runtime.unsupportedReason || 'Modo de Engine nao suportado.');
    }

    if (process.platform === 'win32') {
        const wslAgoraBoardPath = windowsPathToWslPath(agoraBoardPath);
        const wslKanbanHomePath = windowsPathToWslPath(kanbanHomePath);
        const inheritedWslEnv = String(process.env['WSLENV'] || '').trim();
        const hitlWslEnv = 'LEX_DESKTOP_HITL_CAPABILITY/w';
        const commandEnv = {
            ...env,
            LEX_AGORA_BOARD_PATH: wslAgoraBoardPath,
            HERMES_KANBAN_HOME: wslKanbanHomePath,
            WSLENV: inheritedWslEnv ? `${inheritedWslEnv}:${hitlWslEnv}` : hitlWslEnv,
        };
        const envPrefix = buildBashEnvPrefix(commandEnv);
        return {
            shell: 'wsl.exe',
            args: ['-d', distro, '--', 'bash', '-lc', `cd ${bashQuote(projectPath)} && ${envPrefix} ${runtime.command}`],
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
