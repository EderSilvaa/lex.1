/**
 * Skill: pje_navegar
 *
 * Navega dentro do PJe para uma área/menu/ação via browser agent.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser, runBrowserTask } from '../../browser-manager';
import { resolveTribunalRoutes, resolveDestinationUrl } from '../../pje/tribunal-urls';
import { lookupRoute, saveRoute } from '../../pje/route-memory';

export const pjeNavegar: Skill = {
    nome: 'pje_navegar',
    descricao: 'Navega dentro do PJe para uma área, aba ou menu em linguagem natural.',
    categoria: 'pje',

    parametros: {
        destino: {
            tipo: 'string',
            descricao: 'Destino desejado (ex: "Processo > Peticionamento > Novo Processo", "painel", "meus processos").',
            obrigatorio: true
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA).',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Confirmação de navegação ou descrição da tela atual.',

    exemplos: [
        '{ "skill": "pje_navegar", "parametros": { "destino": "Processo > Peticionamento > Novo Processo", "tribunal": "TRT8" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const destino = String(params['destino'] || '').trim();
        const tribunal = String(params['tribunal'] || '');

        if (!destino) {
            return { sucesso: false, erro: 'Destino obrigatório.', mensagem: 'Informe o destino da navegação.' };
        }

        console.log(`[pje_navegar] Destino: "${destino}" ${tribunal ? `(${tribunal})` : ''}`);

        // Resolve URL na ordem de prioridade:
        // 1. Route Memory (aprendido pelo uso — mais confiável)
        // 2. tribunal-urls.ts (estático)
        const routes = resolveTribunalRoutes(tribunal);
        const urlDireta = lookupRoute(tribunal, destino) ?? resolveDestinationUrl(routes, destino);

        if (urlDireta) {
            console.log(`[pje_navegar] URL direta encontrada: ${urlDireta}`);
            try {
                await ensureBrowser();
                const page = getActivePage();
                if (page && typeof page.goto === 'function') {
                    // waitUntil:'domcontentloaded' — não espera recursos externos (mais rápido e mais seguro)
                    // timeout:15000 — se não carregar em 15s, cai no fallback
                    await page.goto(urlDireta, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    const finalUrl: string = page.url?.() ?? urlDireta;
                    // Verifica se foi redirecionado para login (não está logado)
                    if (finalUrl.includes('login') || finalUrl.includes('Login')) {
                        return {
                            sucesso: false,
                            erro: 'Redirecionado para login',
                            mensagem: `Você precisa fazer login no PJe antes de navegar para ${destino}.`
                        };
                    }
                    saveRoute(tribunal, destino, finalUrl);
                    return {
                        sucesso: true,
                        dados: { destino, tribunal, url: finalUrl, modo: 'url_direta' },
                        mensagem: `Navegado diretamente para ${destino}.`
                    };
                }
            } catch (err: any) {
                console.warn(`[pje_navegar] Falha na URL direta, tentando agent: ${err.message}`);
            }
        }

        // Fallback: agent visual (apenas para destinos sem URL conhecida)
        const instrucao = `Você está no PJe ${tribunal ? `(${tribunal})` : ''}.
Navegue até "${destino}" o mais diretamente possível.
Se a URL exata for conhecida, use-a. Caso contrário, clique no elemento correto sem explorar desnecessariamente.`;

        try {
            const resultado = await runBrowserTask(instrucao, 8);
            // Salva a URL onde o agent chegou — aprende para a próxima vez
            try {
                const finalUrl: string = getActivePage()?.url() ?? '';
                if (finalUrl && !finalUrl.includes('login')) {
                    saveRoute(tribunal, destino, finalUrl);
                }
            } catch { /* best effort */ }
            return {
                sucesso: true,
                dados: { destino, tribunal, resultado, modo: 'agent' },
                mensagem: resultado
            };
        } catch (error: any) {
            console.error('[pje_navegar] Erro:', error.message);
            return { sucesso: false, erro: error.message, mensagem: `Erro ao navegar: ${error.message}` };
        }
    }
};

export default pjeNavegar;
