/**
 * Skill: browser_switch_tab
 *
 * Troca para uma aba específica por índice.
 * Crítico para PJe que abre documentos em abas novas.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getBrowserContext, ensureBrowser, setActivePage } from '../../browser-manager';

export const browserSwitchTab: Skill = {
    nome: 'browser_switch_tab',
    descricao: 'Troca para uma aba do browser por índice. Use browser_list_tabs antes para ver os índices disponíveis.',
    categoria: 'browser',

    parametros: {
        indice: {
            tipo: 'number',
            descricao: 'Índice da aba (0 = primeira). Use browser_list_tabs para ver.',
            obrigatorio: true
        }
    },

    retorno: 'URL e título da aba ativada.',

    exemplos: [
        '{ "skill": "browser_switch_tab", "parametros": { "indice": 1 } }'
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

            const page = pages[indice]!;
            await page.bringToFront();
            setActivePage(indice);

            const url = page.url();
            const title = await page.title();

            return {
                sucesso: true,
                dados: { index: indice, url, title, totalTabs: pages.length },
                mensagem: `Trocou para aba [${indice}]: ${title} — ${url}`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserSwitchTab;
