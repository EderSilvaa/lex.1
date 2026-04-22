/**
 * Skill: terminal_executar
 *
 * Executa comandos no terminal PTY com streaming de saída em tempo real.
 * Usado pelo agente para rodar Python, pip, git, scripts, etc.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getPtyManager } from '../../terminal';
import { getPythonEnv } from '../../python';
import { resolverEntradaOs } from '../../tools/os-tools';
import { classifyCommand } from '../../terminal/command-policy';
import * as fs from 'fs/promises';

type TerminalExecData = {
    stdout: string;
    stdoutResumo: string;
    exitCode: number | null;
    killed: boolean;
    diretorio?: string;
    fuzzyDiretorio?: boolean;
    category: string;
    risk: string;
    reason: string;
    command: string;
};

function boolParam(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'sim', 's', 'yes', 'y'].includes(normalized)) return true;
        if (['false', '0', 'nao', 'não', 'n', 'no', ''].includes(normalized)) return false;
    }
    return Boolean(value);
}

async function resolverDiretorioTerminal(rawDir?: string): Promise<{ ok: true; diretorio?: string; fuzzy?: boolean } | { ok: false; result: SkillResult }> {
    const raw = String(rawDir || '').trim();
    if (!raw) return { ok: true };

    const resolucao = await resolverEntradaOs(raw, { mustExist: true });
    if (!resolucao.sucesso) {
        return {
            ok: false,
            result: {
                sucesso: false,
                codigo: resolucao.codigo,
                erro: resolucao.erro || `Diretorio "${raw}" nao encontrado.`,
                sugestao: resolucao.sugestao || 'Informe uma pasta existente ou use aliases como downloads, desktop, documentos ou ~.',
                mensagem: resolucao.erro || `Diretorio "${raw}" nao encontrado.`
            }
        };
    }

    const resolved = resolucao.dados.caminho;
    try {
        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) {
            return {
                ok: false,
                result: {
                    sucesso: false,
                    codigo: 'operacao_invalida',
                    erro: `Diretorio de trabalho "${resolved}" nao e uma pasta.`,
                    sugestao: 'Informe uma pasta como diretorio de trabalho.',
                    mensagem: `Diretorio de trabalho "${resolved}" nao e uma pasta.`
                }
            };
        }
    } catch (error: any) {
        return {
            ok: false,
            result: {
                sucesso: false,
                codigo: 'erro_io',
                erro: `Erro ao validar diretorio "${raw}": ${error.message}`,
                sugestao: 'Informe uma pasta existente e acessivel.',
                mensagem: `Erro ao validar diretorio "${raw}": ${error.message}`
            }
        };
    }

    return { ok: true, diretorio: resolved, fuzzy: Boolean(resolucao.dados.fuzzy) };
}

function montarPerguntaConfirmacao(policy: ReturnType<typeof classifyCommand>, diretorio?: string): string {
    const partes = [policy.userQuestion.trim()];
    if (policy.suggestion) partes.push(policy.suggestion.trim());
    if (diretorio) partes.push(`Pasta de trabalho: ${diretorio}`);
    return partes.join('\n');
}

function resumirSaidaTerminal(output: string): string {
    const trimmed = output.trim();
    if (!trimmed) return '(sem saida)';

    const lines = trimmed.split('\n').map(line => line.trimEnd());
    const maxLines = 12;
    const maxChars = 1600;

    if (lines.length <= maxLines && trimmed.length <= maxChars) return trimmed;

    const headCount = 6;
    const tailCount = 4;
    const head = lines.slice(0, headCount);
    const tail = lines.slice(Math.max(headCount, lines.length - tailCount));
    const omitted = Math.max(0, lines.length - head.length - tail.length);
    const summaryLines = [
        ...head,
        omitted > 0 ? `... (${omitted} linhas omitidas; saida completa em dados.stdout)` : '...',
        ...tail
    ];

    let summary = summaryLines.join('\n');
    if (summary.length > maxChars) {
        summary = `${summary.slice(0, maxChars - 58).trimEnd()}\n... (saida resumida; completa em dados.stdout)`;
    }
    return summary;
}

function montarDadosExecucao(params: {
    stdout: string;
    stdoutResumo: string;
    exitCode: number | null;
    killed: boolean;
    diretorio?: string;
    fuzzyDiretorio?: boolean;
    policy: ReturnType<typeof classifyCommand>;
    command: string;
}): TerminalExecData {
    return {
        stdout: params.stdout,
        stdoutResumo: params.stdoutResumo,
        exitCode: params.exitCode,
        killed: params.killed,
        diretorio: params.diretorio,
        fuzzyDiretorio: params.fuzzyDiretorio,
        category: params.policy.category,
        risk: params.policy.risk,
        reason: params.policy.reason,
        command: params.command
    };
}

export const osTerminal: Skill = {
    nome: 'terminal_executar',
    descricao: 'Uso restrito para diagnostico tecnico, comandos de desenvolvimento e ferramentas internas. NAO use para listar/buscar/deletar/mover arquivos, organizar pastas, abrir arquivos ou encerrar processos quando existir skill OS especifica. Comandos de leitura tecnica executam direto; comandos mutantes ou compostos pedem confirmacao.',
    categoria: 'os',

    parametros: {
        comando: {
            tipo: 'string',
            descricao: 'Comando a executar no terminal',
            obrigatorio: true,
        },
        diretorio: {
            tipo: 'string',
            descricao: 'Diretorio de trabalho. Aceita aliases OS: downloads, desktop, documentos, ~. Default: home do usuario.',
            obrigatorio: false,
            default: '',
        },
        cwd: {
            tipo: 'string',
            descricao: 'Alias de diretorio/cwd para compatibilidade com comandos tecnicos.',
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
        const diretorioRaw = String(params['diretorio'] ?? params['cwd'] ?? '').trim() || undefined;
        const timeoutMs = Math.min(Number(params['timeoutMs']) || 30_000, 120_000);
        const confirmado = boolParam(params['confirmado']);

        if (!comando) {
            return {
                sucesso: false,
                erro: 'Parâmetro "comando" é obrigatório.',
                mensagem: 'Informe o comando a executar.',
            };
        }

        const diretorioResolvido = await resolverDiretorioTerminal(diretorioRaw);
        if (!diretorioResolvido.ok) return diretorioResolvido.result;
        const diretorio = diretorioResolvido.diretorio || process.cwd();
        const policy = classifyCommand(comando);

        if (policy.blocked) {
            return {
                sucesso: false,
                codigo: 'comando_bloqueado',
                erro: `Comando bloqueado por seguranca: ${policy.reason}.`,
                sugestao: policy.suggestion,
                dados: {
                    command: comando,
                    category: policy.category,
                    risk: policy.risk,
                    reason: policy.reason,
                    diretorio
                },
                mensagem: `Bloqueei este comando por seguranca: ${policy.reason}.`
            };
        }

        // Comandos de leitura executam direto, sem confirmação
        // Comandos que modificam algo pedem confirmação via botão no chat
        if (!confirmado && policy.requiresConfirmation) {
            return {
                sucesso: false,
                dados: {
                    requiresUserAction: true,
                    question: montarPerguntaConfirmacao(policy, diretorio),
                    command: comando,
                    diretorio,
                    category: policy.category,
                    risk: policy.risk,
                    reason: policy.reason,
                    suggestion: policy.suggestion,
                },
                mensagem: 'Aguardando confirmacao para executar uma acao tecnica no terminal.',
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

            const stdoutResumo = resumirSaidaTerminal(cleanOutput);
            const dadosExecucao = montarDadosExecucao({
                stdout: cleanOutput,
                stdoutResumo,
                exitCode: result.exitCode,
                killed: result.killed,
                diretorio,
                fuzzyDiretorio: diretorioResolvido.fuzzy,
                policy,
                command: comando
            });

            if (result.exitCode !== 0 && !result.killed) {
                return {
                    sucesso: false,
                    dados: dadosExecucao,
                    erro: `Comando retornou código ${result.exitCode}`,
                    mensagem: `Verificacao tecnica falhou (codigo ${result.exitCode}).\n\n${stdoutResumo}`,
                };
            }

            return {
                sucesso: !result.killed,
                dados: dadosExecucao,
                mensagem: result.killed
                    ? `Verificacao tecnica interrompida por timeout (${timeoutMs / 1000}s).\n\n${stdoutResumo}`
                    : `Verificacao tecnica concluida.\n\n${stdoutResumo}`,
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
