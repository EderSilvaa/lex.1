/**
 * Skill: browser_close_tab
 *
 * Fecha uma aba por índice. Evita acúmulo de abas que come memória.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getBrowserContext, ensureBrowser } from '../../browser-manager';

export const browserCloseTab: Skill = {
    nome: 'browser_close_tab',
    descricao: 'Fecha uma aba do browser por índice. Use browser_list_tabs para ver os índices. Não pode fechar a última aba.',
    categoria: 'browser',

    parametros: {
        indice: {
            tipo: 'number',
            descricao: 'Índice da aba a fechar (0 = primeira). Use browser_list_tabs para ver.',
            obrigatorio: true
        }
    },

    retorno: 'Confirmação de fechamento e número de abas restantes.',

    exemplos: [
        '{ "skill": "browser_close_tab", "parametros": { "indice": 2 } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const ctx = getBrowserContext();
            const pages = ctx.pages();
            const indice = Number(params['indice']);

            if (isNaN(indice) || indice < 0 || indice >= pages.length) {
                return {
                    sucesso: false,
                    erro: `Índice ${indice} inválido. Há ${pages.length} aba(s) (0 a ${pages.length - 1}).`
                };
            }

            if (pages.length <= 1) {
                return {
                    sucesso: false,
                    erro: 'Não é possível fechar a última aba — o browser precisa de pelo menos uma.'
                };
            }

            const closingUrl = pages[indice]!.url();
            const closingTitle = await pages[indice]!.title().catch(() => '');
            await pages[indice]!.close();

            const remaining = ctx.pages().length;

            return {
                sucesso: true,
                dados: { closedIndex: indice, closedUrl: closingUrl, closedTitle: closingTitle, remainingTabs: remaining },
                mensagem: `Aba [${indice}] fechada: ${closingTitle || closingUrl}. ${remaining} aba(s) restante(s).`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserCloseTab;
