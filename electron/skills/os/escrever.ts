/**
 * Skill: os_escrever
 *
 * Cria arquivo de texto ou pasta. Sobrescrever arquivo existente exige
 * confirmacao explicita do usuario.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { escreverArquivo, criarPasta, infoItem } from '../../tools/os-tools';

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

export const osEscrever: Skill = {
    nome: 'os_escrever',
    descricao: 'Cria ARQUIVO de texto ou pasta. Se o arquivo ja existir, a skill pede confirmacao antes de sobrescrever. Para mover/copiar/deletar use os_mover/os_deletar.',
    categoria: 'os',

    parametros: {
        operacao: {
            tipo: 'string',
            descricao: 'Operacao: "arquivo" para criar/sobrescrever arquivo, "pasta" para criar pasta.',
            obrigatorio: true,
            enum: ['arquivo', 'pasta']
        },
        caminho: {
            tipo: 'string',
            descricao: 'Caminho completo do arquivo ou pasta a criar.',
            obrigatorio: true
        },
        conteudo: {
            tipo: 'string',
            descricao: 'Conteudo do arquivo (para operacao "arquivo").',
            obrigatorio: false,
            default: ''
        },
        confirmado: {
            tipo: 'boolean',
            descricao: 'TRUE somente depois que o usuario confirmou sobrescrever um arquivo existente.',
            obrigatorio: false,
            default: false
        }
    },

    retorno: 'Resultado da criacao com caminho resolvido.',

    exemplos: [
        '{ "skill": "os_escrever", "parametros": { "operacao": "arquivo", "caminho": "C:\\\\Documents\\\\resumo.txt", "conteudo": "Texto do resumo..." } }',
        '{ "skill": "os_escrever", "parametros": { "operacao": "arquivo", "caminho": "C:\\\\Documents\\\\resumo.txt", "conteudo": "Texto novo", "confirmado": true } }',
        '{ "skill": "os_escrever", "parametros": { "operacao": "pasta", "caminho": "C:\\\\Documents\\\\Projetos\\\\LEX" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const operacao = String(params['operacao'] || '').trim();
        const caminho = String(params['caminho'] || '').trim();
        const conteudo = String(params['conteudo'] || '');
        const confirmado = boolParam(params['confirmado']);

        if (!caminho) {
            return { sucesso: false, erro: 'Parametro "caminho" obrigatorio.', mensagem: 'Informe o caminho.' };
        }

        if (operacao === 'pasta') {
            const resultado = await criarPasta(caminho);
            if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
            return { sucesso: true, dados: resultado.dados, mensagem: `Pasta criada: ${resultado.dados.caminho}` };
        }

        if (operacao === 'arquivo') {
            const info = await infoItem(caminho);
            if (info.sucesso && info.dados?.existe && !confirmado) {
                return {
                    sucesso: false,
                    dados: {
                        requiresUserAction: true,
                        question: `O arquivo ja existe e sera sobrescrito:\n${info.dados.caminho}\n\nConfirma? Responda "sim" para confirmar ou "nao" para cancelar.`
                    },
                    mensagem: `Aguardando confirmacao para sobrescrever: ${info.dados.caminho}`
                };
            }

            const resultado = await escreverArquivo(caminho, conteudo);
            if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
            return {
                sucesso: true,
                dados: resultado.dados,
                mensagem: `Arquivo salvo: ${resultado.dados.caminho} (${resultado.dados.bytesEscritos} bytes)`
            };
        }

        return { sucesso: false, erro: `Operacao invalida: "${operacao}". Use: arquivo, pasta`, mensagem: 'Operacao invalida.' };
    }
};

export default osEscrever;
