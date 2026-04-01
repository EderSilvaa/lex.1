/**
 * Skill: pje_documentos
 *
 * Extrai os documentos do processo exibido na tela atual do PJe.
 * Tenta determinístico primeiro (seletores conhecidos do PJe),
 * fallback pra runBrowserTask se a estrutura for desconhecida.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser, getActivePage, clickInFrames } from '../../browser-manager';
import { runBrowserUseTask } from '../../browser/browser-use-executor';
import { resolveSelector, confirmResolved } from '../../browser';

// Seletores conhecidos para a aba/seção de documentos no PJe
const DOCUMENTOS_TAB_SELECTORS = [
    'a:has-text("Documentos")',
    'a:has-text("Peças")',
    'a:has-text("Pecas")',
    'a:has-text("Anexos")',
    '[id*="documento"]',
    '[id*="peca"]',
    '[id*="anexo"]',
    'a[href*="documento"]',
    'li[role="tab"]:has-text("Documentos")',
];

// Seletores para o container de documentos
const DOCUMENTOS_CONTAINER_SELECTORS = [
    '[id*="documento"]',
    '[id*="peca"]',
    '[id*="anexo"]',
    '[class*="documento"]',
    '[class*="peca"]',
    'table[id*="documento"]',
    'table[id*="peca"]',
];

export const pjeDocumentos: Skill = {
    nome: 'pje_documentos',
    descricao: 'Lista os documentos do processo aberto na tela atual do PJe. Use após abrir um processo.',
    categoria: 'pje',

    parametros: {
        numero: {
            tipo: 'string',
            descricao: 'Número do processo (opcional, para contexto)',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Lista de documentos do processo: nome, tipo, data.',

    exemplos: [
        '{ "skill": "pje_documentos", "parametros": { "numero": "0801234-56.2024.8.14.0301" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const numero = String(params['numero'] || '');

        console.log(`[pje_documentos] Extraindo documentos${numero ? ` do processo ${numero}` : ''}`);

        await ensureBrowser();
        const page = getActivePage();
        if (!page) return { sucesso: false, erro: 'Browser não disponível.' };

        // Fase 1: tentar clicar na aba de documentos via resolveSelector
        const tabResolved = await resolveSelector(
            page, '', 'aba_documentos',
            DOCUMENTOS_TAB_SELECTORS, 'Documentos', 'tab'
        );
        if (tabResolved) {
            try {
                await clickInFrames(page, tabResolved.selector);
                console.log(`[pje_documentos] ✓ Aba encontrada via ${tabResolved.source}: ${tabResolved.selector}`);
                confirmResolved('', 'aba_documentos', tabResolved);
                await page.waitForTimeout(2000);
            } catch { /* ignora */ }
        }

        // Fase 2: tentar extrair dados do container de documentos via resolveSelector
        const containerResolved = await resolveSelector(
            page, '', 'container_documentos',
            DOCUMENTOS_CONTAINER_SELECTORS
        );
        const containerSelectors = containerResolved
            ? [containerResolved.selector]
            : DOCUMENTOS_CONTAINER_SELECTORS;

        for (const sel of containerSelectors) {
            try {
                const dados = await page.evaluate(
                    (containerSel: string) => {
                        const container = document.querySelector(containerSel);
                        if (!container) return null;

                        // Tenta extrair de tabela
                        const rows = container.querySelectorAll('tr');
                        if (rows.length > 1) {
                            const docs: { nome: string; tipo: string; data: string }[] = [];
                            rows.forEach((row, i) => {
                                if (i === 0 && row.querySelector('th')) return;
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 1) {
                                    // Pega texto de cada célula
                                    const texts = Array.from(cells).map(c => (c.textContent || '').trim().slice(0, 150));
                                    const dateMatch = texts.join(' ').match(/(\d{2}\/\d{2}\/\d{4})/);
                                    docs.push({
                                        nome: texts[0] || '(sem nome)',
                                        tipo: texts[1] || '',
                                        data: dateMatch?.[1] ?? (texts[2] || ''),
                                    });
                                }
                            });
                            if (docs.length > 0) return docs;
                        }

                        // Tenta extrair de lista/links
                        const links = container.querySelectorAll('a, li, [class*="item"]');
                        const docs: { nome: string; tipo: string; data: string }[] = [];
                        links.forEach(link => {
                            const text = (link.textContent || '').trim();
                            if (text.length < 3 || text.length > 300) return;
                            const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
                            docs.push({
                                nome: text.slice(0, 150),
                                tipo: '',
                                data: dateMatch?.[1] ?? '',
                            });
                        });
                        return docs.length > 0 ? docs : null;
                    },
                    sel
                );

                if (dados && dados.length > 0) {
                    console.log(`[pje_documentos] ✓ ${dados.length} documento(s) extraído(s) via seletor: ${sel}`);
                    confirmResolved('', 'container_documentos', containerResolved);
                    const lines = dados.map((d: any, i: number) =>
                        `${i + 1}. ${d.nome}${d.tipo ? ` (${d.tipo})` : ''}${d.data ? ` — ${d.data}` : ''}`
                    );
                    return {
                        sucesso: true,
                        dados: { numero, documentos: dados, total: dados.length, modo: 'deterministico' },
                        mensagem: `${dados.length} documento(s):\n${lines.join('\n')}`
                    };
                }
            } catch { /* tenta próximo */ }
        }

        // Fase 3: fallback pro vision agent
        console.log('[pje_documentos] Seletores determinísticos não funcionaram, usando vision agent...');

        const instrucao = `
Você está visualizando um processo no PJe (sistema judicial brasileiro)${numero ? ` (processo ${numero})` : ''}.

Objetivo: Extrair a lista de documentos do processo.

- Localize a aba ou seção de documentos (pode estar em "Documentos", "Peças", "Anexos" ou similar)
- Clique nela se necessário para expandir
- Liste todos os documentos visíveis: nome/tipo, data de inclusão, quem enviou
- Retorne em formato estruturado (JSON ou lista clara)
        `.trim();

        try {
            const res = await runBrowserUseTask({ task: instrucao, maxSteps: 15 });
            const resultado = res.result;
            return { sucesso: true, dados: { numero, resultado, modo: 'vision' }, mensagem: resultado };
        } catch (error: any) {
            return { sucesso: false, erro: error.message, mensagem: `Erro ao extrair documentos: ${error.message}` };
        }
    }
};

export default pjeDocumentos;
