/**
 * Skill: browser_screenshot
 *
 * Captura screenshot da página atual e retorna como base64.
 * Útil para debug, análise visual, ou quando o agente precisa "ver" sem agir.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser } from '../../browser-manager';

export const browserScreenshot: Skill = {
    nome: 'browser_screenshot',
    descricao: 'Captura screenshot da página atual do browser. Use para ver o estado visual da página ou para debug.',
    categoria: 'browser',

    parametros: {
        fullPage: {
            tipo: 'boolean',
            descricao: 'Capturar página inteira (scroll) ou apenas a viewport visível.',
            obrigatorio: false,
            default: false
        }
    },

    retorno: 'Screenshot em base64 (JPEG) e metadados da página.',

    exemplos: [
        '{ "skill": "browser_screenshot", "parametros": {} }',
        '{ "skill": "browser_screenshot", "parametros": { "fullPage": true } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const fullPage = Boolean(params['fullPage']);
            const buf: Buffer = await page.screenshot({ type: 'jpeg', quality: 75, fullPage });
            const base64 = buf.toString('base64');
            const url = page.url();
            const title = await page.title();

            return {
                sucesso: true,
                dados: {
                    url,
                    title,
                    screenshot: base64,
                    format: 'image/jpeg',
                    sizeKB: Math.round(buf.length / 1024)
                },
                mensagem: `Screenshot capturado — ${url} (${Math.round(buf.length / 1024)} KB)`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserScreenshot;
