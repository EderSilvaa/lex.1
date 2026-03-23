/**
 * Skill: pje_consultar
 *
 * Consulta processo no PJe via Playwright direto.
 * Navega, preenche e extrai dados de forma determinística.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser, injectOverlay, getActivePage } from '../../browser-manager';
import { resolveTribunalRoutes } from '../../pje/tribunal-urls';
import { agentEmitter } from '../../agent/loop';
import { resolveSelector, confirmResolved } from '../../browser';

function emitProgress(step: string): void {
    agentEmitter.emit('agent-event', { type: 'thinking', pensamento: `🌐 ${step}`, iteracao: 0 });
    injectOverlay(step);
}

// Seletores conhecidos do PJe JSF para o campo de número do processo
const NUM_PROCESSO_SELECTORS = [
    'input[id*="numeroProcesso"]',
    'input[id*="numProcesso"]',
    'input[id*="Processo"][type="text"]',
    'input[name*="numeroProcesso"]',
    'input[name*="numProcesso"]',
    'input[placeholder*="rocesso"]',
    'input[placeholder*="úmero"]',
    'input[placeholder*="umero"]',
];

// Seletores para botão de pesquisa
const PESQUISAR_SELECTORS = [
    'input[id*="pesquisar"][type="submit"]',
    'button[id*="pesquisar"]',
    'input[value*="esquisa"]',
    'input[value*="uscar"]',
    'button[type="submit"]',
    'input[type="submit"]',
];

export const pjeConsultar: Skill = {
    nome: 'pje_consultar',
    descricao: 'Consulta informações de um processo no PJe. Navega até a tela de consulta, preenche o número e extrai os dados.',
    categoria: 'pje',

    parametros: {
        numero: {
            tipo: 'string',
            descricao: 'Número do processo (formato CNJ: NNNNNNN-NN.NNNN.N.NN.NNNN)',
            obrigatorio: true
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA, TRF1).',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Dados do processo: partes, classe, assunto, movimentações recentes.',

    exemplos: [
        '{ "skill": "pje_consultar", "parametros": { "numero": "0801234-56.2024.8.14.0301", "tribunal": "TJPA" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const numero = String(params['numero'] || '').trim();
        const tribunal = String(params['tribunal'] || '');

        if (!numero) {
            return { sucesso: false, erro: 'Número do processo obrigatório.', mensagem: 'Informe o número do processo.' };
        }

        await ensureBrowser();

        const page = getActivePage();
        if (!page) throw new Error('Browser não disponível');

        const routes = resolveTribunalRoutes(tribunal);
        const consultaUrl = routes.consultaUrl;

        console.log(`[pje_consultar] Consultando processo ${numero} em ${consultaUrl}`);
        emitProgress('Navegando para consulta...');

        try {
            // 1. Navega para a página de consulta
            await page.goto(consultaUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForTimeout(2000);

            emitProgress('Procurando campo de número...');

            // 2. Encontra o campo de número do processo via resolveSelector (3-tier waterfall)
            const numResolved = await resolveSelector(
                page, tribunal, 'campo_numero_processo',
                NUM_PROCESSO_SELECTORS, 'Número do Processo', 'input'
            );

            let numInput: any = null;
            if (numResolved) {
                numInput = await page.$(numResolved.selector);
                // Tenta iframes se não encontrou no main
                if (!numInput) {
                    for (const frame of page.frames()) {
                        numInput = await frame.$(numResolved.selector);
                        if (numInput) break;
                    }
                }
            }

            if (!numInput) {
                // Fallback: qualquer input de texto visível
                const allInputs = await page.$$('input[type="text"]:visible, input:not([type]):visible');
                numInput = allInputs[0] ?? null;
            }

            if (!numInput) {
                const url = page.url();
                return {
                    sucesso: false,
                    erro: 'Campo de número do processo não encontrado',
                    mensagem: `Não encontrei o campo de busca na página de consulta. URL atual: ${url}`,
                };
            }

            // 3. Preenche o número
            emitProgress(`Preenchendo: ${numero}`);
            await numInput.click();
            await page.waitForTimeout(300);
            await numInput.fill('');
            await numInput.type(numero, { delay: 30 });
            await page.waitForTimeout(500);

            confirmResolved(tribunal, 'campo_numero_processo', numResolved);

            // 4. Clica em Pesquisar via resolveSelector
            emitProgress('Pesquisando...');
            const btnResolved = await resolveSelector(
                page, tribunal, 'botao_pesquisar',
                PESQUISAR_SELECTORS, 'Pesquisar', 'button'
            );

            let searched = false;
            if (btnResolved) {
                try {
                    const btn = await page.$(btnResolved.selector);
                    if (btn) {
                        await btn.click();
                        searched = true;
                        confirmResolved(tribunal, 'botao_pesquisar', btnResolved);
                    }
                } catch { /* fallback Enter */ }
            }
            if (!searched) {
                await page.keyboard.press('Enter');
            }

            // 5. Aguarda resultados
            await page.waitForTimeout(3000);
            emitProgress('Extraindo dados...');

            // 6. Extrai texto da página (dados do processo)
            const texto: string = await page.evaluate(() => {
                // Remove scripts, styles, forms desnecessários
                const clone = document.body.cloneNode(true) as HTMLElement;
                clone.querySelectorAll('script, style, nav, header, footer').forEach((el: any) => el.remove());
                return (clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
            });

            // 7. Tenta clicar no primeiro resultado se aparecer lista
            try {
                const linhaProcesso = await page.$(`a[href*="processo"], tr[onclick], td[onclick]`);
                if (linhaProcesso) {
                    await linhaProcesso.click();
                    await page.waitForTimeout(2000);
                    const textoDetalhe: string = await page.evaluate(() => {
                        const clone = document.body.cloneNode(true) as HTMLElement;
                        clone.querySelectorAll('script, style, nav').forEach((el: any) => el.remove());
                        return (clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
                    });
                    injectOverlay('Processo encontrado', true);
                    return {
                        sucesso: true,
                        dados: { numero, tribunal, url: page.url() },
                        mensagem: textoDetalhe || 'Processo aberto no browser.'
                    };
                }
            } catch { /* sem resultado clicável — retorna o texto da lista */ }

            injectOverlay(texto.length > 20 ? 'Dados extraídos' : 'Sem resultados', true);
            return {
                sucesso: true,
                dados: { numero, tribunal, url: page.url() },
                mensagem: texto || 'Consulta executada. Veja o browser para os resultados.'
            };

        } catch (error: any) {
            console.error('[pje_consultar] Erro:', error.message);
            injectOverlay('Erro na consulta', true);
            return { sucesso: false, erro: error.message, mensagem: `Erro ao consultar processo: ${error.message}` };
        }
    }
};

export default pjeConsultar;
