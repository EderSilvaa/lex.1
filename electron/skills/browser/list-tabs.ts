/**
 * Skill: browser_list_tabs
 *
 * Lista todas as abas abertas no browser.
 * Crítico para PJe que abre documentos e processos em abas novas.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getBrowserContext, ensureBrowser } from '../../browser-manager';

export const browserListTabs: Skill = {
    nome: 'browser_list_tabs',
    descricao: 'Lista todas as abas abertas no browser com índice, URL e título. Essencial quando o PJe abre documentos/processos em abas novas.',
    categoria: 'browser',

    parametros: {},

    retorno: 'Lista de abas com índice, URL e título. Indica qual é a aba ativa.',

    exemplos: [
        '{ "skill": "browser_list_tabs", "parametros": {} }'
    ],

    async execute(_params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const ctx = getBrowserContext();
            const pages = ctx.pages();

            if (pages.length === 0) {
                return {
                    sucesso: true,
                    dados: { tabs: [], count: 0 },
                    mensagem: 'Nenhuma aba aberta.'
                };
            }

            const tabs = await Promise.all(
                pages.map(async (page, index) => {
                    let url = '';
                    let title = '';
                    try { url = page.url(); } catch { /* closed */ }
                    try { title = await page.title(); } catch { /* closed */ }
                    return { index, url, title };
                })
            );

            const lines = tabs.map((t, i) => {
                const active = i === 0 ? ' ← ativa' : '';
                const label = t.title || '(sem título)';
                return `  [${t.index}] ${label} — ${t.url}${active}`;
            });

            return {
                sucesso: true,
                dados: { tabs, count: tabs.length, activeIndex: 0 },
                mensagem: `${tabs.length} aba(s) aberta(s):\n${lines.join('\n')}`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserListTabs;
