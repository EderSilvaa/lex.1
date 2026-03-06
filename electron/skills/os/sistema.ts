/**
 * Skill: os_sistema
 *
 * Informações do SO e execução de comandos shell com confirmação do usuário.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { infoSistema, executarComando, abrirComSistema, pastasConhecidas } from '../../tools/os-tools';

export const osSistema: Skill = {
    nome: 'os_sistema',
    descricao: 'Informações do sistema operacional, pastas conhecidas, abrir programas/arquivos, executar comandos shell. SEMPRE exige confirmação do usuário antes de executar comandos.',
    categoria: 'os',

    parametros: {
        operacao: {
            tipo: 'string',
            descricao: 'Operação a executar',
            obrigatorio: true,
            enum: ['info', 'pastas', 'abrir', 'comando']
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

                // Segurança: exige confirmação explícita do usuário
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

            default:
                return {
                    sucesso: false,
                    erro: `Operação desconhecida: "${operacao}". Use: info, pastas, abrir, comando`,
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
