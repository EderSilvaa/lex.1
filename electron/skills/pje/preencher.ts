/**
 * Skill: pje_preencher
 *
 * Preenche campos de formulário na tela atual do PJe via browser-use.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser } from '../../browser-manager';
import { runBrowserUseTask } from '../../browser/browser-use-executor';

export const pjePreencher: Skill = {
    nome: 'pje_preencher',
    descricao: 'Preenche campos de formulário na tela atual do PJe. Use para preencher Jurisdição, Classe, Assunto, CPF, etc.',
    categoria: 'pje',

    parametros: {
        campos: {
            tipo: 'object',
            descricao: 'Dicionário com Nome do Campo → Valor. Ex: { "Jurisdição": "Belém", "Classe judicial": "Rito Ordinário" }',
            obrigatorio: true
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA). Usado para contexto.',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Status de preenchimento de cada campo.',

    exemplos: [
        '{ "skill": "pje_preencher", "parametros": { "campos": { "Jurisdição": "Belém", "Classe judicial": "Rito Ordinário" } } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const campos = params['campos'];
        const tribunal = String(params['tribunal'] || '');

        if (!campos || typeof campos !== 'object' || Object.keys(campos).length === 0) {
            return { sucesso: false, erro: 'Parâmetro "campos" obrigatório.', mensagem: 'Informe os campos e valores para preencher.' };
        }

        console.log(`[pje_preencher] Campos: ${Object.keys(campos).join(', ')}`);

        const listaCampos = Object.entries(campos)
            .map(([campo, valor]) => `- "${campo}": "${valor}"`)
            .join('\n');

        const instrucao = `
Você está em um formulário do PJe${tribunal ? ` (${tribunal.toUpperCase()})` : ''} (sistema judicial brasileiro).

Preencha os seguintes campos com os valores indicados:
${listaCampos}

Instruções:
- Localize cada campo pelo rótulo/label visível na tela (pode estar em iframe)
- Clique no campo e preencha com o valor correspondente
- Para dropdowns/select, selecione a opção que corresponde ao valor
- Para campos com autocomplete, digite o valor e aguarde as sugestões, então selecione a correta
- Confirme que todos os campos foram preenchidos
        `.trim();

        try {
            await ensureBrowser();
            const res = await runBrowserUseTask({
                task: instrucao,
                tribunal,
                context: 'pje_preencher',
                maxSteps: 15,
            });
            return {
                sucesso: res.success,
                dados: { campos, resultado: res.result },
                mensagem: res.result || `${Object.keys(campos).length} campo(s) preenchido(s).`,
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message, mensagem: `Erro ao preencher campos: ${error.message}` };
        }
    }
};

export default pjePreencher;
