/**
 * Skill: browser_get_html
 *
 * Extrai conteúdo da página como texto ou HTML.
 * Muito mais barato que Vision — sem screenshot, sem LLM.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser } from '../../browser-manager';

export const browserGetHtml: Skill = {
    nome: 'browser_get_html',
    descricao: 'Extrai conteúdo da página atual como texto limpo ou HTML bruto. Mais rápido e barato que screenshot+Vision para extrair dados.',
    categoria: 'browser',

    parametros: {
        formato: {
            tipo: 'string',
            descricao: 'Formato de saída: "texto" (limpo, sem tags) ou "html" (bruto).',
            obrigatorio: false,
            default: 'texto',
            enum: ['texto', 'html']
        },
        seletor: {
            tipo: 'string',
            descricao: 'Seletor CSS para extrair só uma parte da página (ex: "#conteudo", ".resultado"). Se vazio, extrai a página toda.',
            obrigatorio: false,
            default: ''
        },
        limite: {
            tipo: 'number',
            descricao: 'Limite de caracteres no retorno (evita respostas enormes).',
            obrigatorio: false,
            default: 15000
        }
    },

    retorno: 'Conteúdo da página em texto ou HTML, truncado se necessário.',

    exemplos: [
        '{ "skill": "browser_get_html", "parametros": {} }',
        '{ "skill": "browser_get_html", "parametros": { "formato": "html", "seletor": "#movimentacoes" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const formato = String(params['formato'] || 'texto');
            const seletor = String(params['seletor'] || '');
            const limite = Number(params['limite'] || 15000);

            let content: string;

            if (formato === 'html') {
                if (seletor) {
                    content = await page.evaluate((sel: string) => {
                        const el = document.querySelector(sel);
                        return el ? el.outerHTML : `Seletor "${sel}" não encontrado.`;
                    }, seletor);
                } else {
                    content = await page.content();
                }
            } else {
                // texto limpo
                content = await page.evaluate((sel: string) => {
                    const root = sel ? document.querySelector(sel) : document.body;
                    if (!root) return sel ? `Seletor "${sel}" não encontrado.` : '';
                    // Remove scripts e styles
                    const clone = root.cloneNode(true) as HTMLElement;
                    clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
                    return (clone.innerText || clone.textContent || '').trim();
                }, seletor);
            }

            const truncated = content.length > limite;
            const output = truncated ? content.slice(0, limite) + '\n\n[... truncado]' : content;
            const url = page.url();

            return {
                sucesso: true,
                dados: { url, formato, seletor: seletor || '(página inteira)', charCount: content.length, truncated },
                mensagem: output
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserGetHtml;
