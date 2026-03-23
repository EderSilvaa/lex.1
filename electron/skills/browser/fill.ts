/**
 * Skill: browser_fill
 *
 * Preenche um input substituindo o valor inteiro de uma vez.
 * Aceita ref (número), elemento (texto), ou seletor CSS.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser, fillInFrames, resolveTarget } from '../../browser-manager';

export const browserFill: Skill = {
    nome: 'browser_fill',
    descricao: 'Preenche campo de input/textarea. Use ref (número de browser_get_state) ou elemento (label do campo) ou seletor CSS. Substitui o valor inteiro e dispara eventos.',
    categoria: 'browser',

    parametros: {
        ref: {
            tipo: 'number',
            descricao: 'Ref do campo (número de browser_get_state).',
            obrigatorio: false,
            default: -1
        },
        elemento: {
            tipo: 'string',
            descricao: 'Texto/label do campo. Ex: "Número do Processo", "CPF".',
            obrigatorio: false,
            default: ''
        },
        seletor: {
            tipo: 'string',
            descricao: 'Seletor CSS direto.',
            obrigatorio: false,
            default: ''
        },
        valor: {
            tipo: 'string',
            descricao: 'Valor para preencher no campo.',
            obrigatorio: true
        }
    },

    retorno: 'Confirmação do preenchimento.',

    exemplos: [
        '{ "skill": "browser_fill", "parametros": { "ref": 0, "valor": "0801234-56.2024.8.14.0301" } }',
        '{ "skill": "browser_fill", "parametros": { "elemento": "Número do Processo", "valor": "0801234..." } }',
        '{ "skill": "browser_fill", "parametros": { "seletor": "#campoNumero", "valor": "0801234..." } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const ref = Number(params['ref'] ?? -1);
            const elemento = String(params['elemento'] || '').trim();
            const seletor = String(params['seletor'] || '').trim();
            const valor = String(params['valor'] ?? '');

            // Resolve target: ref → elemento → seletor
            const target = resolveTarget({ ref: ref >= 0 ? ref : undefined, elemento: elemento || undefined, seletor: seletor || undefined });

            if (!target) {
                return { sucesso: false, erro: 'Informe "ref" (número de browser_get_state), "elemento" (label do campo) ou "seletor" (CSS).' };
            }

            await fillInFrames(page, target.selector, valor);

            const sourceMsg = target.source !== 'seletor' ? ` (via ${target.source})` : '';
            return {
                sucesso: true,
                dados: { target: target.selector, source: target.source, valor },
                mensagem: `Campo "${target.refInfo?.text || target.selector}"${sourceMsg} preenchido com "${valor.slice(0, 60)}${valor.length > 60 ? '...' : ''}".`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserFill;
