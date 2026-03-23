/**
 * Skill: browser_press
 *
 * Pressiona uma tecla do teclado (Enter, Tab, Escape, setas, etc.)
 * Suporta modificadores (Ctrl, Shift, Alt).
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser } from '../../browser-manager';

export const browserPress: Skill = {
    nome: 'browser_press',
    descricao: 'Pressiona uma tecla do teclado. Use após browser_fill/browser_type para submeter (Enter), navegar entre campos (Tab), fechar modais (Escape), etc.',
    categoria: 'browser',

    parametros: {
        tecla: {
            tipo: 'string',
            descricao: 'Tecla a pressionar: Enter, Tab, Escape, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Backspace, Delete, Home, End, F1-F12, Space, etc.',
            obrigatorio: true
        },
        modificadores: {
            tipo: 'string',
            descricao: 'Modificadores separados por +: Control, Shift, Alt, Meta. Ex: "Control+Shift" para Ctrl+Shift+tecla.',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Confirmação da tecla pressionada.',

    exemplos: [
        '{ "skill": "browser_press", "parametros": { "tecla": "Enter" } }',
        '{ "skill": "browser_press", "parametros": { "tecla": "Tab" } }',
        '{ "skill": "browser_press", "parametros": { "tecla": "a", "modificadores": "Control" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const tecla = String(params['tecla'] || '').trim();
            const modificadores = String(params['modificadores'] || '').trim();

            if (!tecla) {
                return { sucesso: false, erro: 'Parâmetro "tecla" obrigatório.' };
            }

            const combo = modificadores ? `${modificadores}+${tecla}` : tecla;
            await page.keyboard.press(combo);

            return {
                sucesso: true,
                dados: { tecla, modificadores, combo },
                mensagem: `Tecla "${combo}" pressionada.`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserPress;
