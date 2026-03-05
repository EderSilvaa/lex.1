/**
 * Skill: pje_preencher
 *
 * Preenche campos de formulário na tela atual do PJe via Stagehand agent.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { runBrowserTask } from '../../stagehand-manager';

export const pjePreencher: Skill = {
    nome: 'pje_preencher',
    descricao: 'Preenche campos de formulário na tela atual do PJe. Use para preencher Jurisdição, Classe, Assunto, CPF, etc.',
    categoria: 'pje',

    parametros: {
        campos: {
            tipo: 'object',
            descricao: 'Dicionário com Nome do Campo → Valor. Ex: { "Jurisdição": "Belém", "Classe judicial": "Rito Ordinário" }',
            obrigatorio: true
        }
    },

    retorno: 'Status de preenchimento de cada campo.',

    exemplos: [
        '{ "skill": "pje_preencher", "parametros": { "campos": { "Jurisdição": "Belém", "Classe judicial": "Rito Ordinário" } } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const campos = params['campos'];
        if (!campos || typeof campos !== 'object' || Object.keys(campos).length === 0) {
            return { sucesso: false, erro: 'Parâmetro "campos" obrigatório.', mensagem: 'Informe os campos e valores para preencher.' };
        }

        const listaCampos = Object.entries(campos)
            .map(([campo, valor]) => `- "${campo}": "${valor}"`)
            .join('\n');

        const instrucao = `
Você está em um formulário do PJe (sistema judicial brasileiro).

Objetivo: Preencher os seguintes campos com os valores indicados:
${listaCampos}

Instruções:
- Para cada campo, localize-o na tela pelo rótulo/label visível
- Clique no campo e preencha com o valor
- Para campos do tipo select/dropdown, selecione a opção que corresponde ao valor
- Para campos com autocomplete, digite o valor e aguarde as sugestões aparecerem, então selecione a correta
- Confirme que todos os campos foram preenchidos corretamente
        `.trim();

        console.log(`[pje_preencher] Campos: ${Object.keys(campos).join(', ')}`);

        try {
            const resultado = await runBrowserTask(instrucao, 15);
            return {
                sucesso: true,
                dados: { campos, resultado },
                mensagem: resultado
            };
        } catch (error: any) {
            console.error('[pje_preencher] Erro:', error.message);
            return { sucesso: false, erro: error.message, mensagem: `Erro ao preencher formulário: ${error.message}` };
        }
    }
};

export default pjePreencher;
