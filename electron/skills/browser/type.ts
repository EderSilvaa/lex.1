/**
 * Skill: browser_type
 *
 * Digita texto keystroke-by-keystroke. Ideal para campos com autocomplete,
 * dropdowns dinâmicos e campos PJe que escutam keydown/keyup.
 * Aceita ref, elemento ou seletor para identificar o campo.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser, clickInFrames, resolveTarget } from '../../browser-manager';

export const browserType: Skill = {
    nome: 'browser_type',
    descricao: 'Digita texto tecla por tecla. Use ref (número) ou elemento (label) ou seletor para focar o campo. Ideal para autocomplete.',
    categoria: 'browser',

    parametros: {
        texto: {
            tipo: 'string',
            descricao: 'Texto a digitar.',
            obrigatorio: true
        },
        ref: {
            tipo: 'number',
            descricao: 'Ref do campo (número de browser_get_state).',
            obrigatorio: false,
            default: -1
        },
        elemento: {
            tipo: 'string',
            descricao: 'Texto/label do campo. Ex: "Jurisdição", "CPF".',
            obrigatorio: false,
            default: ''
        },
        seletor: {
            tipo: 'string',
            descricao: 'Seletor CSS do campo para focar antes de digitar. Se vazio, digita no elemento focado.',
            obrigatorio: false,
            default: ''
        },
        delay: {
            tipo: 'number',
            descricao: 'Delay entre teclas em ms (default: 30).',
            obrigatorio: false,
            default: 30
        },
        limpar: {
            tipo: 'boolean',
            descricao: 'Limpar o campo antes de digitar (Ctrl+A + Delete).',
            obrigatorio: false,
            default: false
        }
    },

    retorno: 'Confirmação do texto digitado.',

    exemplos: [
        '{ "skill": "browser_type", "parametros": { "ref": 0, "texto": "Belém" } }',
        '{ "skill": "browser_type", "parametros": { "elemento": "Jurisdição", "texto": "Belém" } }',
        '{ "skill": "browser_type", "parametros": { "seletor": "#campoJurisdicao", "texto": "Belém" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const texto = String(params['texto'] ?? '');
            const ref = Number(params['ref'] ?? -1);
            const elementoParam = String(params['elemento'] || '').trim();
            const seletor = String(params['seletor'] || '').trim();
            const delay = Number(params['delay'] || 30);
            const limpar = Boolean(params['limpar']);

            if (!texto) {
                return { sucesso: false, erro: 'Parâmetro "texto" obrigatório.' };
            }

            // Resolve target: ref → elemento → seletor
            const target = resolveTarget({ ref: ref >= 0 ? ref : undefined, elemento: elementoParam || undefined, seletor: seletor || undefined });

            // Foca no elemento se target resolvido
            if (target) {
                await clickInFrames(page, target.selector);
            }
            // Se nenhum target, digita no elemento focado (comportamento original)

            // Limpa o campo se solicitado
            if (limpar) {
                await page.keyboard.press('Control+a');
                await page.keyboard.press('Delete');
            }

            await page.keyboard.type(texto, { delay });

            const targetLabel = target?.refInfo?.text || target?.selector || '(elemento focado)';
            const sourceMsg = target && target.source !== 'seletor' ? ` (via ${target.source})` : '';
            return {
                sucesso: true,
                dados: { texto, target: target?.selector || '', source: target?.source || 'focado', delay },
                mensagem: `Digitado "${texto.slice(0, 60)}${texto.length > 60 ? '...' : ''}" em ${targetLabel}${sourceMsg}.`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserType;
