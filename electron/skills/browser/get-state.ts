/**
 * Skill: browser_get_state
 *
 * Retorna estado atual do browser: URL, título, elementos DOM com refs numerados.
 * Os refs permitem que qualquer LLM (inclusive fracos) interaja com a página
 * usando browser_click { ref: 1 } ao invés de construir CSS selectors.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser, storeElementRefs } from '../../browser-manager';
import type { ElementRef } from '../../browser-manager';

// Mapa de roles semânticos (legíveis pra humanos e LLMs)
const ROLE_MAP: Record<string, string> = {
    'input/text': 'campo de texto',
    'input/password': 'campo de senha',
    'input/email': 'campo de email',
    'input/number': 'campo numérico',
    'input/submit': 'botão submit',
    'input/checkbox': 'checkbox',
    'input/radio': 'radio',
    'input/file': 'upload de arquivo',
    'input/search': 'campo de busca',
    'textarea': 'área de texto',
    'select': 'seleção',
    'button': 'botão',
    'a': 'link',
};

export const browserGetState: Skill = {
    nome: 'browser_get_state',
    descricao: 'Retorna estado do browser com elementos numerados (refs). Use antes de agir: browser_click { ref: 1 }, browser_fill { ref: 0, valor: "..." }.',
    categoria: 'browser',

    parametros: {
        incluirDom: {
            tipo: 'boolean',
            descricao: 'Incluir lista de elementos DOM interativos com refs.',
            obrigatorio: false,
            default: true
        }
    },

    retorno: 'URL, título e elementos numerados com refs para ação direta.',

    exemplos: [
        '{ "skill": "browser_get_state", "parametros": {} }'
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
                    document.querySelectorAll(selectors).forEach((el: any, index: number) => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) return;
                        if (rect.bottom < 0 || rect.top > window.innerHeight) return;

                        const tag = el.tagName.toLowerCase();
                        const type = el.type || '';
                        const id = el.id || '';
                        const name = el.name || '';
                        const role = el.getAttribute('role') || '';
                        const text = (el.textContent || '').trim().slice(0, 80);
                        const placeholder = el.placeholder || '';
                        const ariaLabel = el.getAttribute('aria-label') || '';
                        const value = (el.value || '').trim().slice(0, 40);
                        const href = el.href ? el.href.slice(0, 120) : '';

                        // Label legível: prioridade textContent > placeholder > aria-label > name > id
                        const label = text || placeholder || ariaLabel || name || id || value || '(sem texto)';

                        // Constrói CSS selector (estável)
                        let sel = '';
                        if (id) {
                            sel = `#${CSS.escape(id)}`;
                        } else if (name) {
                            sel = `${tag}[name="${name}"]`;
                        } else if (text && text.length <= 50) {
                            sel = `${tag}:has-text("${text.slice(0, 40).replace(/"/g, '\\"')}")`;
                        } else if (placeholder) {
                            sel = `${tag}[placeholder="${placeholder.replace(/"/g, '\\"')}"]`;
                        } else if (ariaLabel) {
                            sel = `${tag}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
                        }

                        results.push({
                            tag,
                            type,
                            id,
                            name,
                            text: label,
                            href,
                            placeholder,
                            role,
                            sel,
                        });
                    });
                    return results.slice(0, 50);
                }).catch(() => []);

                // Atribui refs sequenciais e constrói ElementRef[]
                const refs: ElementRef[] = elements.map((el: any, i: number) => {
                    const tagType = el.type ? `${el.tag}/${el.type}` : el.tag;
                    const roleAttr = el.role;
                    let semanticRole = '';
                    if (roleAttr === 'tab') semanticRole = 'aba';
                    else if (roleAttr === 'button') semanticRole = 'botão';
                    else semanticRole = ROLE_MAP[tagType] || ROLE_MAP[el.tag] || el.tag;

                    return {
                        ref: i,
                        selector: el.sel || '',
                        tag: el.tag,
                        type: el.type,
                        text: el.text,
                        role: semanticRole,
                    } satisfies ElementRef;
                });

                // Armazena refs no browser-manager para uso por click/fill/type
                storeElementRefs(refs, url);

                dados.elements = refs;
                dados.elementCount = refs.length;
            }

            // Resumo legível com refs numerados
            const lines = [`URL: ${url}`, `Título: ${title}`];
            if (incluirDom && dados.elements && dados.elements.length > 0) {
                lines.push(`\n${dados.elementCount} elementos interativos:`);
                for (const el of dados.elements) {
                    const roleLabel = el.role !== el.tag ? ` (${el.role})` : '';
                    lines.push(`  [${el.ref}] ${el.tag} "${el.text}"${roleLabel}`);
                }
                lines.push(`\nPara agir, use ref. Ex: browser_click { ref: 1 } ou browser_fill { ref: 0, valor: "..." }`);
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
