/**
 * Skill: browser_go_back
 *
 * Volta para a página anterior no histórico do browser.
 * Essencial para PJe onde a navegação SPA pode ficar confusa.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser } from '../../browser-manager';

export const browserGoBack: Skill = {
    nome: 'browser_go_back',
    descricao: 'Volta para a página anterior no histórico do browser (equivalente ao botão voltar). Útil quando navegou para lugar errado ou precisa retornar.',
    categoria: 'browser',

    parametros: {},

    retorno: 'URL da página após voltar.',

    exemplos: [
        '{ "skill": "browser_go_back", "parametros": {} }'
    ],

    async execute(_params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const urlAntes = page.url();
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
            const urlDepois = page.url();
            const title = await page.title();

            if (urlAntes === urlDepois) {
                return {
                    sucesso: true,
                    dados: { url: urlDepois, title, noHistory: true },
                    mensagem: `Não há página anterior no histórico. Continua em: ${urlDepois}`
                };
            }

            return {
                sucesso: true,
                dados: { url: urlDepois, title, urlAnterior: urlAntes },
                mensagem: `Voltou para: ${urlDepois} (${title})`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserGoBack;
