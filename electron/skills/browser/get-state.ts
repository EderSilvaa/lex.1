/**
 * Skill: browser_get_state
 *
 * Retorna estado atual do browser: URL, título, DOM summary interativo.
 * Dá ao agente "consciência" do que está na tela sem precisar executar ação.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser } from '../../browser-manager';

export const browserGetState: Skill = {
    nome: 'browser_get_state',
    descricao: 'Retorna estado atual do browser: URL, título da página e elementos DOM interativos visíveis. Use para "ver" onde o agente está antes de agir.',
    categoria: 'browser',

    parametros: {
        incluirDom: {
            tipo: 'boolean',
            descricao: 'Incluir lista de elementos DOM interativos (inputs, botões, links).',
            obrigatorio: false,
            default: true
        }
    },

    retorno: 'URL atual, título, e opcionalmente lista de elementos DOM interativos.',

    exemplos: [
        '{ "skill": "browser_get_state", "parametros": {} }',
        '{ "skill": "browser_get_state", "parametros": { "incluirDom": false } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const url = page.url();
            const title = await page.title();
            const incluirDom = params['incluirDom'] !== false;

            const dados: any = { url, title };

            if (incluirDom) {
                const elements = await page.evaluate(() => {
                    const results: any[] = [];
                    const selectors = 'a[href], input, textarea, select, button, [role="button"], [role="link"], [role="tab"], [role="searchbox"]';
                    document.querySelectorAll(selectors).forEach((el: any) => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) return;
                        if (rect.bottom < 0 || rect.top > window.innerHeight) return; // fora da viewport
                        results.push({
                            tag: el.tagName.toLowerCase(),
                            type: el.type || '',
                            id: el.id || '',
                            name: el.name || '',
                            text: (el.textContent || el.value || '').trim().slice(0, 80),
                            href: el.href ? el.href.slice(0, 120) : '',
                            placeholder: el.placeholder || '',
                            sel: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : '',
                        });
                    });
                    return results.slice(0, 30);
                }).catch(() => []);
                dados.elements = elements;
                dados.elementCount = elements.length;
            }

            // Resumo legível
            const lines = [`URL: ${url}`, `Título: ${title}`];
            if (incluirDom && dados.elements.length > 0) {
                lines.push(`${dados.elementCount} elementos interativos visíveis:`);
                for (const el of dados.elements.slice(0, 15)) {
                    const label = el.text || el.placeholder || el.name || el.id || el.href || '(sem texto)';
                    lines.push(`  [${el.tag}${el.type ? '/' + el.type : ''}] ${label.slice(0, 60)}${el.sel ? ' → ' + el.sel : ''}`);
                }
                if (dados.elements.length > 15) lines.push(`  ... e mais ${dados.elements.length - 15}`);
            }

            return {
                sucesso: true,
                dados,
                mensagem: lines.join('\n')
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserGetState;
