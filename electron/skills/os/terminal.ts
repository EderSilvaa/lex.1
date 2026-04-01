/**
 * Skill: terminal_executar
 *
 * Executa comandos no terminal PTY com streaming de saída em tempo real.
 * Usado pelo agente para rodar Python, pip, git, scripts, etc.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getPtyManager } from '../../terminal';
import { getPythonEnv } from '../../python';

/**
 * Comandos seguros que não modificam nada — executam sem confirmação.
 * Padrão: se o primeiro token do comando (antes de espaços/pipes/&&) está aqui, é seguro.
 */
const SAFE_COMMANDS = new Set([
    // Versões e info
    'python', 'python3', 'node', 'npm', 'npx', 'pip', 'pip3',
    'git', 'java', 'javac', 'dotnet', 'ruby', 'go', 'rustc', 'cargo',
    'gcc', 'g++', 'make', 'cmake', 'tsc', 'deno', 'bun',
    // Sistema (leitura)
    'echo', 'type', 'cat', 'head', 'tail', 'find', 'where', 'which',
    'dir', 'ls', 'pwd', 'cd', 'tree', 'wc', 'sort', 'grep', 'findstr',
    'hostname', 'whoami', 'date', 'time', 'set', 'env', 'printenv',
    'systeminfo', 'ver', 'uname',
    // Rede (leitura)
    'ping', 'nslookup', 'ipconfig', 'ifconfig', 'curl', 'wget',
]);

/**
 * Subcomandos seguros para ferramentas comuns.
 * Ex: "git status" é seguro, "git push" não.
 */
const SAFE_SUBCOMMANDS: Record<string, Set<string>> = {
    git: new Set(['status', 'log', 'diff', 'branch', 'show', 'remote', 'tag', 'stash list', 'rev-parse', 'config --list']),
    npm: new Set(['list', 'ls', 'outdated', 'view', 'info', 'search', 'config list', 'version', '--version']),
    pip: new Set(['list', 'show', 'freeze', 'check', '--version']),
    pip3: new Set(['list', 'show', 'freeze', 'check', '--version']),
    docker: new Set(['ps', 'images', 'info', 'version', 'stats', 'logs']),
    cargo: new Set(['check', 'test', 'bench', 'doc', '--version']),
};

/**
 * Verifica se um comando é seguro (somente leitura) e pode rodar sem confirmação.
 */
function isReadOnlyCommand(command: string): boolean {
    // Pega o primeiro token do comando (antes de pipes, &&, ;)
    const firstPart = command.split(/[|&;]/)[0]!.trim();
    const tokens = firstPart.split(/\s+/);
    let base = tokens[0]?.toLowerCase().replace(/\.exe$/, '') || '';

    // Se o comando usa um path absoluto para python (embedded ou sistema),
    // normaliza para "python" para reutilizar as mesmas regras
    if (base.includes('python') && (base.includes('/') || base.includes('\\'))) {
        base = 'python';
    }

    // Qualquer comando com --version ou --help é seguro
    if (command.includes('--version') || command.includes('--help') || command.includes('-v') || command.includes('-h')) {
        if (SAFE_COMMANDS.has(base)) return true;
    }

    // Checa subcomandos seguros (ex: "git status")
    const subCmds = SAFE_SUBCOMMANDS[base];
    if (subCmds) {
        const sub = tokens[1]?.toLowerCase() || '';
        return subCmds.has(sub);
    }

    // Comandos puros de leitura (echo, dir, ls, whoami, etc.)
    const readOnlyBases = new Set([
        'echo', 'type', 'cat', 'head', 'tail', 'find', 'where', 'which',
        'dir', 'ls', 'pwd', 'tree', 'wc', 'sort', 'grep', 'findstr',
        'hostname', 'whoami', 'date', 'time', 'ver', 'uname',
        'systeminfo', 'ipconfig', 'ifconfig', 'ping', 'nslookup',
    ]);

    return readOnlyBases.has(base);
}

export const osTerminal: Skill = {
    nome: 'terminal_executar',
    descricao: 'Executa comando no terminal com saída em tempo real. Comandos de leitura (--version, git status, dir, pip list, etc) executam direto sem confirmação. Comandos que modificam algo (install, delete, push) pedem confirmação.',
    categoria: 'os',

    parametros: {
        comando: {
            tipo: 'string',
            descricao: 'Comando a executar no terminal',
            obrigatorio: true,
        },
        diretorio: {
            tipo: 'string',
            descricao: 'Diretório de trabalho (default: home do usuário)',
            obrigatorio: false,
            default: '',
        },
        timeoutMs: {
            tipo: 'number',
            descricao: 'Timeout em milissegundos (default: 30000, max: 120000)',
            obrigatorio: false,
            default: 30000,
        },
        confirmado: {
            tipo: 'boolean',
            descricao: 'TRUE somente se o usuário confirmou explicitamente a execução.',
            obrigatorio: false,
            default: false,
        },
    },

    retorno: 'stdout do comando, exitCode, e indicação de timeout.',

    exemplos: [
        '{ "skill": "terminal_executar", "parametros": { "comando": "python --version" } }',
        '{ "skill": "terminal_executar", "parametros": { "comando": "git status", "diretorio": "C:\\\\Users\\\\user\\\\projeto" } }',
        '{ "skill": "terminal_executar", "parametros": { "comando": "pip install pandas", "confirmado": true } }',
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const comando = String(params['comando'] || '').trim();
        const diretorio = String(params['diretorio'] || '').trim() || undefined;
        const timeoutMs = Math.min(Number(params['timeoutMs']) || 30_000, 120_000);
        const confirmado = Boolean(params['confirmado']);

        if (!comando) {
            return {
                sucesso: false,
                erro: 'Parâmetro "comando" é obrigatório.',
                mensagem: 'Informe o comando a executar.',
            };
        }

        // Comandos de leitura executam direto, sem confirmação
        // Comandos que modificam algo pedem confirmação via botão no chat
        if (!confirmado && !isReadOnlyCommand(comando)) {
            return {
                sucesso: false,
                dados: {
                    requiresUserAction: true,
                    question: `Executar no terminal?\n\n\`\`\`\n${comando}\n\`\`\`${diretorio ? `\nDiretório: ${diretorio}` : ''}`,
                },
                mensagem: `Aguardando confirmação para executar: ${comando}`,
            };
        }

        // Resolve python/pip para usar o Python embedded quando disponível
        let comandoFinal = comando;
        try {
            const pyEnv = getPythonEnv();
            if (pyEnv.isReady()) {
                const pyPath = pyEnv.getPythonPath()!;
                // Substitui "python" ou "python3" no início do comando pelo path embedded
                comandoFinal = comandoFinal.replace(
                    /^(python3?|pip3?)\b/i,
                    (match) => {
                        if (match.toLowerCase().startsWith('pip')) {
                            return `"${pyPath}" -m pip`;
                        }
                        return `"${pyPath}"`;
                    }
                );
            }
        } catch { /* Python module não disponível, usa comando original */ }

        // Executa via PtyManager
        try {
            const result = await getPtyManager().runCommand(comandoFinal, diretorio, timeoutMs);

            // Limpa escape sequences do PTY para a mensagem
            const cleanOutput = result.stdout
                .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')   // CSI sequences (inclui ? como em [?25l)
                .replace(/\x1b\][^\x07]*\x07/g, '')         // OSC sequences (títulos de janela)
                .replace(/\x1b[()][A-Z0-9]/g, '')           // Character set sequences
                .replace(/\x1b[>=<]/g, '')                   // Modo alternativo
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '')
                .replace(/\n{3,}/g, '\n\n')                  // Compacta linhas vazias
                .trim();

            const truncatedOutput = cleanOutput.length > 4000
                ? cleanOutput.slice(0, 4000) + '\n... [saída truncada]'
                : cleanOutput;

            if (result.exitCode !== 0 && !result.killed) {
                return {
                    sucesso: false,
                    dados: { stdout: cleanOutput, exitCode: result.exitCode, killed: result.killed },
                    erro: `Comando retornou código ${result.exitCode}`,
                    mensagem: `Comando: ${comando}\nCódigo de saída: ${result.exitCode}\n\n${truncatedOutput}`,
                };
            }

            return {
                sucesso: !result.killed,
                dados: { stdout: cleanOutput, exitCode: result.exitCode, killed: result.killed },
                mensagem: result.killed
                    ? `Comando: ${comando}\n[TIMEOUT após ${timeoutMs / 1000}s]\n\n${truncatedOutput}`
                    : `Comando: ${comando}\n\n${truncatedOutput || '(sem saída)'}`,
            };
        } catch (err: any) {
            return {
                sucesso: false,
                erro: err.message,
                mensagem: `Erro ao executar comando: ${err.message}`,
            };
        }
    },
};

export default osTerminal;
