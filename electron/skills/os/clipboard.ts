/**
 * Skill: os_clipboard
 *
 * Lê e escreve na área de transferência (clipboard) do Windows via Electron API.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { lerClipboard, escreverClipboard } from '../../tools/os-tools';

export const osClipboard: Skill = {
    nome: 'os_clipboard',
    descricao: 'Lê ou escreve na área de transferência (clipboard) do Windows. Use para copiar texto gerado para o usuário colar em outro app, ou para ler o que o usuário copiou.',
    categoria: 'os',

    parametros: {
        operacao: {
            tipo: 'string',
            descricao: 'Operação: "ler" para obter o texto atual do clipboard, "escrever" para colocar texto no clipboard',
            obrigatorio: true,
            enum: ['ler', 'escrever']
        },
        texto: {
            tipo: 'string',
            descricao: 'Texto a colocar no clipboard (apenas para operação "escrever")',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Texto do clipboard (ler) ou confirmação de escrita (escrever).',

    exemplos: [
        '{ "skill": "os_clipboard", "parametros": { "operacao": "ler" } }',
        '{ "skill": "os_clipboard", "parametros": { "operacao": "escrever", "texto": "Texto a copiar..." } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const operacao = String(params['operacao'] || '').trim();
        const texto = String(params['texto'] || '');

        if (operacao === 'ler') {
            const resultado = lerClipboard();
            if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
            const { texto: conteudo, vazio } = resultado.dados;
            if (vazio) return { sucesso: true, dados: resultado.dados, mensagem: '📋 Clipboard está vazio.' };
            return {
                sucesso: true,
                dados: resultado.dados,
                mensagem: `📋 Clipboard (${conteudo.length} chars):\n\n${conteudo}`
            };
        }

        if (operacao === 'escrever') {
            if (!texto) return { sucesso: false, erro: 'Parâmetro "texto" obrigatório para escrever.', mensagem: 'Informe o texto.' };
            const resultado = escreverClipboard(texto);
            if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
            return {
                sucesso: true,
                dados: resultado.dados,
                mensagem: `✅ Copiado para o clipboard (${resultado.dados.bytesEscritos} bytes). O usuário pode colar com Ctrl+V.`
            };
        }

        return { sucesso: false, erro: `Operação inválida: "${operacao}". Use: ler, escrever`, mensagem: 'Operação inválida.' };
    }
};

export default osClipboard;
