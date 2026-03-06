/**
 * Skill: os_escrever
 *
 * Cria ou sobrescreve um arquivo com conteúdo gerado pelo agent.
 * Separado de os_arquivos para deixar claro ao LLM que é uma operação de escrita.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { escreverArquivo, criarPasta } from '../../tools/os-tools';

export const osEscrever: Skill = {
    nome: 'os_escrever',
    descricao: 'Cria ou sobrescreve um arquivo com conteúdo texto. Também pode criar pastas. Use para salvar relatórios, notas, scripts ou organizar estruturas de pastas.',
    categoria: 'os',

    parametros: {
        operacao: {
            tipo: 'string',
            descricao: 'Operação: "arquivo" para criar/sobrescrever arquivo, "pasta" para criar pasta',
            obrigatorio: true,
            enum: ['arquivo', 'pasta']
        },
        caminho: {
            tipo: 'string',
            descricao: 'Caminho completo do arquivo ou pasta a criar',
            obrigatorio: true
        },
        conteudo: {
            tipo: 'string',
            descricao: 'Conteúdo do arquivo (para operação "arquivo")',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Resultado da criação com caminho resolvido.',

    exemplos: [
        '{ "skill": "os_escrever", "parametros": { "operacao": "arquivo", "caminho": "C:\\\\Documents\\\\resumo.txt", "conteudo": "Texto do resumo..." } }',
        '{ "skill": "os_escrever", "parametros": { "operacao": "pasta", "caminho": "C:\\\\Documents\\\\Projetos\\\\LEX" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const operacao = String(params['operacao'] || '').trim();
        const caminho = String(params['caminho'] || '').trim();
        const conteudo = String(params['conteudo'] || '');

        if (!caminho) {
            return { sucesso: false, erro: 'Parâmetro "caminho" obrigatório.', mensagem: 'Informe o caminho.' };
        }

        if (operacao === 'pasta') {
            const resultado = await criarPasta(caminho);
            if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
            return { sucesso: true, dados: resultado.dados, mensagem: `✅ Pasta criada: ${resultado.dados.caminho}` };
        }

        if (operacao === 'arquivo') {
            const resultado = await escreverArquivo(caminho, conteudo);
            if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
            return {
                sucesso: true,
                dados: resultado.dados,
                mensagem: `✅ Arquivo salvo: ${resultado.dados.caminho} (${resultado.dados.bytesEscritos} bytes)`
            };
        }

        return { sucesso: false, erro: `Operação inválida: "${operacao}". Use: arquivo, pasta`, mensagem: 'Operação inválida.' };
    }
};

export default osEscrever;
