/**
 * Skill: browser_navigate
 *
 * Navega para uma URL com controle de wait strategy.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser } from '../../browser-manager';

export const browserNavigate: Skill = {
    nome: 'browser_navigate',
    descricao: 'Navega para uma URL específica no browser. Retorna a URL final (pode diferir por redirect) e título.',
    categoria: 'browser',

    parametros: {
        url: {
            tipo: 'string',
            descricao: 'URL completa para navegar (ex: "https://pje.trt8.jus.br/consultaprocessual").',
            obrigatorio: true
        },
        esperarAte: {
            tipo: 'string',
            descricao: 'Estratégia de espera: quando considerar a página carregada.',
            obrigatorio: false,
            default: 'domcontentloaded',
            enum: ['load', 'domcontentloaded', 'networkidle', 'commit']
        },
        timeout: {
            tipo: 'number',
            descricao: 'Timeout de navegação em ms.',
            obrigatorio: false,
            default: 15000
        }
    },

    retorno: 'URL final, título da página e status.',

    exemplos: [
        '{ "skill": "browser_navigate", "parametros": { "url": "https://pje.trt8.jus.br/consultaprocessual" } }',
        '{ "skill": "browser_navigate", "parametros": { "url": "https://google.com", "esperarAte": "networkidle" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const url = String(params['url'] || '').trim();
            const esperarAte = String(params['esperarAte'] || 'domcontentloaded') as 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
            const timeout = Number(params['timeout'] || 15000);

            if (!url) {
                return { sucesso: false, erro: 'Parâmetro "url" obrigatório.' };
            }

            const urlAntes = page.url();
            await page.goto(url, { waitUntil: esperarAte, timeout });
            const urlFinal = page.url();
            const title = await page.title();

            const redirected = urlFinal !== url;

            return {
                sucesso: true,
                dados: { url: urlFinal, title, redirected, urlOriginal: url },
                mensagem: `Navegado para: ${urlFinal}${redirected ? ` (redirect de ${url})` : ''} — "${title}"`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserNavigate;
