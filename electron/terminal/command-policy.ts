/**
 * Central command policy for terminal_executar.
 *
 * This keeps the agent-facing terminal as a technical backroom: useful for
 * diagnostics/dev commands, but conservative for mutations and hard-blocking
 * clearly dangerous shell operations.
 */

export type CommandCategory =
    | 'read_only'
    | 'dev_read_only'
    | 'dev_mutation'
    | 'external_effect'
    | 'filesystem_mutation'
    | 'process_control'
    | 'network_download'
    | 'destructive'
    | 'blocked'
    | 'unknown';

export type CommandRisk = 'low' | 'medium' | 'high' | 'blocked';

export type CommandPolicyResult = {
    category: CommandCategory;
    risk: CommandRisk;
    requiresConfirmation: boolean;
    blocked: boolean;
    reason: string;
    userQuestion: string;
    suggestion?: string;
};

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /\brm\s+(-[a-z]*r[a-z]*f|--force)\b/i, reason: 'Remocao recursiva forcada' },
    { pattern: /\brm\s+-[a-z]*f[a-z]*r\b/i, reason: 'Remocao recursiva forcada' },
    { pattern: /\bdel\s+\/[a-z]*f\b/i, reason: 'Exclusao forcada de arquivos' },
    { pattern: /\brmdir\s+\/s\b/i, reason: 'Remocao recursiva de diretorio' },
    { pattern: /\brd\s+\/s\b/i, reason: 'Remocao recursiva de diretorio' },
    { pattern: /\bformat\s+[a-z]:/i, reason: 'Formatacao de disco' },
    { pattern: /\bcipher\s+\/w/i, reason: 'Wipe de dados' },
    { pattern: /\bshutdown\b/i, reason: 'Desligamento do sistema' },
    { pattern: /\brestart\b.*\bcomputer\b/i, reason: 'Reinicializacao do sistema' },
    { pattern: /\bdiskpart\b/i, reason: 'Manipulacao de particoes' },
    { pattern: /\bbcdedit\b/i, reason: 'Alteracao de boot' },
    { pattern: /\bnet\s+user\b/i, reason: 'Manipulacao de usuarios' },
    { pattern: /\bnet\s+localgroup\b/i, reason: 'Manipulacao de grupos' },
    { pattern: /\breg\s+delete\b/i, reason: 'Exclusao de registro do Windows' },
    { pattern: /\btakeown\b/i, reason: 'Alteracao de ownership' },
    { pattern: /\bicacls\b.*\/grant/i, reason: 'Alteracao de permissoes' },
    { pattern: /\bpowershell\b.*-[eE]ncoded[cC]ommand/i, reason: 'Comando PowerShell ofuscado' },
    { pattern: /\bcertutil\b.*-decode/i, reason: 'Decodificacao de payload' },
    { pattern: /\bcertutil\b.*-urlcache/i, reason: 'Download via certutil' },
    { pattern: /:\(\)\s*\{\s*:\|:&\s*\};\s*:/i, reason: 'Fork bomb' },
    { pattern: /%0\|%0/i, reason: 'Fork bomb Windows' },
];

const SAFE_COMMANDS = new Set([
    'python', 'python3', 'node',
    'git', 'java', 'javac', 'dotnet', 'ruby', 'go', 'rustc', 'cargo',
    'gcc', 'g++', 'make', 'cmake', 'tsc', 'deno', 'bun',
    'echo', 'type', 'cat', 'head', 'tail', 'find', 'where', 'which',
    'dir', 'ls', 'pwd', 'tree', 'wc', 'sort', 'grep', 'findstr',
    'hostname', 'whoami', 'date', 'time', 'env', 'printenv',
    'systeminfo', 'ver', 'uname',
    'ping', 'nslookup', 'ipconfig', 'ifconfig',
]);

const SAFE_SUBCOMMANDS: Record<string, Set<string>> = {
    git: new Set(['status', 'log', 'diff', 'branch', 'show', 'remote', 'tag', 'stash list', 'rev-parse', 'config --list']),
    npm: new Set(['list', 'ls', 'outdated', 'view', 'info', 'search', 'config list', 'version', '--version']),
    pip: new Set(['list', 'show', 'freeze', 'check', '--version']),
    pip3: new Set(['list', 'show', 'freeze', 'check', '--version']),
    docker: new Set(['ps', 'images', 'info', 'version', 'stats', 'logs']),
    cargo: new Set(['check', 'test', 'bench', 'doc', '--version']),
};

const VERSION_OR_HELP_FLAGS = new Set(['--version', '--help', '-v', '-h', '/?']);
const SHELL_CONTROL_PATTERN = /[\r\n|&;<>]/;

function baseCommand(command: string): { base: string; flags: string[] } {
    const tokens = command.trim().split(/\s+/);
    let base = tokens[0]?.toLowerCase().replace(/\.exe$/, '') || '';
    if (base.includes('python') && (base.includes('/') || base.includes('\\'))) {
        base = 'python';
    }
    return { base, flags: tokens.slice(1).map(t => t.toLowerCase()) };
}

function policy(
    category: CommandCategory,
    risk: CommandRisk,
    reason: string,
    userQuestion = 'Executar verificacao tecnica no terminal?',
    suggestion?: string
): CommandPolicyResult {
    return {
        category,
        risk,
        reason,
        blocked: risk === 'blocked',
        requiresConfirmation: risk !== 'low' && risk !== 'blocked',
        userQuestion,
        suggestion
    };
}

export function classifyCommand(command: string): CommandPolicyResult {
    const trimmed = String(command || '').trim();
    const lower = trimmed.toLowerCase();

    if (!trimmed) {
        return policy('unknown', 'medium', 'Comando vazio', 'Executar comando tecnico no terminal?');
    }

    for (const { pattern, reason } of BLOCKED_PATTERNS) {
        if (pattern.test(trimmed)) {
            return policy('blocked', 'blocked', reason, `Comando bloqueado por seguranca: ${reason}.`, 'Use uma skill OS especifica ou uma alternativa menos destrutiva.');
        }
    }

    if (/\b(git\s+push|gh\s+release|npm\s+publish|pnpm\s+publish|yarn\s+npm\s+publish)\b/i.test(trimmed)) {
        return policy('external_effect', 'high', 'Comando envia alteracoes para servico externo.', 'Este comando envia alteracoes para fora da maquina. Posso continuar?');
    }

    if (/\b(taskkill|kill|stop-process)\b/i.test(trimmed)) {
        return policy('process_control', 'high', 'Comando controla ou encerra processos.', 'Vou executar uma acao tecnica que pode encerrar processos. Posso continuar?', 'Prefira os_sistema para listar ou encerrar processos.');
    }

    if (/\b(curl|wget|invoke-webrequest|iwr)\b/i.test(trimmed)) {
        return policy('network_download', 'medium', 'Comando acessa rede ou baixa conteudo.', 'Vou executar uma verificacao tecnica com acesso a rede. Posso continuar?');
    }

    const hasFileRedirection = /(^|[^0-9])>>?($|[^&])/.test(trimmed);
    if (hasFileRedirection || /\b(del|erase|move|copy|xcopy|robocopy|ren|rename|mkdir|md|rm|mv|cp|touch)\b/i.test(trimmed)) {
        return policy('filesystem_mutation', 'medium', 'Comando pode alterar arquivos ou pastas.', 'Este comando pode alterar arquivos ou pastas. Posso continuar?', 'Prefira os_mover, os_deletar, os_escrever ou os_listar para operacoes comuns de arquivo.');
    }

    if (/\b(npm|pnpm|yarn)\s+(install|add|remove|uninstall|update|run)\b/i.test(trimmed)
        || /\b(pip|pip3)\s+(install|uninstall)\b/i.test(trimmed)
        || /\b(cargo)\s+(build|run|install)\b/i.test(trimmed)) {
        return policy('dev_mutation', 'medium', 'Comando de desenvolvimento pode alterar dependencias, build ou estado local.', 'Vou executar um comando tecnico de desenvolvimento que pode alterar o projeto. Posso continuar?');
    }

    if (SHELL_CONTROL_PATTERN.test(trimmed)) {
        return policy('unknown', 'medium', 'Comando composto, pipeline ou redirecionamento exige confirmacao.', 'Vou executar uma verificacao tecnica composta no terminal. Posso continuar?');
    }

    const { base, flags } = baseCommand(trimmed);

    if (flags.some(flag => VERSION_OR_HELP_FLAGS.has(flag)) && SAFE_COMMANDS.has(base)) {
        return policy('read_only', 'low', 'Comando de versao/ajuda sem efeito colateral esperado.');
    }

    const subCmds = SAFE_SUBCOMMANDS[base];
    if (subCmds) {
        const sub = flags.join(' ');
        if (subCmds.has(sub) || subCmds.has(flags[0] || '')) {
            return policy('dev_read_only', 'low', 'Comando tecnico de leitura.');
        }
    }

    const readOnlyBases = new Set([
        'echo', 'type', 'cat', 'head', 'tail', 'find', 'where', 'which',
        'dir', 'ls', 'pwd', 'tree', 'wc', 'sort', 'grep', 'findstr',
        'hostname', 'whoami', 'date', 'time', 'ver', 'uname',
        'systeminfo', 'ipconfig', 'ifconfig', 'ping', 'nslookup',
    ]);
    if (readOnlyBases.has(base)) {
        return policy('read_only', 'low', 'Comando de leitura sem efeito colateral esperado.');
    }

    return policy('unknown', 'medium', 'Comando nao classificado como leitura segura.', 'Vou executar um comando tecnico no terminal. Posso continuar?');
}

export function isReadOnlyCommand(command: string): boolean {
    const result = classifyCommand(command);
    return !result.blocked && !result.requiresConfirmation;
}
