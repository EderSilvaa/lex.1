/**
 * Skill: pje_preencher
 *
 * Preenche campos de formulário na tela atual do PJe.
 * Tenta determinístico primeiro (seletores CSS por label/placeholder/aria),
 * fallback pra runBrowserTask (vision agent) se necessário.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser, getActivePage, fillInFrames, clickInFrames, runBrowserTask } from '../../browser-manager';
import { resolveSelector, confirmResolved, recordSuccess } from '../../browser';

// Seletores para localizar input por label text
function buildLabelSelectors(label: string): string[] {
    const escaped = label.replace(/['"]/g, '');
    return [
        `label:has-text("${escaped}") input`,
        `label:has-text("${escaped}") select`,
        `label:has-text("${escaped}") textarea`,
        `input[placeholder*="${escaped}" i]`,
        `input[aria-label*="${escaped}" i]`,
        `textarea[placeholder*="${escaped}" i]`,
        `select[aria-label*="${escaped}" i]`,
    ];
}

export const pjePreencher: Skill = {
    nome: 'pje_preencher',
    descricao: 'Preenche campos de formulário na tela atual do PJe. Use para preencher Jurisdição, Classe, Assunto, CPF, etc.',
    categoria: 'pje',

    parametros: {
        campos: {
            tipo: 'object',
            descricao: 'Dicionário com Nome do Campo → Valor. Ex: { "Jurisdição": "Belém", "Classe judicial": "Rito Ordinário" }',
            obrigatorio: true
        }
    },

    retorno: 'Status de preenchimento de cada campo.',

    exemplos: [
        '{ "skill": "pje_preencher", "parametros": { "campos": { "Jurisdição": "Belém", "Classe judicial": "Rito Ordinário" } } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const campos = params['campos'];
        if (!campos || typeof campos !== 'object' || Object.keys(campos).length === 0) {
            return { sucesso: false, erro: 'Parâmetro "campos" obrigatório.', mensagem: 'Informe os campos e valores para preencher.' };
        }

        console.log(`[pje_preencher] Campos: ${Object.keys(campos).join(', ')}`);

        await ensureBrowser();
        const page = getActivePage();
        if (!page) return { sucesso: false, erro: 'Browser não disponível.' };

        const preenchidos: string[] = [];
        const pendentes: Record<string, string> = {};

        // Normaliza nome do campo para context key
        function normalizeContext(campo: string): string {
            return 'campo_' + campo
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/g, '_')
                .replace(/_+/g, '_')
                .trim();
        }

        // Fase 1: tentar preencher cada campo via resolveSelector
        for (const [campo, valor] of Object.entries(campos)) {
            const valorStr = String(valor);
            const selectors = buildLabelSelectors(campo);
            const ctx = normalizeContext(campo);
            let filled = false;

            // Tenta resolveSelector (learned → hardcoded → discovery)
            const resolved = await resolveSelector(
                page, '', ctx, selectors, campo, 'input'
            );

            if (resolved) {
                try {
                    await fillInFrames(page, resolved.selector, valorStr);
                    preenchidos.push(campo);
                    filled = true;
                    console.log(`[pje_preencher] ✓ "${campo}" preenchido via ${resolved.source}: ${resolved.selector}`);
                    confirmResolved('', ctx, resolved);
                } catch {
                    // fillInFrames falhou com o seletor resolvido — tenta fallback manual
                }
            }

            // Fallback: tenta cada seletor manualmente se resolveSelector não preencheu
            if (!filled) {
                for (const sel of selectors) {
                    try {
                        await fillInFrames(page, sel, valorStr);
                        preenchidos.push(campo);
                        filled = true;
                        recordSuccess('', ctx, sel);
                        console.log(`[pje_preencher] ✓ "${campo}" preenchido via fallback: ${sel}`);
                        break;
                    } catch { /* tenta próximo seletor */ }
                }
            }

            if (!filled) {
                pendentes[campo] = valorStr;
            }
        }

        // Fase 2: fallback pro vision agent se sobrou campos
        if (Object.keys(pendentes).length > 0) {
            console.log(`[pje_preencher] ${Object.keys(pendentes).length} campo(s) pendente(s), usando vision agent...`);

            const listaCampos = Object.entries(pendentes)
                .map(([campo, valor]) => `- "${campo}": "${valor}"`)
                .join('\n');

            const instrucao = `
Você está em um formulário do PJe (sistema judicial brasileiro).

Objetivo: Preencher os seguintes campos com os valores indicados:
${listaCampos}

Instruções:
- Para cada campo, localize-o na tela pelo rótulo/label visível
- Clique no campo e preencha com o valor
- Para campos do tipo select/dropdown, selecione a opção que corresponde ao valor
- Para campos com autocomplete, digite o valor e aguarde as sugestões aparecerem, então selecione a correta
- Confirme que todos os campos foram preenchidos corretamente
            `.trim();

            try {
                const resultado = await runBrowserTask(instrucao, 15);
                preenchidos.push(...Object.keys(pendentes));
                return {
                    sucesso: true,
                    dados: { campos, preenchidos, viaVision: Object.keys(pendentes), resultado },
                    mensagem: `${preenchidos.length} campo(s) preenchido(s). ${Object.keys(pendentes).length} via vision agent.`
                };
            } catch (error: any) {
                return {
                    sucesso: false,
                    erro: error.message,
                    mensagem: `Preenchidos: ${preenchidos.join(', ') || 'nenhum'}. Falha nos demais: ${error.message}`
                };
            }
        }

        return {
            sucesso: true,
            dados: { campos, preenchidos, viaVision: [] },
            mensagem: `${preenchidos.length} campo(s) preenchido(s) com sucesso (todos determinísticos).`
        };
    }
};

export default pjePreencher;
