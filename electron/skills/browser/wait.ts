/**
 * Skill: browser_wait
 *
 * Espera por uma condição antes de prosseguir: tempo fixo, seletor aparecer,
 * ou URL mudar. Essencial para páginas dinâmicas como o PJe.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser, waitForSelectorInFrames } from '../../browser-manager';

export const browserWait: Skill = {
    nome: 'browser_wait',
    descricao: 'Espera por uma condição: tempo fixo, elemento aparecer/sumir, ou URL mudar. Use após ações que disparam carregamento (click em botão, submit, navegação).',
    categoria: 'browser',

    parametros: {
        tipo: {
            tipo: 'string',
            descricao: 'Tipo de espera.',
            obrigatorio: false,
            default: 'tempo',
            enum: ['tempo', 'seletor', 'navegacao']
        },
        valor: {
            tipo: 'string',
            descricao: 'Para tipo="seletor": seletor CSS do elemento. Para tipo="navegacao": padrão de URL (substring ou glob).',
            obrigatorio: false,
            default: ''
        },
        tempo: {
            tipo: 'number',
            descricao: 'Para tipo="tempo": ms a esperar. Para outros tipos: timeout máximo em ms.',
            obrigatorio: false,
            default: 2000
        },
        estado: {
            tipo: 'string',
            descricao: 'Para tipo="seletor": estado esperado do elemento.',
            obrigatorio: false,
            default: 'visible',
            enum: ['visible', 'attached', 'hidden']
        }
    },

    retorno: 'Confirmação de que a condição foi atendida.',

    exemplos: [
        '{ "skill": "browser_wait", "parametros": { "tipo": "tempo", "tempo": 3000 } }',
        '{ "skill": "browser_wait", "parametros": { "tipo": "seletor", "valor": "#resultados", "tempo": 10000 } }',
        '{ "skill": "browser_wait", "parametros": { "tipo": "seletor", "valor": ".loading", "estado": "hidden", "tempo": 5000 } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const tipo = String(params['tipo'] || 'tempo');
            const valor = String(params['valor'] || '');
            const tempo = Number(params['tempo'] || 2000);
            const estado = (params['estado'] || 'visible') as 'visible' | 'attached' | 'hidden';

            switch (tipo) {
                case 'tempo':
                    await page.waitForTimeout(tempo);
                    return {
                        sucesso: true,
                        dados: { tipo, tempo },
                        mensagem: `Esperou ${tempo}ms.`
                    };

                case 'seletor':
                    if (!valor) return { sucesso: false, erro: 'Para tipo="seletor", o parâmetro "valor" (seletor CSS) é obrigatório.' };
                    await waitForSelectorInFrames(page, valor, { timeout: tempo, state: estado });
                    return {
                        sucesso: true,
                        dados: { tipo, seletor: valor, estado, tempo },
                        mensagem: `Elemento "${valor}" está ${estado === 'hidden' ? 'oculto' : 'visível'}.`
                    };

                case 'navegacao':
                    if (!valor) return { sucesso: false, erro: 'Para tipo="navegacao", o parâmetro "valor" (padrão de URL) é obrigatório.' };
                    await page.waitForURL(`**${valor}**`, { timeout: tempo });
                    const urlFinal = page.url();
                    return {
                        sucesso: true,
                        dados: { tipo, pattern: valor, url: urlFinal, tempo },
                        mensagem: `Navegação detectada: ${urlFinal}`
                    };

                default:
                    return { sucesso: false, erro: `Tipo "${tipo}" inválido. Use: tempo, seletor ou navegacao.` };
            }
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserWait;
