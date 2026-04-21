/**
 * Skill: os_sistema
 *
 * Informacoes do sistema, pastas conhecidas, abrir arquivo/URL e processos.
 * Shell/comandos ficam exclusivamente em terminal_executar.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { infoSistema, abrirComSistema, pastasConhecidas, listarProcessos, encerrarProcesso } from '../../tools/os-tools';

let _confirmFn: ((titulo: string, detalhe: string) => Promise<boolean>) | null = null;

export function setConfirmDialog(fn: (titulo: string, detalhe: string) => Promise<boolean>): void {
    _confirmFn = fn;
}

async function confirmarComDialog(titulo: string, detalhe: string): Promise<boolean> {
    if (_confirmFn) return _confirmFn(titulo, detalhe);
    return true;
}

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

export const osSistema: Skill = {
    nome: 'os_sistema',
    descricao: 'Informacoes do SO, pastas conhecidas, abrir arquivo/URL/programa, listar processos e encerrar processo com confirmacao. NAO executa shell/comandos; para isso use terminal_executar.',
    categoria: 'os',

    parametros: {
        operacao: {
            tipo: 'string',
            descricao: 'Operacao a executar.',
            obrigatorio: false,
            enum: ['info', 'pastas', 'abrir', 'processos', 'encerrar']
        },
        acao: {
            tipo: 'string',
            descricao: 'Alias legado para operacao. Aceita listar_processos, encerrar_processo, abrir, info e pastas.',
            obrigatorio: false
        },
        alvo: {
            tipo: 'string',
            descricao: 'Caminho/URL a abrir, filtro de processo, PID ou nome do processo.',
            obrigatorio: false,
            default: ''
        },
        diretorio: {
            tipo: 'string',
            descricao: 'Legado. Ignorado; comandos shell devem usar terminal_executar.',
            obrigatorio: false,
            default: ''
        },
        confirmado: {
            tipo: 'boolean',
            descricao: 'TRUE somente se o usuario confirmou explicitamente encerrar processo.',
            obrigatorio: false,
            default: false
        }
    },

    retorno: 'Resultado da operacao de sistema.',

    exemplos: [
        '{ "skill": "os_sistema", "parametros": { "operacao": "info" } }',
        '{ "skill": "os_sistema", "parametros": { "operacao": "pastas" } }',
        '{ "skill": "os_sistema", "parametros": { "operacao": "abrir", "alvo": "C:\\\\Documents\\\\relatorio.pdf" } }',
        '{ "skill": "os_sistema", "parametros": { "operacao": "processos", "alvo": "node.exe" } }',
        '{ "skill": "os_sistema", "parametros": { "acao": "listar_processos" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const operacao = normalizarOperacao(params);
        const alvo = String(params['alvo'] || '').trim();
        const confirmado = boolParam(params['confirmado']);

        switch (operacao) {
            case 'info': {
                const resultado = infoSistema();
                const d = resultado.dados!;
                return {
                    sucesso: true,
                    dados: d,
                    mensagem: `Sistema\nOS: Windows ${d.versao}\nUsuario: ${d.usuario}\nHome: ${d.homeDir}\nCPUs: ${d.cpus}\nMemoria: ${formatBytes(d.memoriaLivre)} livres de ${formatBytes(d.memoriaTotal)}`
                };
            }

            case 'pastas': {
                const resultado = pastasConhecidas();
                const d = resultado.dados!;
                return {
                    sucesso: true,
                    dados: d,
                    mensagem: `Pastas do sistema:\n` +
                        Object.entries(d).map(([k, v]) => `  ${k}: ${v}`).join('\n')
                };
            }

            case 'abrir': {
                if (!alvo) return { sucesso: false, erro: 'Parametro "alvo" obrigatorio.', mensagem: 'Informe o que abrir.' };
                const resultado = await abrirComSistema(alvo);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
                return { sucesso: true, dados: resultado.dados, mensagem: `Aberto: ${alvo}` };
            }

            case 'processos': {
                const resultado = await listarProcessos(alvo || undefined);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
                const { processos, total, filtro } = resultado.dados;
                const lista = processos.slice(0, 50).map((p: any) =>
                    `  PID ${p.pid.toString().padStart(6)} | ${p.nome.padEnd(30)} | ${p.memoria}`
                ).join('\n');
                const header = filtro ? `Processos "${filtro}"` : 'Processos em execucao';
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `${header}: ${total} processo(s)\n\n${lista}${total > 50 ? `\n... e mais ${total - 50}` : ''}`
                };
            }

            case 'encerrar': {
                if (!alvo) return { sucesso: false, erro: 'Parametro "alvo" (PID ou nome do processo) obrigatorio.', mensagem: 'Informe o PID ou nome do processo.' };

                if (!confirmado) {
                    return {
                        sucesso: false,
                        dados: {
                            requiresUserAction: true,
                            question: `Posso encerrar o processo ${alvo}?\n\nResponda "sim, encerre" para confirmar ou "nao" para cancelar.`
                        },
                        mensagem: `Aguardando confirmacao para encerrar: ${alvo}`
                    };
                }

                const aprovado = await confirmarComDialog(
                    'Encerrar processo?',
                    `Processo: ${alvo}`
                );
                if (!aprovado) {
                    return { sucesso: false, erro: 'Cancelado pelo usuario.', mensagem: 'Operacao cancelada.' };
                }

                const alvoParsed = /^\d+$/.test(alvo) ? Number(alvo) : alvo;
                const resultado = await encerrarProcesso(alvoParsed);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `Processo "${alvo}" encerrado.${resultado.dados.stdout ? `\n${resultado.dados.stdout}` : ''}`
                };
            }

            default:
                return {
                    sucesso: false,
                    erro: `Operacao desconhecida: "${operacao}". Use: info, pastas, abrir, processos, encerrar. Para shell use terminal_executar.`,
                    mensagem: 'Operacao invalida.'
                };
        }
    }
};

function normalizarOperacao(params: Record<string, any>): string {
    const raw = String(params['operacao'] || params['acao'] || params['modo'] || '').trim().toLowerCase();
    const aliases: Record<string, string> = {
        listar_processos: 'processos',
        lista_processos: 'processos',
        listar_processo: 'processos',
        processos_abertos: 'processos',
        processo: 'processos',
        abrir_arquivo: 'abrir',
        abrir_pasta: 'abrir',
        encerrar_processo: 'encerrar',
        matar_processo: 'encerrar',
        kill: 'encerrar',
        system_info: 'info',
        pastas_conhecidas: 'pastas'
    };
    return aliases[raw] || raw;
}

function formatBytes(bytes: number): string {
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

export default osSistema;
