/**
 * Skill: pje_movimentacoes
 *
 * Extrai as movimentações do processo exibido na tela atual do PJe.
 * Tenta determinístico primeiro (seletores conhecidos do PJe),
 * fallback pra runBrowserTask se a estrutura for desconhecida.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser, getActivePage, clickInFrames, runBrowserTask } from '../../browser-manager';
import { resolveSelector, confirmResolved } from '../../browser';

// Seletores conhecidos para a aba/seção de movimentações no PJe
const MOVIMENTACOES_TAB_SELECTORS = [
    'a:has-text("Movimentações")',
    'a:has-text("Movimentacoes")',
    'a:has-text("Andamentos")',
    'a:has-text("Timeline")',
    '[id*="movimentac"]',
    '[id*="andamento"]',
    'a[href*="movimentac"]',
    'li[role="tab"]:has-text("Movimentações")',
];

// Seletores para o container de movimentações
const MOVIMENTACOES_CONTAINER_SELECTORS = [
    '[id*="movimentac"]',
    '[id*="andamento"]',
    '[class*="movimentac"]',
    '[class*="timeline"]',
    'table[id*="movimentac"]',
    '.lista-movimentacoes',
];

export const pjeMovimentacoes: Skill = {
    nome: 'pje_movimentacoes',
    descricao: 'Lista as movimentações processuais do processo aberto na tela atual do PJe. Use após consultar ou abrir um processo.',
    categoria: 'pje',

    parametros: {
        limite: {
            tipo: 'number',
            descricao: 'Número máximo de movimentações a retornar (default: 10)',
            obrigatorio: false,
            default: 10
        },
        numero: {
            tipo: 'string',
            descricao: 'Número do processo (opcional, para contexto)',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Lista de movimentações: data, tipo, descrição.',

    exemplos: [
        '{ "skill": "pje_movimentacoes", "parametros": { "limite": 10 } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const limite = Number(params['limite'] || 10);
        const numero = String(params['numero'] || '');

        console.log(`[pje_movimentacoes] Extraindo movimentações${numero ? ` do processo ${numero}` : ''}`);

        await ensureBrowser();
        const page = getActivePage();
        if (!page) return { sucesso: false, erro: 'Browser não disponível.' };

        // Fase 1: tentar clicar na aba de movimentações via resolveSelector
        const tabResolved = await resolveSelector(
            page, '', 'aba_movimentacoes',
            MOVIMENTACOES_TAB_SELECTORS, 'Movimentações', 'tab'
        );
        if (tabResolved) {
            try {
                await clickInFrames(page, tabResolved.selector);
                console.log(`[pje_movimentacoes] ✓ Aba encontrada via ${tabResolved.source}: ${tabResolved.selector}`);
                confirmResolved('', 'aba_movimentacoes', tabResolved);
                await page.waitForTimeout(2000);
            } catch { /* ignora */ }
        }

        // Fase 2: tentar extrair dados do container de movimentações via resolveSelector
        const containerResolved = await resolveSelector(
            page, '', 'container_movimentacoes',
            MOVIMENTACOES_CONTAINER_SELECTORS
        );
        const containerSelectors = containerResolved
            ? [containerResolved.selector]
            : MOVIMENTACOES_CONTAINER_SELECTORS;

        for (const sel of containerSelectors) {
            try {
                const dados = await page.evaluate(
                    ({ containerSel, lim }: { containerSel: string; lim: number }) => {
                        const container = document.querySelector(containerSel);
                        if (!container) return null;

                        // Tenta extrair de tabela
                        const rows = container.querySelectorAll('tr');
                        if (rows.length > 1) {
                            const movs: { data: string; tipo: string; descricao: string }[] = [];
                            rows.forEach((row, i) => {
                                if (i === 0 && row.querySelector('th')) return; // skip header
                                if (movs.length >= lim) return;
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 2) {
                                    movs.push({
                                        data: (cells[0]?.textContent || '').trim().slice(0, 30),
                                        tipo: (cells[1]?.textContent || '').trim().slice(0, 80),
                                        descricao: (cells[2]?.textContent || cells[1]?.textContent || '').trim().slice(0, 200),
                                    });
                                }
                            });
                            if (movs.length > 0) return movs;
                        }

                        // Tenta extrair de lista/divs
                        const items = container.querySelectorAll('li, [class*="item"], [class*="mov"], div > div');
                        const movs: { data: string; tipo: string; descricao: string }[] = [];
                        items.forEach(item => {
                            if (movs.length >= lim) return;
                            const text = (item.textContent || '').trim();
                            if (text.length < 10) return;
                            const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
                            movs.push({
                                data: dateMatch?.[1] ?? '',
                                tipo: '',
                                descricao: text.slice(0, 300),
                            });
                        });
                        return movs.length > 0 ? movs : null;
                    },
                    { containerSel: sel, lim: limite }
                );

                if (dados && dados.length > 0) {
                    console.log(`[pje_movimentacoes] ✓ ${dados.length} movimentação(ões) extraídas via seletor: ${sel}`);
                    confirmResolved('', 'container_movimentacoes', containerResolved);
                    const lines = dados.map((m: any, i: number) =>
                        `${i + 1}. ${m.data ? `[${m.data}] ` : ''}${m.tipo ? `${m.tipo}: ` : ''}${m.descricao}`
                    );
                    return {
                        sucesso: true,
                        dados: { numero, movimentacoes: dados, total: dados.length, modo: 'deterministico' },
                        mensagem: `${dados.length} movimentação(ões):\n${lines.join('\n')}`
                    };
                }
            } catch { /* tenta próximo */ }
        }

        // Fase 3: fallback pro vision agent
        console.log('[pje_movimentacoes] Seletores determinísticos não funcionaram, usando vision agent...');

        const instrucao = `
Você está visualizando um processo no PJe (sistema judicial brasileiro)${numero ? ` (processo ${numero})` : ''}.

Objetivo: Extrair as últimas ${limite} movimentações processuais.

- Localize a aba ou seção de movimentações/andamentos (pode estar em "Movimentações", "Andamentos", "Timeline" ou similar)
- Clique nela se necessário para expandir
- Liste as ${limite} movimentações mais recentes: data, tipo de movimentação, descrição completa
- Retorne em formato estruturado (JSON ou lista ordenada por data)
        `.trim();

        try {
            const resultado = await runBrowserTask(instrucao, 15);
            return { sucesso: true, dados: { numero, limite, resultado, modo: 'vision' }, mensagem: resultado };
        } catch (error: any) {
            return { sucesso: false, erro: error.message, mensagem: `Erro ao extrair movimentações: ${error.message}` };
        }
    }
};

export default pjeMovimentacoes;
