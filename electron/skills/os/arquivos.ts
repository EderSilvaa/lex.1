/**
 * Skill: os_arquivos
 *
 * Operações de arquivo: ler, escrever, mover, copiar, deletar, buscar, info.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import {
    lerArquivo,
    escreverArquivo,
    moverItem,
    copiarArquivo,
    deletarArquivo,
    infoItem,
    buscarArquivos
} from '../../tools/os-tools';

export const osArquivos: Skill = {
    nome: 'os_arquivos',
    descricao: 'Operações em arquivos e pastas: ler conteúdo, mover, copiar, renomear, deletar, buscar por nome, verificar existência.',
    categoria: 'os',

    parametros: {
        operacao: {
            tipo: 'string',
            descricao: 'Operação a executar',
            obrigatorio: true,
            enum: ['ler', 'mover', 'copiar', 'deletar', 'buscar', 'info']
        },
        caminho: {
            tipo: 'string',
            descricao: 'Caminho do arquivo ou pasta origem',
            obrigatorio: true
        },
        destino: {
            tipo: 'string',
            descricao: 'Caminho destino (para mover/copiar)',
            obrigatorio: false,
            default: ''
        },
        padrao: {
            tipo: 'string',
            descricao: 'Padrão de nome para busca (para operação "buscar")',
            obrigatorio: false,
            default: ''
        },
        recursivo: {
            tipo: 'boolean',
            descricao: 'Busca recursiva em subpastas (para operação "buscar")',
            obrigatorio: false,
            default: true
        }
    },

    retorno: 'Resultado da operação com dados relevantes.',

    exemplos: [
        '{ "skill": "os_arquivos", "parametros": { "operacao": "ler", "caminho": "C:\\\\relatorio.txt" } }',
        '{ "skill": "os_arquivos", "parametros": { "operacao": "mover", "caminho": "C:\\\\Downloads\\\\doc.pdf", "destino": "C:\\\\Documents\\\\doc.pdf" } }',
        '{ "skill": "os_arquivos", "parametros": { "operacao": "buscar", "caminho": "C:\\\\Downloads", "padrao": ".pdf" } }',
        '{ "skill": "os_arquivos", "parametros": { "operacao": "deletar", "caminho": "C:\\\\temp\\\\lixo.txt" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const operacao = String(params['operacao'] || '').trim();
        const caminho = String(params['caminho'] || '').trim();
        const destino = String(params['destino'] || '').trim();
        const padrao = String(params['padrao'] || '').trim();
        const recursivo = params['recursivo'] !== false;

        if (!caminho) {
            return { sucesso: false, erro: 'Parâmetro "caminho" obrigatório.', mensagem: 'Informe o caminho do arquivo ou pasta.' };
        }

        let resultado;

        switch (operacao) {
            case 'ler':
                resultado = await lerArquivo(caminho);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `📄 ${resultado.dados.caminho} (${resultado.dados.linhas} linhas)\n\n${resultado.dados.conteudo}`
                };

            case 'mover':
                if (!destino) return { sucesso: false, erro: 'Parâmetro "destino" obrigatório para mover.', mensagem: 'Informe o destino.' };
                resultado = await moverItem(caminho, destino);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `✅ Movido:\n  De: ${resultado.dados.origem}\n  Para: ${resultado.dados.destino}`
                };

            case 'copiar':
                if (!destino) return { sucesso: false, erro: 'Parâmetro "destino" obrigatório para copiar.', mensagem: 'Informe o destino.' };
                resultado = await copiarArquivo(caminho, destino);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `✅ Copiado:\n  De: ${resultado.dados.origem}\n  Para: ${resultado.dados.destino}`
                };

            case 'deletar':
                resultado = await deletarArquivo(caminho);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `🗑️ Deletado: ${resultado.dados.removido}`
                };

            case 'buscar':
                if (!padrao) return { sucesso: false, erro: 'Parâmetro "padrao" obrigatório para buscar.', mensagem: 'Informe o padrão de busca.' };
                resultado = await buscarArquivos(caminho, padrao, recursivo);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `🔍 Busca por "${padrao}" em ${resultado.dados.baseDir}:\n${resultado.dados.total} resultado(s)\n\n` +
                        resultado.dados.resultados.slice(0, 50).join('\n') +
                        (resultado.dados.total > 50 ? `\n... e mais ${resultado.dados.total - 50}` : '')
                };

            case 'info':
                resultado = await infoItem(caminho);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
                const d = resultado.dados;
                if (!d.existe) return { sucesso: true, dados: d, mensagem: `❌ "${caminho}" não existe.` };
                return {
                    sucesso: true,
                    dados: d,
                    mensagem: `ℹ️ ${d.caminho}\nTipo: ${d.tipo}\nTamanho: ${d.tamanho ? `${d.tamanho} bytes` : '-'}\nModificado: ${d.modificado}`
                };

            default:
                return {
                    sucesso: false,
                    erro: `Operação desconhecida: "${operacao}". Use: ler, mover, copiar, deletar, buscar, info`,
                    mensagem: 'Operação inválida.'
                };
        }
    }
};

export default osArquivos;
