/**
 * Skill: browser_scroll
 *
 * Faz scroll na página atual. Essencial para PJe que tem tabelas longas,
 * listas de movimentações e formulários extensos.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser } from '../../browser-manager';

export const browserScroll: Skill = {
    nome: 'browser_scroll',
    descricao: 'Faz scroll na página do browser. Use para ver conteúdo abaixo da dobra, carregar mais itens em listas, ou navegar formulários longos.',
    categoria: 'browser',

    parametros: {
        direcao: {
            tipo: 'string',
            descricao: 'Direção do scroll.',
            obrigatorio: false,
            default: 'baixo',
            enum: ['baixo', 'cima', 'inicio', 'fim']
        },
        quantidade: {
            tipo: 'number',
            descricao: 'Pixels para scroll (ignorado se direcao for inicio/fim). Default: 500.',
            obrigatorio: false,
            default: 500
        },
        seletor: {
            tipo: 'string',
            descricao: 'Seletor CSS do container para scroll (ex: ".tabela-resultados"). Se vazio, faz scroll na página.',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Posição de scroll após a ação e informações sobre a página.',

    exemplos: [
        '{ "skill": "browser_scroll", "parametros": { "direcao": "baixo" } }',
        '{ "skill": "browser_scroll", "parametros": { "direcao": "fim" } }',
        '{ "skill": "browser_scroll", "parametros": { "direcao": "baixo", "quantidade": 1000, "seletor": "#lista-movimentacoes" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const direcao = String(params['direcao'] || 'baixo');
            const quantidade = Number(params['quantidade'] || 500);
            const seletor = String(params['seletor'] || '');

            const scrollInfo = await page.evaluate(
                ({ direcao, quantidade, seletor }: { direcao: string; quantidade: number; seletor: string }) => {
                    const target = seletor ? document.querySelector(seletor) : null;
                    const el = target || document.documentElement;

                    const before = target ? target.scrollTop : window.scrollY;

                    switch (direcao) {
                        case 'baixo':
                            target ? (target.scrollTop += quantidade) : window.scrollBy(0, quantidade);
                            break;
                        case 'cima':
                            target ? (target.scrollTop -= quantidade) : window.scrollBy(0, -quantidade);
                            break;
                        case 'inicio':
                            target ? (target.scrollTop = 0) : window.scrollTo(0, 0);
                            break;
                        case 'fim':
                            target ? (target.scrollTop = target.scrollHeight) : window.scrollTo(0, document.body.scrollHeight);
                            break;
                    }

                    const after = target ? target.scrollTop : window.scrollY;
                    const maxScroll = target
                        ? target.scrollHeight - target.clientHeight
                        : document.body.scrollHeight - window.innerHeight;

                    return {
                        scrollBefore: Math.round(before),
                        scrollAfter: Math.round(after),
                        maxScroll: Math.round(maxScroll),
                        atTop: after <= 0,
                        atBottom: after >= maxScroll - 5,
                        percentual: maxScroll > 0 ? Math.round((after / maxScroll) * 100) : 100
                    };
                },
                { direcao, quantidade, seletor }
            );

            const posLabel = scrollInfo.atTop ? 'topo' : scrollInfo.atBottom ? 'fim' : `${scrollInfo.percentual}%`;

            return {
                sucesso: true,
                dados: scrollInfo,
                mensagem: `Scroll ${direcao} — posição: ${posLabel} (${scrollInfo.scrollAfter}/${scrollInfo.maxScroll}px)`
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserScroll;
