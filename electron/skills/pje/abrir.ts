/**
 * Skill: pje_abrir
 *
 * Abre o PJe no Chrome externo (Stagehand) e aguarda login do usuário.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getStagehand, runBrowserTask, injectOverlay, ensureStagehand } from '../../stagehand-manager';
import { resolveTribunalRoutes } from '../../pje/tribunal-urls';

export const pjeAbrir: Skill = {
    nome: 'pje_abrir',
    descricao: 'Abre o PJe no navegador para o usuário autenticar com certificado digital.',
    categoria: 'pje',

    parametros: {
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA, TRF1).',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Status de abertura do PJe e URL de login carregada.',

    exemplos: [
        '{ "skill": "pje_abrir", "parametros": { "tribunal": "TRT8" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const tribunal = String(params['tribunal'] || '');
        const routes = resolveTribunalRoutes(tribunal);
        const loginUrl = routes.loginUrl;

        console.log(`[pje_abrir] Tribunal: ${tribunal || '(vazio)'} -> ${loginUrl}`);

        try {
            // Garante que Stagehand está inicializado (auto-recupera se o init em background falhou)
            await ensureStagehand();
            const stagehand = getStagehand();
            const ctx = (stagehand as any).context ?? (stagehand as any).ctx;

            if (ctx && typeof ctx.pages === 'function') {
                const pages = ctx.pages();
                const page = pages[0] ?? await ctx.newPage();
                const currentUrl = page.url ? page.url() : '';

                if (currentUrl && isSameHost(currentUrl, loginUrl)) {
                    return {
                        sucesso: true,
                        dados: { url: currentUrl, tribunal: tribunal.toUpperCase() || 'TRT8', reusedSession: true },
                        mensagem: 'PJe já está aberto nesse tribunal. Continuando sem recarregar.'
                    };
                }

                const gotoFn = page.goto ?? page.navigate;
                if (typeof gotoFn === 'function') {
                    injectOverlay(`Abrindo ${tribunal || 'PJe'}...`)
                    await gotoFn.call(page, loginUrl);
                    injectOverlay('Aguardando login com certificado digital', true)
                    return {
                        sucesso: true,
                        dados: { url: loginUrl, tribunal: tribunal.toUpperCase() || 'TRT8', aguardandoLogin: true },
                        mensagem: `PJe aberto em ${loginUrl}. Faça login com certificado digital e me avise com "pronto".`
                    };
                }
            }

            // Fallback: instrução ao agente para navegar
            await runBrowserTask(
                `Navegue para a URL: ${loginUrl}\nSe já estiver nesse site, não faça nada.`,
                5
            );

            return {
                sucesso: true,
                dados: { url: loginUrl, tribunal: tribunal.toUpperCase() || 'TRT8', aguardandoLogin: true },
                mensagem: `PJe aberto em ${loginUrl}. Faça login com certificado digital e me avise com "pronto".`
            };
        } catch (error: any) {
            console.error('[pje_abrir] Erro:', error.message);
            return { sucesso: false, erro: error.message, mensagem: `Não consegui abrir o PJe: ${error.message}` };
        }
    }
};

function isSameHost(url1: string, url2: string): boolean {
    try {
        return new URL(url1).hostname.toLowerCase() === new URL(url2).hostname.toLowerCase();
    } catch { return false; }
}

export default pjeAbrir;
