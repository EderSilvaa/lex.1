/**
 * Skill: browser_click
 *
 * Clica em um elemento por ref (número), texto visível, seletor CSS ou coordenadas.
 * Smart retry: seletor direto → wait+retry → texto → bounding box → coordenadas.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser, smartClick, showCursorAt, resolveTarget } from '../../browser-manager';

export const browserClick: Skill = {
    nome: 'browser_click',
    descricao: 'Clica em um elemento. Use ref (número de browser_get_state) ou elemento (texto visível) ou seletor CSS. Retry automático com estratégias alternativas.',
    categoria: 'browser',

    parametros: {
        ref: {
            tipo: 'number',
            descricao: 'Ref do elemento (número de browser_get_state). Forma mais simples.',
            obrigatorio: false,
            default: -1
        },
        elemento: {
            tipo: 'string',
            descricao: 'Texto visível do elemento para localizar. Ex: "Pesquisar", "Movimentações".',
            obrigatorio: false,
            default: ''
        },
        seletor: {
            tipo: 'string',
            descricao: 'Seletor CSS direto (para precisão máxima).',
            obrigatorio: false,
            default: ''
        },
        x: {
            tipo: 'number',
            descricao: 'Coordenada X (pixels). Usar apenas se ref/elemento/seletor não disponíveis.',
            obrigatorio: false,
            default: 0
        },
        y: {
            tipo: 'number',
            descricao: 'Coordenada Y (pixels).',
            obrigatorio: false,
            default: 0
        },
        duplo: {
            tipo: 'boolean',
            descricao: 'Double-click.',
            obrigatorio: false,
            default: false
        }
    },

    retorno: 'Confirmação do click com estratégia utilizada.',

    exemplos: [
        '{ "skill": "browser_click", "parametros": { "ref": 1 } }',
        '{ "skill": "browser_click", "parametros": { "elemento": "Pesquisar" } }',
        '{ "skill": "browser_click", "parametros": { "seletor": "#btnPesquisar" } }',
        '{ "skill": "browser_click", "parametros": { "x": 350, "y": 200 } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const ref = Number(params['ref'] ?? -1);
            const elemento = String(params['elemento'] || '').trim();
            const seletor = String(params['seletor'] || '').trim();
            const x = Number(params['x'] || 0);
            const y = Number(params['y'] || 0);
            const duplo = Boolean(params['duplo']);

            // Resolve target: ref → elemento → seletor
            const target = resolveTarget({ ref: ref >= 0 ? ref : undefined, elemento: elemento || undefined, seletor: seletor || undefined });

            if (!target && !x && !y) {
                return {
                    sucesso: false,
                    erro: 'Informe "ref" (número de browser_get_state), "elemento" (texto visível) ou "seletor" (CSS). Ou coordenadas x/y.'
                };
            }

            if (target) {
                const result = await smartClick(page, target.selector, { duplo });

                if (result.success) {
                    const url = page.url();
                    const sourceMsg = target.source !== 'seletor' ? ` (via ${target.source})` : '';
                    const strategyMsg = result.strategy !== 'selector' ? ` [retry: ${result.strategy}]` : '';
                    return {
                        sucesso: true,
                        dados: { target: target.selector, source: target.source, strategy: result.strategy, url },
                        mensagem: `Click em "${target.refInfo?.text || target.selector}"${sourceMsg}${strategyMsg} executado.`
                    };
                }

                // smartClick falhou — tenta coordenadas se fornecidas
                if (x || y) {
                    showCursorAt(x, y);
                    duplo ? await page.mouse.dblclick(x, y) : await page.mouse.click(x, y);
                    return {
                        sucesso: true,
                        dados: { x, y, fallback: true, url: page.url() },
                        mensagem: `Elemento não encontrado. Click por coordenadas (${x}, ${y}).`
                    };
                }
                return { sucesso: false, erro: `Elemento não encontrado: "${target.refInfo?.text || target.selector}". Use browser_get_state para ver elementos disponíveis.` };
            }

            // Click por coordenadas direto
            showCursorAt(x, y);
            duplo ? await page.mouse.dblclick(x, y) : await page.mouse.click(x, y);
            return {
                sucesso: true,
                dados: { x, y, url: page.url() },
                mensagem: `Click em (${x}, ${y}) executado.`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserClick;
