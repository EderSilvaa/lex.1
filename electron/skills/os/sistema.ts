/**
 * Skill: os_sistema
 *
 * Informações do SO e execução de comandos shell com confirmação do usuário.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { infoSistema, executarComando, abrirComSistema, pastasConhecidas, listarProcessos, encerrarProcesso } from '../../tools/os-tools';

// ── Confirmação de ações perigosas (sem dependência do Electron) ──
// Usa callback injetável: o main.ts pode setar via setConfirmDialog()
// para usar dialog nativo; o backend pode usar outro mecanismo.
let _confirmFn: ((titulo: string, detalhe: string) => Promise<boolean>) | null = null;

/** Permite injetar a função de confirmação (dialog nativo ou RPC) */
export function setConfirmDialog(fn: (titulo: string, detalhe: string) => Promise<boolean>): void {
    _confirmFn = fn;
}

async function confirmarComDialog(titulo: string, detalhe: string): Promise<boolean> {
    if (_confirmFn) return _confirmFn(titulo, detalhe);
    // Fallback sem dialog: confia no fluxo requiresUserAction (confirmado:true)
    return true;
}

export const osSistema: Skill = {
    nome: 'os_sistema',
    descricao: 'Informações do SO, pastas conhecidas, abrir programas/arquivos, executar comandos shell, listar processos em execução, encerrar processo. Confirmação exigida antes de executar comandos ou encerrar processos.',
    categoria: 'os',

    parametros: {
        operacao: {
            tipo: 'string',
            descricao: 'Operação a executar',
            obrigatorio: true,
            enum: ['info', 'pastas', 'abrir', 'comando', 'processos', 'encerrar']
        },
        alvo: {
            tipo: 'string',
            descricao: 'Caminho/URL a abrir (para "abrir") ou comando shell (para "comando")',
            obrigatorio: false,
            default: ''
        },
        diretorio: {
            tipo: 'string',
            descricao: 'Diretório de trabalho para o comando (para "comando")',
            obrigatorio: false,
            default: ''
        },
        confirmado: {
            tipo: 'boolean',
            descricao: 'TRUE somente se o usuário confirmou explicitamente a execução do comando. Para "info" e "pastas" não é necessário.',
            obrigatorio: false,
            default: false
        }
    },

    retorno: 'Resultado da operação de sistema.',

    exemplos: [
        '{ "skill": "os_sistema", "parametros": { "operacao": "info" } }',
        '{ "skill": "os_sistema", "parametros": { "operacao": "pastas" } }',
        '{ "skill": "os_sistema", "parametros": { "operacao": "abrir", "alvo": "C:\\\\Documents\\\\relatorio.pdf" } }',
        '{ "skill": "os_sistema", "parametros": { "operacao": "comando", "alvo": "dir C:\\\\Downloads", "confirmado": true } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const operacao = String(params['operacao'] || '').trim();
        const alvo = String(params['alvo'] || '').trim();
        const diretorio = String(params['diretorio'] || '').trim();
        const confirmado = Boolean(params['confirmado']);

        switch (operacao) {
            case 'info': {
                const resultado = infoSistema();
                const d = resultado.dados!;
                return {
                    sucesso: true,
                    dados: d,
                    mensagem: `💻 Sistema\nOS: Windows ${d.versao}\nUsuário: ${d.usuario}\nHome: ${d.homeDir}\nCPUs: ${d.cpus}\nMemória: ${formatBytes(d.memoriaLivre)} livres de ${formatBytes(d.memoriaTotal)}`
                };
            }

            case 'pastas': {
                const resultado = pastasConhecidas();
                const d = resultado.dados!;
                return {
                    sucesso: true,
                    dados: d,
                    mensagem: `📁 Pastas do sistema:\n` +
                        Object.entries(d).map(([k, v]) => `  ${k}: ${v}`).join('\n')
                };
            }

            case 'abrir': {
                if (!alvo) return { sucesso: false, erro: 'Parâmetro "alvo" obrigatório.', mensagem: 'Informe o que abrir.' };
                const resultado = await abrirComSistema(alvo);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
                return { sucesso: true, dados: resultado.dados, mensagem: `✅ Aberto: ${alvo}` };
            }

            case 'comando': {
                if (!alvo) return { sucesso: false, erro: 'Parâmetro "alvo" (comando) obrigatório.', mensagem: 'Informe o comando.' };

                // Primeira passagem: LLM ainda não pediu confirmação ao usuário
                if (!confirmado) {
                    return {
                        sucesso: false,
                        dados: {
                            requiresUserAction: true,
                            question: `Posso executar o seguinte comando no terminal?\n\n\`\`\`\n${alvo}\n\`\`\`\n\nResponda "sim, execute" para confirmar ou "não" para cancelar.`
                        },
                        mensagem: `Aguardando confirmação para executar: ${alvo}`
                    };
                }

                // Segunda passagem: mesmo com confirmado:true, exige aprovação via dialog nativo
                const aprovado = await confirmarComDialog(
                    'Executar comando shell?',
                    alvo
                );
                if (!aprovado) {
                    return { sucesso: false, erro: 'Cancelado pelo usuário.', mensagem: 'Execução cancelada.' };
                }

                const resultado = await executarComando(alvo, diretorio || undefined);
                if (!resultado.sucesso) {
                    return {
                        sucesso: false,
                        erro: resultado.erro,
                        dados: resultado.dados,
                        mensagem: `❌ Erro ao executar: ${resultado.erro}\n${resultado.dados?.stderr || ''}`
                    };
                }

                const { stdout, stderr } = resultado.dados!;
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `✅ Comando executado: ${alvo}\n\n${stdout || '(sem saída)'}${stderr ? `\n\nStderr:\n${stderr}` : ''}`
                };
            }

            case 'processos': {
                const resultado = await listarProcessos(alvo || undefined);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
                const { processos, total, filtro } = resultado.dados;
                const lista = processos.slice(0, 50).map((p: any) =>
                    `  PID ${p.pid.toString().padStart(6)} | ${p.nome.padEnd(30)} | ${p.memoria}`
                ).join('\n');
                const header = filtro ? `Processos "${filtro}"` : 'Processos em execução';
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `💻 ${header}: ${total} processo(s)\n\n${lista}${total > 50 ? `\n... e mais ${total - 50}` : ''}`
                };
            }

            case 'encerrar': {
                if (!alvo) return { sucesso: false, erro: 'Parâmetro "alvo" (PID ou nome do processo) obrigatório.', mensagem: 'Informe o PID ou nome do processo.' };

                if (!confirmado) {
                    return {
                        sucesso: false,
                        dados: {
                            requiresUserAction: true,
                            question: `Posso encerrar o processo **${alvo}**?\n\nResponda "sim, encerre" para confirmar ou "não" para cancelar.`
                        },
                        mensagem: `Aguardando confirmação para encerrar: ${alvo}`
                    };
                }

                // Dialog nativo garante confirmação mesmo se LLM mandou confirmado:true diretamente
                const aprovado = await confirmarComDialog(
                    'Encerrar processo?',
                    `Processo: ${alvo}`
                );
                if (!aprovado) {
                    return { sucesso: false, erro: 'Cancelado pelo usuário.', mensagem: 'Operação cancelada.' };
                }

                const alvoParsed = /^\d+$/.test(alvo) ? Number(alvo) : alvo;
                const resultado = await encerrarProcesso(alvoParsed);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `✅ Processo "${alvo}" encerrado.${resultado.dados.stdout ? `\n${resultado.dados.stdout}` : ''}`
                };
            }

            default:
                return {
                    sucesso: false,
                    erro: `Operação desconhecida: "${operacao}". Use: info, pastas, abrir, comando, processos, encerrar`,
                    mensagem: 'Operação inválida.'
                };
        }
    }
};

function formatBytes(bytes: number): string {
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

export default osSistema;
